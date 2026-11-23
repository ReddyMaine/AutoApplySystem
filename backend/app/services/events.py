from app.models import ApplicationEvent


def event(db, application_id, name: str, details=None):
    db.add(ApplicationEvent(application_id=application_id, event_type=name, details=details or {}))
