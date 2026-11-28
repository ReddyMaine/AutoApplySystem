import math
from app.config import get_settings
from app.services.llm import get_llm_config, normalize_vector
from app.services.resume import _parse_json_object


def test_llm_config_prefers_gemini_over_openai(monkeypatch):
    get_settings.cache_clear()
    monkeypatch.setenv("GEMINI_API_KEY", "test-gemini-key")
    monkeypatch.setenv("OPENAI_API_KEY", "test-openai-key")
    cfg = get_llm_config()
    assert cfg is not None
    assert cfg["provider"] == "gemini"
    assert cfg["api_key"] == "test-gemini-key"
    assert "generativelanguage.googleapis.com" in cfg["base_url"]
    assert cfg["chat_model"] == "gemini-3.8-flash"
    assert cfg["embedding_model"] == "gemini-embedding-001"
    get_settings.cache_clear()


def test_llm_config_falls_back_to_openai(monkeypatch):
    get_settings.cache_clear()
    monkeypatch.setenv("GEMINI_API_KEY", "")
    monkeypatch.setenv("OPENAI_API_KEY", "test-openai-key")
    cfg = get_llm_config()
    assert cfg is not None
    assert cfg["provider"] == "openai"
    assert cfg["api_key"] == "test-openai-key"
    get_settings.cache_clear()


def test_llm_config_none_without_keys(monkeypatch):
    get_settings.cache_clear()
    monkeypatch.setenv("GEMINI_API_KEY", "")
    monkeypatch.setenv("OPENAI_API_KEY", "")
    assert get_llm_config() is None
    get_settings.cache_clear()


def test_normalize_vector_unit_length():
    vec = normalize_vector([3.0, 4.0])
    assert math.isclose(vec[0], 0.6)
    assert math.isclose(vec[1], 0.8)
    assert math.isclose(math.sqrt(sum(x * x for x in vec)), 1.0)


def test_parse_json_object_handles_markdown_fences():
    raw = '```json\n{"name": "Ana", "skills": ["Python"]}\n```'
    parsed = _parse_json_object(raw)
    assert parsed["name"] == "Ana"
    assert parsed["skills"] == ["Python"]
