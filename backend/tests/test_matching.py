from app.services.matching import calculate_match, tokens


def test_token_normalization():
    assert "python" in tokens("PYTHON, APIs e automação")
    assert "automacao" in tokens("Automação")


def test_matching_prefers_relevant_job():
    profile = {"skills": ["Python", "FastAPI", "PostgreSQL", "Docker"],
               "title": "Python Backend Developer", "summary": "Criação de APIs REST"}
    good, reasons = calculate_match(profile, {"title": "Python Backend Developer", "description": "Python FastAPI PostgreSQL Docker APIs", "modality": "remote"})
    bad, _ = calculate_match(profile, {"title": "Designer gráfico", "description": "Figma Photoshop fotografia", "modality": "remote"})
    assert good > bad
    assert reasons


def test_modality_mismatch_caps_score():
    profile = {"skills": ["Python"], "title": "Python", "modality": "remote"}
    score, reasons = calculate_match(profile, {"title": "Python", "description": "Python", "modality": "onsite"})
    assert score <= 45
    assert any("Modalidade" in reason for reason in reasons)
