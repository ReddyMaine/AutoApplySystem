"""First-party, isolated test ATS. Does not submit to third-party recruitment services."""
import html
import uuid
import jwt
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.config import get_settings
from app.database import SessionLocal
from app.models import Application, Job, SandboxReceipt

router = APIRouter(prefix="/sandbox", tags=["sandbox"])
settings = get_settings()


def check_token(token: str, app_id: uuid.UUID):
    try:
        claims = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        if claims.get("sub") != str(app_id) or claims.get("kind") != "sandbox":
            raise ValueError("incorrect claims")
    except (jwt.PyJWTError, ValueError):
        raise HTTPException(403, "Token de teste inválido")


@router.get("/jobs/{job_slug}", response_class=HTMLResponse)
def info_page(job_slug: str):
    return "<html><meta charset='utf-8'><body style='font-family:sans-serif;max-width:650px;margin:80px auto'><h1>Ambiente de teste de vagas</h1><p>Esta é uma vaga simulada. Crie uma candidatura pelo dashboard para enviar dados de teste.</p></body></html>"


@router.get("/apply/{app_id}", response_class=HTMLResponse)
def form_page(app_id: uuid.UUID, token: str):
    check_token(token, app_id)
    with SessionLocal() as db:
        a = db.get(Application, app_id)
        if not a or db.get(Job, a.job_id).source != "sandbox":
            raise HTTPException(404, "Candidatura de teste indisponível")
    safe_action = f"/sandbox/apply/{app_id}?token={html.escape(token, quote=True)}"
    return f"""<!doctype html><html lang='pt-BR'><head><meta charset='utf-8'><title>ATS Sandbox</title></head>
    <body style='max-width:620px;margin:55px auto;font-family:Arial,sans-serif'>
    <h1>Formulário ATS de teste</h1><p>Somente demonstração local; nenhum empregador real recebe os dados.</p>
    <form action='{safe_action}' method='post' enctype='multipart/form-data'>
      <p><label>Nome <input id='full_name' name='full_name' required></label></p>
      <p><label>E-mail <input id='email' name='email' type='email' required></label></p>
      <p><label>Motivação <textarea id='motivation' name='motivation' required></textarea></label></p>
      <p><label>Currículo <input id='resume' name='resume' type='file' accept='.pdf,.docx' required></label></p>
      <button type='submit'>Enviar candidatura de teste</button>
    </form></body></html>"""


@router.post("/apply/{app_id}", response_class=HTMLResponse)
async def receive_form(app_id: uuid.UUID, token: str, request: Request):
    check_token(token, app_id)
    form = await request.form()
    if not all(form.get(k) for k in ("full_name", "email", "motivation", "resume")):
        raise HTTPException(422, "Formulário incompleto")
    with SessionLocal() as db:
        a = db.get(Application, app_id)
        if not a or db.get(Job, a.job_id).source != "sandbox" or a.status not in {"submitting", "unknown"}:
            raise HTTPException(403, "Estado de envio inválido")
        receipt = db.scalar(select(SandboxReceipt).where(SandboxReceipt.application_id == app_id))
        if not receipt:
            receipt = SandboxReceipt(application_id=app_id, receipt="SANDBOX-" + uuid.uuid4().hex[:12].upper())
            db.add(receipt)
            db.commit()
        value = html.escape(receipt.receipt, quote=True)
    return f"<html><body><h1>Teste recebido</h1><p id='confirmation' data-receipt='{value}'>Recibo: {value}</p></body></html>"
