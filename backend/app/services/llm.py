"""Shared LLM client helper supporting Gemini (OpenAI-compatible API) and OpenAI."""
import math
from app.config import get_settings


def get_llm_config() -> dict | None:
    settings = get_settings()
    if settings.gemini_api_key.strip():
        return {
            "provider": "gemini",
            "api_key": settings.gemini_api_key.strip(),
            "base_url": settings.gemini_base_url.strip() or "https://generativelanguage.googleapis.com/v1beta/openai/",
            "chat_model": settings.gemini_chat_model.strip() or "gemini-3.8-flash",
            "embedding_model": settings.gemini_embedding_model.strip() or "gemini-embedding-001",
        }
    if settings.openai_api_key.strip():
        return {
            "provider": "openai",
            "api_key": settings.openai_api_key.strip(),
            "base_url": settings.openai_base_url.strip() or None,
            "chat_model": settings.openai_chat_model.strip() or "gpt-4.1-mini",
            "embedding_model": settings.openai_embedding_model.strip() or "text-embedding-3-small",
        }
    return None


def llm_configured() -> bool:
    return get_llm_config() is not None


def get_llm_client(timeout: float = 35.0):
    cfg = get_llm_config()
    if not cfg:
        return None, None
    from openai import OpenAI

    kwargs = {"api_key": cfg["api_key"], "timeout": timeout}
    if cfg["base_url"]:
        kwargs["base_url"] = cfg["base_url"]
    return OpenAI(**kwargs), cfg


def normalize_vector(vector: list[float]) -> list[float]:
    norm = math.sqrt(sum(x * x for x in vector))
    if norm <= 0:
        return vector
    return [x / norm for x in vector]
