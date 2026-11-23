from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, Profile
from app.schemas import ProfileIn
from app.security import current_user
from app.tasks import index_profile

router = APIRouter(prefix="/api/v1/profile", tags=["profile"])


@router.get("")
def get_profile(db: Session = Depends(get_db), user: User = Depends(current_user)):
    p = db.scalar(select(Profile).where(Profile.user_id == user.id))
    return {"version": p.version, **p.data}


@router.put("")
def save_profile(body: ProfileIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    p = db.scalar(select(Profile).where(Profile.user_id == user.id))
    p.data = body.model_dump(mode="json")
    p.version += 1
    version = p.version
    db.commit()
    index_profile.apply_async(args=[str(user.id), version], queue="default")
    return {"version": version, **p.data}
