import httpx
import pytest
from app.connectors.discovery import (
    ashby_jobs,
    demo_jobs,
    greenhouse_jobs,
    infer_modality,
    infer_seniority,
    parse_job_html,
    plain,
    validate_public_url,
)


def test_demo_jobs_are_sandbox_only():
    rows = demo_jobs()
    assert len(rows) >= 4
    assert all(j["source"] == "sandbox" for j in rows)


def test_clean_html():
    assert plain("<h2>Python &amp; APIs</h2><p>Remoto</p>") == "Python & APIs Remoto"


def test_greenhouse_invalid_board_does_not_call_network():
    with httpx.Client() as client:
        assert greenhouse_jobs("http://localhost/a", client) == []
        assert ashby_jobs("http://localhost/a", client) == []


def test_infer_modality_and_seniority():
    assert infer_modality("Remoto - Brasil", "") == "remote"
    assert infer_modality("São Paulo / Híbrido", "") == "hybrid"
    assert infer_modality("Presencial - Curitiba", "") == "onsite"
    assert infer_modality("Curitiba", "Sem detalhes") == "not_specified"
    assert infer_seniority("Desenvolvedor Python Sênior", "") == "senior"
    assert infer_seniority("Engenheiro Pleno", "") == "pleno"
    assert infer_seniority("Estágio em Dados", "") == "intern"
    assert infer_seniority("Backend Developer Jr", "") == "junior"


def test_parse_job_html_json_ld():
    html = """
    <html><head><title>Ignored Title</title>
    <script type="application/ld+json">
    {
      "@context": "https://schema.org/",
      "@type": "JobPosting",
      "title": "Senior Python Engineer",
      "hiringOrganization": {"@type": "Organization", "name": "TechCorp"},
      "jobLocationType": "TELECOMMUTE",
      "description": "<p>FastAPI, PostgreSQL e Docker.</p>"
    }
    </script></head><body></body></html>
    """
    job = parse_job_html("https://jobs.example.com/123", html)
    assert job["source"] == "url_import"
    assert job["title"] == "Senior Python Engineer"
    assert job["company"] == "TechCorp"
    assert job["modality"] == "remote"
    assert job["seniority"] == "senior"
    assert "FastAPI" in job["description"]


def test_validate_public_url_rejects_local_and_private_targets():
    for bad in (
        "ftp://example.com/job",
        "http://localhost/admin",
        "http://127.0.0.1:8000/health",
        "http://169.254.169.254/latest/meta-data/",
        "http://10.0.0.1/internal",
        "https://user:pass@example.com/job",
        "https://example.com:8443/job",
    ):
        with pytest.raises(ValueError):
            validate_public_url(bad)
    assert validate_public_url("https://1.1.1.1/vaga") == "https://1.1.1.1/vaga"
