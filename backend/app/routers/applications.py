import uuid
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import FileResponse
from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.types import Command
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.config import get_settings
from app.database import get_db
from app.models import User, Job, Application, ApplicationEvent, Resume
from app.security import current_user
from app.schemas import (
    ApplicationCreateIn,
    ApprovalIn,
    ApplicationRetryIn,
    ApplicationQuestionAddIn,
    MarkManualIn,
    ApplicationTrackingIn,
)
from app.serializers import serialize_application
from app.services.events import event
from app.services.rag import retrieve_evidence, answer_question
from app.tasks import prepare_application, submit_sandbox
from app.agents.graph import build_graph
from app.connectors.policies import may_automate_submission

router = APIRouter(prefix="/api/v1/applications", tags=["applications"])
settings = get_settings()


def owned(db, user, app_id):
    a = db.scalar(
        select(Application).where(Application.id == app_id, Application.user_id == user.id)
    )
    if not a:
        raise HTTPException(404, "Candidatura não encontrada")
    return a


def _resolve_resume_id(db: Session, user: User, resume_id_str: str | None) -> uuid.UUID | None:
    if not resume_id_str:
        return None
    try:
        rid = uuid.UUID(resume_id_str)
    except ValueError:
        raise HTTPException(422, "Identificador de currículo inválido")
    resume = db.scalar(select(Resume).where(Resume.id == rid, Resume.user_id == user.id))
    if not resume:
        raise HTTPException(404, "Currículo não encontrado")
    return resume.id


@router.get("")
def list_applications(db: Session = Depends(get_db), user: User = Depends(current_user)):
    rows = db.scalars(
        select(Application)
        .where(Application.user_id == user.id)
        .order_by(Application.created_at.desc())
        .limit(200)
    ).all()
    return [serialize_application(a, db.get(Job, a.job_id)) for a in rows]


