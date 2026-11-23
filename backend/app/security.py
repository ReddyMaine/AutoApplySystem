import secrets
import uuid
from datetime import datetime, timedelta, timezone
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from app.config import get_settings
from app.database import get_db
from app.models import User

hasher = PasswordHasher()
settings = get_settings()


def hash_password(value: str) -> str:
    return hasher.hash(value)


def verify_password(value: str, stored: str) -> bool:
    try:
        return hasher.verify(stored, value)
    except (VerifyMismatchError, Exception):
        return False


def issue_token(user_id: str) -> str:
    return jwt.encode(
        {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=7)},
        settings.jwt_secret,
        algorithm="HS256",
    )


def set_auth_cookies(response, token: str):
    response.set_cookie(
        "access_token",
        token,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        max_age=7 * 86400,
        path="/",
    )
    response.set_cookie(
        "csrf_token",
        secrets.token_urlsafe(32),
        httponly=False,
        secure=settings.secure_cookies,
        samesite="lax",
        max_age=7 * 86400,
        path="/",
    )


def extract_token(request: Request) -> str | None:
    auth_header = request.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        token = auth_header[7:].strip()
        if token:
            return token
    return request.cookies.get("access_token")


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = extract_token(request)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Faça login para continuar")
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        user = db.get(User, uuid.UUID(payload["sub"]))
    except (jwt.PyJWTError, ValueError, KeyError):
        user = None
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sessão inválida ou expirada")
    return user
