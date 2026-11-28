from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://autoapply:autoapply@localhost:5432/autoapply"
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret: str = "change-this-before-deploying-to-production"
    secure_cookies: bool = False
    storage_dir: str = "/data/resumes"
    gemini_api_key: str = ""
    gemini_chat_model: str = "gemini-3.8-flash"
    gemini_embedding_model: str = "gemini-embedding-001"
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta/openai/"
    openai_api_key: str = ""
    openai_base_url: str = ""
    openai_chat_model: str = "gpt-4.1-mini"
    openai_embedding_model: str = "text-embedding-3-small"
    greenhouse_boards: str = ""
    lever_sites: str = ""
    ashby_boards: str = ""
    remotive_enabled: bool = True
    arbeitnow_enabled: bool = False
    public_api_url: str = "http://api:8000"
    queue_eager: bool = False
    cors_origins: str = "http://localhost:3000"
    demo_seed: bool = True
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def checkpoint_dsn(self) -> str:
        return self.database_url.replace("postgresql+psycopg://", "postgresql://")


@lru_cache
def get_settings() -> Settings:
    return Settings()