@router.post("", status_code=202)
def create_application(
    body: ApplicationCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    try:
        job_id = uuid.UUID(body.job_id)
    except ValueError:
        raise HTTPException(422, "Identificador de vaga inválido")
    job = db.get(Job, job_id)
    if not job:
        raise HTTPException(404, "Vaga não encontrada")
    existing = db.scalar(
        select(Application).where(Application.user_id == user.id, Application.job_id == job.id)
    )
    if existing:
        return {"id": str(existing.id), "status": existing.status, "already_exists": True}
    resume_id = _resolve_resume_id(db, user, body.resume_id)
    questions = [q.strip()[:500] for q in body.questions if q.strip()]
    a = Application(
        user_id=user.id,
        job_id=job.id,
        resume_id=resume_id,
        questions=questions,
        status="processing",
    )
    db.add(a)
    db.flush()
    event(db, a.id, "created", {"source": job.source, "questions_count": len(questions)})
    db.commit()
    prepare_application.apply_async(args=[str(a.id), body.generate_cover_letter], queue="default")
    return {"id": str(a.id), "status": "processing"}


@router.get("/{application_id}")
def get_application(
    application_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    a = owned(db, user, application_id)
    return serialize_application(a, db.get(Job, a.job_id))


@router.get("/{application_id}/events")
def get_events(
    application_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    owned(db, user, application_id)
    rows = db.scalars(
        select(ApplicationEvent)
        .where(ApplicationEvent.application_id == application_id)
        .order_by(ApplicationEvent.created_at)
    ).all()
    return [
        {"event": e.event_type, "details": e.details, "at": e.created_at.isoformat()}
        for e in rows
    ]


@router.post("/{application_id}/approve")
def approve(
    application_id: uuid.UUID,
    body: ApprovalIn,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    a = owned(db, user, application_id)
    if a.status != "awaiting_approval":
        raise HTTPException(409, "Candidatura não está aguardando aprovação")
    # Validate answer edits BEFORE resuming the graph to prevent split-brain state.
    answers = a.answers
    if body.answers is not None:
        if len(body.answers) != len(a.answers):
            raise HTTPException(422, "A quantidade de respostas não coincide com as perguntas")
        answers = []
        for index, item in enumerate(body.answers):
            content = str(item.get("answer", ""))[:3000]
            if body.approved and not content.strip():
                raise HTTPException(422, "Respostas aprovadas não podem estar vazias")
            answers.append({**a.answers[index], "answer": content, "requires_review": False})
    try:
        with PostgresSaver.from_conn_string(settings.checkpoint_dsn) as saver:
            graph = build_graph(saver)
            result = graph.invoke(
                Command(resume=body.approved),
                config={"configurable": {"thread_id": str(a.id)}},
            )
            if result.get("status") not in {"ready", "rejected"}:
                raise ValueError("Checkpoint não pôde ser retomado")
    except Exception as exc:
        raise HTTPException(409, "Não foi possível retomar a aprovação: " + type(exc).__name__)
    a.answers = answers
    if body.cover_letter is not None:
        a.cover_letter = body.cover_letter.strip()[:5000]
    a.approved = body.approved
    a.status = "ready" if body.approved else "rejected"
    a.error = None
    event(db, a.id, "approved" if body.approved else "rejected")
    db.commit()
    return serialize_application(a, db.get(Job, a.job_id))


@router.post("/{application_id}/retry", status_code=202)
def retry_application(
    application_id: uuid.UUID,
    body: ApplicationRetryIn | None = Body(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    a = owned(db, user, application_id)
    if a.status not in {"failed", "unknown", "rejected", "awaiting_approval"}:
        raise HTTPException(409, "Apenas candidaturas com falha, rejeitadas, incertas ou em revisão podem ser reprocessadas")
    if body and body.questions is not None:
        cleaned = [q.strip()[:500] for q in body.questions if q.strip()]
        if cleaned:
            a.questions = cleaned
    if body and body.resume_id is not None:
        a.resume_id = _resolve_resume_id(db, user, body.resume_id)
    prev_status = a.status
    a.status = "processing"
    a.approved = False
    a.error = None
    event(db, a.id, "retried", {"previous_status": prev_status})
    db.commit()
    gen_cover = body.generate_cover_letter if body is not None else True
    prepare_application.apply_async(args=[str(a.id), gen_cover], queue="default")
    return serialize_application(a, db.get(Job, a.job_id))


@router.post("/{application_id}/questions")
def add_custom_question(
    application_id: uuid.UUID,
    body: ApplicationQuestionAddIn,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    a = owned(db, user, application_id)
    if a.status == "processing":
        raise HTTPException(409, "Aguarde a preparação inicial terminar antes de adicionar perguntas")
    if len(a.questions or []) >= 15:
        raise HTTPException(400, "Limite de 15 perguntas por candidatura atingido")
    job = db.get(Job, a.job_id)
    question_text = body.question.strip()[:500]
    evidence = retrieve_evidence(db, user.id, question_text)
    draft = answer_question(
        question_text,
        {"title": job.title, "company": job.company, "description": job.description},
        evidence,
    )
    a.questions = [*(a.questions or []), question_text]
    a.answers = [*(a.answers or []), draft]
    event(db, a.id, "question_added", {"question": question_text[:120]})
    db.commit()
    return serialize_application(a, job)


@router.post("/{application_id}/submit-sandbox", status_code=202)
def sandbox_submit(
    application_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    a = owned(db, user, application_id)
    job = db.get(Job, a.job_id)
    if a.status not in {"ready", "unknown"} or not a.approved:
        raise HTTPException(409, "Primeiro aprove a candidatura")
    if not may_automate_submission(job.source, a.approved):
        raise HTTPException(403, "Envio automático indisponível para esta integração")
    resume = db.scalar(
        select(Resume).where(Resume.user_id == user.id, Resume.status == "processed").limit(1)
    )
    if not resume:
        raise HTTPException(409, "Envie e processe um currículo antes do teste")
    a.status = "submitting"
    a.error = None
    event(db, a.id, "sandbox_submit_requested")
    db.commit()
    submit_sandbox.apply_async(args=[str(a.id)], queue="browser")
    return {"status": "submitting", "message": "Aguardando worker Playwright"}


@router.post("/{application_id}/mark-manual")
def mark_manual(
    application_id: uuid.UUID,
    body: MarkManualIn | None = Body(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    a = owned(db, user, application_id)
    if a.status not in {"ready", "unknown"} or not a.approved:
        raise HTTPException(409, "Candidatura ainda não autorizada")
    receipt = body.receipt.strip()[:200] if (body and body.receipt) else None
    notes = body.notes.strip()[:4000] if (body and body.notes) else None
    a.status = "reported_submitted"
    a.error = None
    if receipt:
        a.external_receipt = receipt
        a.stage = "confirmed"
    elif a.stage == "none":
        a.stage = "confirmed"
    if notes:
        a.notes = notes
    event(
        db,
        a.id,
        "user_reported_submission",
        {"verified": bool(receipt), "has_receipt": bool(receipt)},
    )
    db.commit()
    return serialize_application(a, db.get(Job, a.job_id))


@router.patch("/{application_id}/tracking")
def update_tracking(
    application_id: uuid.UUID,
    body: ApplicationTrackingIn,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    a = owned(db, user, application_id)
    changes = {}
    if body.stage is not None and body.stage != a.stage:
        changes["stage"] = {"from": a.stage, "to": body.stage}
        a.stage = body.stage
    if body.notes is not None:
        a.notes = body.notes.strip()[:4000]
        changes["notes_updated"] = True
    if body.external_receipt is not None:
        a.external_receipt = body.external_receipt.strip()[:200] or None
        changes["receipt_updated"] = bool(a.external_receipt)
    if body.follow_up_at is not None:
        raw_date = body.follow_up_at.strip()
        if not raw_date:
            a.follow_up_at = None
            changes["follow_up_cleared"] = True
        else:
            try:
                parsed = datetime.fromisoformat(raw_date.replace("Z", "+00:00"))
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=timezone.utc)
                a.follow_up_at = parsed
                changes["follow_up_at"] = parsed.isoformat()
            except ValueError:
                raise HTTPException(422, "Data de follow-up inválida (use formato YYYY-MM-DD)")
    if changes:
        event(db, a.id, "tracking_updated", changes)
    db.commit()
    return serialize_application(a, db.get(Job, a.job_id))


@router.get("/{application_id}/proof")
def get_proof_screenshot(
    application_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    a = owned(db, user, application_id)
    if not a.proof_path:
        raise HTTPException(404, "Comprovante visual não disponível para esta candidatura")
    base_dir = (Path(settings.storage_dir) / str(user.id) / "proofs").resolve()
    target = Path(a.proof_path).resolve()
    if not target.is_relative_to(base_dir) or not target.is_file():
        raise HTTPException(404, "Arquivo de comprovante não encontrado")
    return FileResponse(target, media_type="image/png", filename=f"comprovante-{application_id}.png")


@router.delete("/{application_id}")
def delete_application(
    application_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    a = owned(db, user, application_id)
    try:
        with PostgresSaver.from_conn_string(settings.checkpoint_dsn) as saver:
            saver.delete_thread(str(a.id))
    except Exception:
        pass
    if a.proof_path:
        proof = Path(a.proof_path)
        if proof.is_file():
            proof.unlink(missing_ok=True)
    db.delete(a)
    db.commit()
    return {"ok": True}
