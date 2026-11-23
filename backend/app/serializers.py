def serialize_job(j, score=None):
    return {
        "id": str(j.id),
        "source": j.source,
        "title": j.title,
        "company": j.company,
        "location": j.location,
        "modality": j.modality,
        "seniority": j.seniority,
        "salary_min": j.salary_min,
        "salary_max": j.salary_max,
        "url": j.url,
        "description": j.description,
        "score": score,
        "created_at": j.created_at.isoformat() if j.created_at else None,
    }


def serialize_application(a, job=None):
    return {
        "id": str(a.id),
        "job_id": str(a.job_id),
        "resume_id": str(a.resume_id) if getattr(a, "resume_id", None) else None,
        "status": a.status,
        "stage": getattr(a, "stage", "none") or "none",
        "score": a.match_score,
        "reasons": a.match_reasons,
        "answers": a.answers,
        "questions": a.questions,
        "cover_letter": getattr(a, "cover_letter", None),
        "notes": getattr(a, "notes", None),
        "approved": a.approved,
        "external_receipt": a.external_receipt,
        "has_proof": bool(getattr(a, "proof_path", None)),
        "follow_up_at": a.follow_up_at.isoformat() if getattr(a, "follow_up_at", None) else None,
        "error": a.error,
        "job": serialize_job(job) if job else None,
        "created_at": a.created_at.isoformat() if a.created_at else None,
        "updated_at": a.updated_at.isoformat() if getattr(a, "updated_at", None) else None,
    }
