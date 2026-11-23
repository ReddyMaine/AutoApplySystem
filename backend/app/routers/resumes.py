import hashlib
import os
import uuid
from pathlib import Path
from fastapi import APIRouter, Body, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.config import get_settings
from app.database import get_db
from app.models import User, Resume, Profile
from app.schemas import ResumeConfirmIn
from app.security import current_user
from app.tasks import process_resume, index_profile

router = APIRouter(prefix="/api/v1/resumes", tags=["resumes"])
settings = get_settings()
MAX_BYTES = 8 * 1024 * 1024


def dump_resume(r: Resume):
    return {
        "id": str(r.id),
        "filename": r.filename,
        "status": r.status,
        "extracted": r.extracted,
        "error": r.error,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@router.get("")
def list_resumes(db: Session = Depends(get_db), user: User = Depends(current_user)):
    rows = db.scalars(
        select(Resume).where(Resume.user_id == user.id).order_by(Resume.created_at.desc())
    ).all()
    return [dump_resume(r) for r in rows]


@router.post("", status_code=202)
async def upload_resume(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    original = Path(file.filename or "resume").name
    suffix = Path(original).suffix.lower()
    if suffix not in (".pdf", ".docx"):
        raise HTTPException(400, "Envie um PDF ou DOCX")
    content = await file.read(MAX_BYTES + 1)
    if len(content) > MAX_BYTES:
        raise HTTPException(413, "Arquivo deve ter no máximo 8 MB")
    if suffix == ".pdf" and not content.startswith(b"%PDF-"):
        raise HTTPException(400, "PDF inválido")
    if suffix == ".docx" and not content.startswith(b"PK"):
        raise HTTPException(400, "DOCX inválido")
    folder = Path(settings.storage_dir) / str(user.id)
    folder.mkdir(parents=True, exist_ok=True, mode=0o700)
    file_id = uuid.uuid4()
    path = folder / f"{file_id}{suffix}"
    path.write_bytes(content)
    os.chmod(path, 0o600)
    resume = Resume(
        id=file_id,
        user_id=user.id,
        filename=original[:255],
        path=str(path),
        sha256=hashlib.sha256(content).hexdigest(),
    )
    db.add(resume)
    db.commit()
    process_resume.apply_async(args=[str(resume.id)], queue="default")
    return dump_resume(resume)


@router.post("/{resume_id}/confirm")
def confirm_resume(
    resume_id: uuid.UUID,
    body: ResumeConfirmIn | None = Body(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    r = db.scalar(select(Resume).where(Resume.id == resume_id, Resume.user_id == user.id))
    if not r or r.status != "processed":
        raise HTTPException(400, "Currículo ainda não foi processado")
    profile = db.scalar(select(Profile).where(Profile.user_id == user.id))
    allowed = {"name", "title", "summary", "skills", "experiences", "education", "certifications", "location"}
    overwrite = bool(body and body.overwrite)
    merged = dict(profile.data)
    for key in allowed:
        val = r.extracted.get(key)
        if val and (overwrite or not merged.get(key)):
            merged[key] = val
    profile.data = merged
    profile.version += 1
    version = profile.version
    db.commit()
    index_profile.apply_async(args=[str(user.id), version], queue="default")
    return {"ok": True, "version": version, "profile": merged}


@router.get("/{resume_id}/download")
def download_resume(
    resume_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    r = db.scalar(select(Resume).where(Resume.id == resume_id, Resume.user_id == user.id))
    if not r:
        raise HTTPException(404, "Currículo não encontrado")
    base_dir = (Path(settings.storage_dir) / str(user.id)).resolve()
    target = Path(r.path).resolve()
    if not target.is_relative_to(base_dir) or not target.is_file():
        raise HTTPException(404, "Arquivo de currículo indisponível")
    media = (
        "application/pdf"
        if target.suffix.lower() == ".pdf"
        else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    return FileResponse(target, media_type=media, filename=r.filename)


@router.delete("/{resume_id}")
def delete_resume(
    resume_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    r = db.scalar(select(Resume).where(Resume.id == resume_id, Resume.user_id == user.id))
    if not r:
        raise HTTPException(404, "Currículo não encontrado")
    base_dir = (Path(settings.storage_dir) / str(user.id)).resolve()
    target = Path(r.path).resolve()
    if target.is_relative_to(base_dir) and target.is_file():
        target.unlink(missing_ok=True)
    db.delete(r)
    db.commit()
    return {"ok": True}
