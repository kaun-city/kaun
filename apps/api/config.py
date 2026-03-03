"""
Application configuration — all values come from environment variables.
Copy .env.example to .env and fill in your values.
"""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/kaun"

    # App
    app_env: str = "development"
    cors_origins: list[str] = ["*"]

    # City configs live at repo root /cities/<city_id>/config.json
    # Override this if you deploy the API separately from the repo.
    cities_dir: Path = Path(__file__).resolve().parents[2] / "cities"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache
def get_settings() -> Settings:
    return Settings()
