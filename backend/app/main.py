import hmac
import logging
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text, select, func
from sqlalchemy.orm import Session
from app.config import get_settings
from app.database import Base, SessionLocal, engine, get_db
from app.models import User, Application
from app.security import current_user
from app.connectors.discovery import demo_jobs
from app.services.llm import get_llm_config
from app.tasks import save_jobs
from app.routers import auth, profiles, resumes, jobs, applications, sandbox, privacy

settings = get_settings()
logging.basicConfig(level=logging.INFO)


def _ensure_application_columns(conn):
    """Idempotent column additions so existing local Postgres volumes upgrade seamlessly."""
    ddl = [
        "ALTER TABLE applications ADD COLUMN IF NOT EXISTS resume_id UUID REFERENCES resumes(id) ON DELETE SET NULL",
        "ALTER TABLE applications ADD COLUMN IF NOT EXISTS stage VARCHAR(40) NOT NULL DEFAULT 'none'",
        "ALTER TABLE applications ADD COLUMN IF NOT EXISTS cover_letter TEXT",
        "ALTER TABLE applications ADD COLUMN IF NOT EXISTS notes TEXT",
        "ALTER TABLE applications ADD COLUMN IF NOT EXISTS proof_path VARCHAR(500)",
        "ALTER TABLE applications ADD COLUMN IF NOT EXISTS follow_up_at TIMESTAMPTZ",
    ]
    for stmt in ddl:
        conn.execute(text(stmt))


@asynccontextmanager
async def lifespan(app: FastAPI):
    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        _ensure_application_columns(conn)
    if settings.demo_seed:
        with SessionLocal() as db:
            save_jobs(db, demo_jobs())
    Path(settings.storage_dir).mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(title="AutoApply AI", version="0.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),
    allow_origin_regex=r"^chrome-extension://[a-z]{32}$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def csrf_protect(request: Request, call_next):
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        path = request.url.path
        has_bearer = request.headers.get("authorization", "").lower().startswith("bearer ")
        if (
            not has_bearer
            and not path.startswith("/sandbox/")
            and path not in {"/api/v1/auth/login", "/api/v1/auth/register", "/api/v1/auth/token"}
        ):
            cookie = request.cookies.get("csrf_token", "")
            header = request.headers.get("x-csrf-token", "")
            if not cookie or not hmac.compare_digest(cookie, header):
                return JSONResponse(status_code=403, content={"detail": "CSRF token ausente ou inválido"})
    return await call_next(request)


app.include_router(auth.router)
app.include_router(profiles.router)
app.include_router(resumes.router)
app.include_router(jobs.router)
app.include_router(applications.router)
app.include_router(sandbox.router)
app.include_router(privacy.router)


@app.get("/health")
def health():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    cfg = get_llm_config()
    return {
        "status": "ok",
        "service": "autoapply-api",
        "llm_provider": cfg["provider"] if cfg else "heuristic",
    }


@app.get("/api/v1/metrics")
def metrics(db: Session = Depends(get_db), user: User = Depends(current_user)):
    status_rows = db.execute(
        select(Application.status, func.count(Application.id))
        .where(Application.user_id == user.id)
        .group_by(Application.status)
    ).all()
    stage_rows = db.execute(
        select(Application.stage, func.count(Application.id))
        .where(Application.user_id == user.id)
        .group_by(Application.stage)
    ).all()
    return {
        "by_status": {status: count for status, count in status_rows},
        "by_stage": {stage: count for stage, count in stage_rows},
        "total": sum(count for _, count in status_rows),
    }
