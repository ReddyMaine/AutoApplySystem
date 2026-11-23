from typing import Literal
from pydantic import BaseModel, EmailStr, Field

StageType = Literal[
    "none",
    "confirmed",
    "screening",
    "interview",
    "technical_test",
    "offer",
    "rejected_company",
    "withdrawn",
]


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ProfileIn(BaseModel):
    name: str = Field(default="", max_length=150)
    title: str = Field(default="", max_length=200)
    phone: str = Field(default="", max_length=60)
    location: str = Field(default="", max_length=200)
    summary: str = Field(default="", max_length=5000)
    skills: list[str] = Field(default_factory=list, max_length=100)
    experiences: list[dict] = Field(default_factory=list, max_length=40)
    education: list[dict] = Field(default_factory=list, max_length=30)
    certifications: list[str] = Field(default_factory=list, max_length=40)
    languages: list[dict] = Field(default_factory=list, max_length=30)
    desired_salary_min: int | None = Field(default=None, ge=0)
    desired_salary_max: int | None = Field(default=None, ge=0)
    modality: Literal["remote", "hybrid", "onsite", "any"] = "any"
    seniority: str = Field(default="any", max_length=50)
    linkedin_url: str = Field(default="", max_length=400)
    github_url: str = Field(default="", max_length=400)
    portfolio_url: str = Field(default="", max_length=400)


class JobManualCreateIn(BaseModel):
    title: str = Field(min_length=2, max_length=300)
    company: str = Field(min_length=1, max_length=200)
    location: str = Field(default="Não informado", max_length=200)
    modality: Literal["remote", "hybrid", "onsite", "not_specified"] = "not_specified"
    seniority: str = Field(default="not_specified", max_length=50)
    url: str = Field(default="", max_length=2000)
    description: str = Field(default="", max_length=25000)
    salary_min: int | None = Field(default=None, ge=0)
    salary_max: int | None = Field(default=None, ge=0)


class JobUrlImportIn(BaseModel):
    url: str = Field(min_length=8, max_length=2000)


class ApplicationCreateIn(BaseModel):
    job_id: str
    questions: list[str] = Field(
        default_factory=lambda: [
            "Por que deseja trabalhar conosco?",
            "Quais experiências são relevantes para esta vaga?",
        ],
        max_length=10,
    )
    resume_id: str | None = None
    generate_cover_letter: bool = True


class ApprovalIn(BaseModel):
    approved: bool
    answers: list[dict] | None = None
    cover_letter: str | None = Field(default=None, max_length=5000)


class ApplicationRetryIn(BaseModel):
    questions: list[str] | None = Field(default=None, max_length=10)
    resume_id: str | None = None
    generate_cover_letter: bool = True


class ApplicationQuestionAddIn(BaseModel):
    question: str = Field(min_length=3, max_length=500)


class MarkManualIn(BaseModel):
    receipt: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=4000)


class ApplicationTrackingIn(BaseModel):
    stage: StageType | None = None
    notes: str | None = Field(default=None, max_length=4000)
    external_receipt: str | None = Field(default=None, max_length=200)
    follow_up_at: str | None = Field(default=None, max_length=64)


class ResumeConfirmIn(BaseModel):
    overwrite: bool = False
