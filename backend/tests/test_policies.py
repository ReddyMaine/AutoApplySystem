from app.connectors.discovery import demo_jobs
from app.connectors.policies import CONNECTOR_CAPABILITIES, SubmissionMode, may_automate_submission


def test_only_demo_jobs_have_sandbox_source():
    assert all(job["source"] == "sandbox" for job in demo_jobs())
    assert all(job["url"].startswith("/sandbox/") for job in demo_jobs())


def test_only_sandbox_is_authorized_to_write():
    assert may_automate_submission("sandbox", approved=True)
    assert not may_automate_submission("sandbox", approved=False)
    for src in ("greenhouse", "lever", "ashby", "remotive", "arbeitnow", "url_import", "manual", "linkedin"):
        assert not may_automate_submission(src, approved=True)


def test_external_sources_use_assisted_mode():
    for src in ("greenhouse", "lever", "ashby", "remotive", "arbeitnow", "url_import", "manual"):
        assert CONNECTOR_CAPABILITIES[src].submission == SubmissionMode.ASSISTED
