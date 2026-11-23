from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, Profile
from app.schemas import RegisterIn, LoginIn
from app.security import hash_password, verify_password, issue_token, set_auth_cookies, current_user

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/register", status_code=201)
def register(body: RegisterIn, response: Response, db: Session = Depends(get_db)):
    email = body.email.lower()
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(409, "Este e-mail já está cadastrado")
    user = User(email=email, password_hash=hash_password(body.password))
    db.add(user)
    db.flush()
    db.add(Profile(user_id=user.id, data={"name": "", "title": "", "skills": [], "experiences": []}))
    db.commit()
    set_auth_cookies(response, issue_token(str(user.id)))
    return {"id": str(user.id), "email": user.email}


@router.post("/login")
def login(body: LoginIn, response: Response, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Credenciais inválidas")
    set_auth_cookies(response, issue_token(str(user.id)))
    return {"id": str(user.id), "email": user.email}


@router.post("/token")
def issue_bearer_token(body: LoginIn, db: Session = Depends(get_db)):
    """Issues a Bearer JWT for first-party local clients such as the Chrome extension."""
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Credenciais inválidas")
    token = issue_token(str(user.id))
    return {"access_token": token, "token_type": "bearer", "user": {"id": str(user.id), "email": user.email}}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return {"id": str(user.id), "email": user.email}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("csrf_token", path="/")
    return {"ok": True}
