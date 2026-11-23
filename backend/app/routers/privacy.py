"""Privacy export and account deletion for local MVP.

Production requires backups/retention automation and downstream processor erasure.
"""
import shutil
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select, delete
from sqlalchemy.orm import Session
from langgraph.checkpoint.postgres import PostgresSaver
from app.config import get_settings
from app.database import get_db
from app.models import User, Profile, Resume, ProfileFact, Application, ApplicationEvent, Job
from app.security import current_user
from app.serializers import serialize_application

router = APIRouter(prefix="/api/v1/privacy", tags=["privacy"])


@router.get("/export")
def export_data(db: Session = Depends(get_db), user: User = Depends(current_user)):
    profile = db.scalar(select(Profile).where(Profile.user_id == user.id))
    resumes = db.scalars(select(Resume).where(Resume.user_id == user.id)).all()
    apps = db.scalars(select(Application).where(Application.user_id == user.id)).all()
    events = []
    for a in apps:
        for entry in db.scalars(select(ApplicationEvent).where(ApplicationEvent.application_id == a.id)):
            events.append({"application_id": str(a.id), "event": entry.event_type,
                           "details": entry.details, "at": entry.created_at.isoformat()})
    return {"user": {"id": str(user.id), "email": user.email},
            "profile": profile.data if profile else {},
            "resumes": [{"id": str(r.id), "filename": r.filename,
                         "extracted": r.extracted, "sha256": r.sha256} for r in resumes],
            "applications": [serialize_application(a, db.get(Job, a.job_id)) for a in apps],
            "events": events,
            "note": "Os arquivos binários dos currículos não estão incluídos neste JSON."}


@router.delete("/account")
def delete_account(response: Response, db: Session = Depends(get_db),
                   user: User = Depends(current_user)):
    # Fail closed if checkpoints cannot be purged. Durable agent state can
    # contain personal data; deleting SQL rows alone would leave it behind.
    app_ids = [str(a) for a in db.scalars(select(Application.id).where(Application.user_id == user.id))]
    try:
        with PostgresSaver.from_conn_string(get_settings().checkpoint_dsn) as saver:
            for app_id in app_ids:
                saver.delete_thread(app_id)
    except Exception:
        raise HTTPException(503, "Não foi possível excluir os checkpoints; tente novamente")
    # DB FK CASCADE removes user-owned rows; jobs remain shared.
    folder = Path(get_settings().storage_dir) / str(user.id)
    db.execute(delete(User).where(User.id == user.id))
    db.commit()
    if folder.is_dir():
        shutil.rmtree(folder, ignore_errors=False)
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("csrf_token", path="/")
    return {"ok": True, "note": "Volumes e tabelas ativos foram removidos. Backups e logs seguem a política de retenção."}
