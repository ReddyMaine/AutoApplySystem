import uuid
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, or_
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session
from app.connectors.discovery import import_job_from_url, infer_modality, infer_seniority
from app.database import get_db
from app.models import User, Job, Profile
from app.schemas import JobManualCreateIn, JobUrlImportIn
from app.security import current_user
from app.serializers import serialize_job
from app.services.matching import calculate_match
from app.tasks import celery_app, discover_jobs

router = APIRouter(prefix="/api/v1/jobs", tags=["jobs"])


def _score_for(profile: Profile | None, job: Job) -> float:
    return calculate_match(
        (profile.data if profile else None) or {},
        {"title": job.title, "description": job.description, "modality": job.modality},
    )[0]


@router.get("")
def list_jobs(
    q: str = "",
    modality: str = "",
    source: str = "",
    limit: int = Query(150, ge=1, le=300),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    stmt = select(Job).order_by(Job.created_at.desc()).limit(limit)
    if q.strip():
        pattern = "%" + q.strip()[:80] + "%"
        stmt = stmt.where(
            or_(
                Job.title.ilike(pattern),
                Job.company.ilike(pattern),
                Job.description.ilike(pattern),
                Job.location.ilike(pattern),
            )
        )
    if modality in {"remote", "hybrid", "onsite"}:
        stmt = stmt.where(Job.modality == modality)
    if source.strip():
        stmt = stmt.where(Job.source == source.strip()[:40])
    profile = db.scalar(select(Profile).where(Profile.user_id == user.id))
    rows = db.scalars(stmt).all()
    return [serialize_job(j, _score_for(profile, j)) for j in rows]


@router.post("/discover", status_code=202)
def trigger_discovery(user: User = Depends(current_user)):
    job = discover_jobs.apply_async(queue="default")
    return {"task_id": job.id, "message": "Busca adicionada à fila"}


@router.get("/discover/status/{task_id}")
def discovery_status(task_id: str, user: User = Depends(current_user)):
    res = celery_app.AsyncResult(task_id)
    payload = {"task_id": task_id, "state": res.state}
    if res.successful() and isinstance(res.result, dict):
        payload["processed"] = res.result.get("processed", 0)
        payload["errors"] = res.result.get("errors", [])
    elif res.failed():
        payload["error"] = str(res.result)[:200]
    return payload


@router.post("/manual", status_code=201)
def create_manual_job(
    body: JobManualCreateIn,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    modality = body.modality
    if modality == "not_specified":
        modality = infer_modality(body.location, body.description)
    seniority = body.seniority
    if not seniority or seniority == "not_specified":
        seniority = infer_seniority(body.title, body.description)
    job = Job(
        source="manual",
        external_id=f"{user.id}:{uuid.uuid4().hex[:12]}",
        title=body.title.strip(),
        company=body.company.strip(),
        location=body.location.strip() or "Não informado",
        modality=modality,
        seniority=seniority,
        salary_min=body.salary_min,
        salary_max=body.salary_max,
        url=body.url.strip(),
        description=body.description.strip(),
        requirements={},
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    profile = db.scalar(select(Profile).where(Profile.user_id == user.id))
    return serialize_job(job, _score_for(profile, job))


@router.post("/import-url", status_code=201)
def import_job_url(
    body: JobUrlImportIn,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    try:
        parsed = import_job_from_url(body.url)
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except httpx.HTTPError as exc:
        raise HTTPException(
            422,
            f"Não foi possível ler a página pública desta vaga ({type(exc).__name__}). "
            "Portais que exigem login ou proteção anti-bot podem ser cadastrados na aba 'Cadastrar manualmente'.",
        )
    stmt = insert(Job).values(**parsed)
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
    ).returning(Job.id)
    job_id = db.execute(stmt).scalar_one()
    db.commit()
    job = db.get(Job, job_id)
    profile = db.scalar(select(Profile).where(Profile.user_id == user.id))
    return serialize_job(job, _score_for(profile, job))


@router.get("/{job_id}")
def get_job(
    job_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    j = db.get(Job, job_id)
    if not j:
        raise HTTPException(404, "Vaga não encontrada")
    profile = db.scalar(select(Profile).where(Profile.user_id == user.id))
    return serialize_job(j, _score_for(profile, j))
