import os
import time
import uuid
from pathlib import Path
from celery import Celery
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from app.config import get_settings
from app.database import SessionLocal
from app.models import Application, Job, Profile, Resume, User
from app.services.events import event

settings = get_settings()
celery_app = Celery("autoapply", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    broker_connection_retry_on_startup=True,
    task_always_eager=settings.queue_eager,
)


def save_jobs(db, rows: list[dict]) -> int:
    for job in rows:
        stmt = insert(Job).values(**job)
        stmt = stmt.on_conflict_do_update(
            index_elements=[Job.source, Job.external_id],
            set_={
                "title": stmt.excluded.title,
                "company": stmt.excluded.company,
                "location": stmt.excluded.location,
                "modality": stmt.excluded.modality,
                "seniority": stmt.excluded.seniority,
                "description": stmt.excluded.description,
                "url": stmt.excluded.url,
            },
        )
        db.execute(stmt)
    db.commit()
    return len(rows)


@celery_app.task(name="autoapply.discover_jobs", queue="default")
def discover_jobs():
    from app.connectors.discovery import discover
    rows, errors = discover()
    with SessionLocal() as db:
        count = save_jobs(db, rows)
    return {"processed": count, "errors": errors}


@celery_app.task(name="autoapply.process_resume", queue="default")
def process_resume(resume_id: str):
    from app.services.resume import read_resume, extract_resume
    with SessionLocal() as db:
        resume = db.get(Resume, uuid.UUID(resume_id))
        if not resume:
            return {"error": "Resume not found"}
        try:
            resume.status = "processing"
            db.commit()
            content = read_resume(resume.path)
            proposed = extract_resume(content)
            resume.extracted = proposed
            resume.status = "processed"
            resume.error = None
        except Exception as exc:
            resume.status = "failed"
            resume.error = str(exc)[:350]
        db.commit()
        return {"status": resume.status}


@celery_app.task(name="autoapply.index_profile", queue="default")
def index_profile(user_id: str, expected_version: int):
    from app.services.rag import index_profile as index_facts
    with SessionLocal() as db:
        profile = db.scalar(select(Profile).where(Profile.user_id == uuid.UUID(user_id)))
        if profile is None or profile.version != expected_version:
            return {"status": "stale"}
        index_facts(db, profile.user_id, profile.version, profile.data)
        return {"status": "indexed"}


@celery_app.task(name="autoapply.prepare_application", queue="default")
def prepare_application(app_id: str, generate_cover_letter: bool = True):
    from langgraph.checkpoint.postgres import PostgresSaver
    from app.agents.graph import build_graph
    application_uuid = uuid.UUID(app_id)
    with SessionLocal() as db:
        a = db.get(Application, application_uuid)
        if not a or a.status != "processing":
            return {"status": "not_pending"}
        profile = db.scalar(select(Profile).where(Profile.user_id == a.user_id))
        job = db.get(Job, a.job_id)
        if not profile or not job:
            a.status = "failed"
            a.error = "Perfil ou vaga indisponível"
            db.commit()
            return {"status": "failed"}
        state = {
            "application_id": app_id,
            "user_id": str(a.user_id),
            "profile": profile.data,
            "job": {
                "title": job.title,
                "company": job.company,
                "description": job.description,
                "modality": job.modality,
            },
            "questions": a.questions,
            "generate_cover_letter": generate_cover_letter,
        }
    try:
        with PostgresSaver.from_conn_string(settings.checkpoint_dsn) as saver:
            saver.setup()
            # Clear any previous checkpoint thread so retries always run cleanly.
            try:
                saver.delete_thread(app_id)
            except Exception:
                pass
            graph = build_graph(saver)
            config = {"configurable": {"thread_id": app_id}}
            graph.invoke(state, config=config)
            result = graph.get_state(config).values
        with SessionLocal() as db:
            a = db.get(Application, application_uuid)
            a.match_score = result.get("match_score")
            a.match_reasons = result.get("match_reasons", [])
            a.answers = result.get("answers", [])
            if generate_cover_letter or result.get("cover_letter"):
                a.cover_letter = result.get("cover_letter") or a.cover_letter
            a.status = "awaiting_approval"
            a.error = None
            event(db, a.id, "prepared", {"score": a.match_score, "answers_count": len(a.answers)})
            db.commit()
        return {"status": "awaiting_approval"}
    except Exception as exc:
        with SessionLocal() as db:
            a = db.get(Application, application_uuid)
            if a:
                a.status = "failed"
                a.error = f"Falha na preparação: {type(exc).__name__}: {str(exc)[:170]}"
                event(db, a.id, "preparation_failed", {"error": type(exc).__name__})
                db.commit()
        return {"status": "failed"}


