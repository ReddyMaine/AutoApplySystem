from app.services.rag import generate_cover_letter, text_facts


def test_facts_only_contain_supplied_profile_details():
    facts = text_facts(
        {
            "title": "Backend Python",
            "skills": ["FastAPI"],
            "experiences": [{"role": "Dev", "company": "Empresa X"}],
            "languages": [{"language": "Inglês", "level": "Avançado"}],
        }
    )
    content = "\n".join(t for _, t in facts)
    assert "Empresa X" in content
    assert "FastAPI" in content
    assert "Inglês" in content
    assert "Google" not in content


def test_heuristic_cover_letter_uses_profile_and_job():
    letter = generate_cover_letter(
        {
            "name": "Ana Lima",
            "title": "Engenheira Python",
            "skills": ["Python", "FastAPI", "PostgreSQL"],
            "summary": "Desenvolvimento de APIs escaláveis.",
        },
        {
            "title": "Backend Python",
            "company": "Acme Tech",
            "description": "Experiência com Python, FastAPI e Docker.",
        },
        [],
    )
    assert "Acme Tech" in letter
    assert "Backend Python" in letter
    assert "Ana Lima" in letter
    assert "FastAPI" in letter