@celery_app.task(name="autoapply.submit_sandbox", queue="browser")
def submit_sandbox(app_id: str):
    """Browser automation restricted to the first-party sandbox test form, capturing screenshot proof."""
    from playwright.sync_api import sync_playwright
    import jwt

    application_uuid = uuid.UUID(app_id)
    with SessionLocal() as db:
        a = db.get(Application, application_uuid)
        if not a or a.status != "submitting" or not a.approved:
            return {"error": "Invalid submission state"}
        job = db.get(Job, a.job_id)
        if not job or job.source != "sandbox":
            return {"error": "Only sandbox applications supported"}
        profile = db.scalar(select(Profile).where(Profile.user_id == a.user_id))
        user = db.get(User, a.user_id)
        resume = None
        if a.resume_id:
            resume = db.scalar(
                select(Resume).where(
                    Resume.id == a.resume_id,
                    Resume.user_id == a.user_id,
                    Resume.status == "processed",
                )
            )
        if not resume:
            resume = db.scalar(
                select(Resume)
                .where(Resume.user_id == a.user_id, Resume.status == "processed")
                .order_by(Resume.created_at.desc())
            )
        if not profile or not resume:
            a.status = "failed"
            a.error = "Perfil ou currículo processado indisponível"
            event(db, a.id, "sandbox_failed", {"reason": "missing_profile_or_resume"})
            db.commit()
            return {"status": "failed"}
        user_id_str = str(a.user_id)
        name = profile.data.get("name") or user.email.split("@")[0]
        email = user.email
        motivation = (
            a.cover_letter
            or (a.answers[0].get("answer") if a.answers else "")
            or "Candidatura de demonstração."
        )
        resume_path = resume.path

    token = jwt.encode(
        {"sub": app_id, "kind": "sandbox", "exp": time.time() + 600},
        settings.jwt_secret,
        algorithm="HS256",
    )
    url = f"{settings.public_api_url}/sandbox/apply/{app_id}?token={token}"
    proof_dir = Path(settings.storage_dir) / user_id_str / "proofs"
    proof_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    proof_file = proof_dir / f"{app_id}.png"

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(accept_downloads=False, viewport={"width": 1100, "height": 760})
            page = context.new_page()
            page.goto(url, wait_until="domcontentloaded", timeout=30000)
            page.locator("#full_name").fill(name[:150])
            page.locator("#email").fill(email)
            page.locator("#motivation").fill(motivation[:1200])
            page.locator("#resume").set_input_files(resume_path)
            page.get_by_role("button", name="Enviar candidatura de teste").click()
            page.locator("#confirmation").wait_for(timeout=20000)
            receipt = page.locator("#confirmation").get_attribute("data-receipt")
            page.screenshot(path=str(proof_file), full_page=True)
            os.chmod(proof_file, 0o600)
            context.close()
            browser.close()
        if not receipt:
            raise RuntimeError("Formulário não retornou recibo")
        with SessionLocal() as db:
            a = db.get(Application, application_uuid)
            a.status = "submitted"
            a.stage = "confirmed"
            a.external_receipt = receipt
            a.proof_path = str(proof_file)
            a.error = None
            event(db, a.id, "sandbox_submitted", {"receipt": receipt, "has_proof": True})
            db.commit()
        return {"status": "submitted", "receipt": receipt}
    except Exception as exc:
        # A failure after click may mean remote success: never automatically retry.
        with SessionLocal() as db:
            a = db.get(Application, application_uuid)
            if a:
                a.status = "unknown"
                a.error = f"Verifique o recibo antes de tentar novamente: {type(exc).__name__}"
                event(db, a.id, "submission_uncertain", {"error": type(exc).__name__})
                db.commit()
        return {"status": "unknown"}
