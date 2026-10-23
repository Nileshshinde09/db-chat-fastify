import os
from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    APP_NAME: str = "DB Chat Agentic RAG"
    APP_ENV: Literal["development", "testing", "production"] = "development"
    DEBUG: bool = False

    JWT_SECRET_KEY: str = Field(
        default="development-only-change-this-secret-32chars",
        min_length=32,
    )
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=30, ge=1, le=1440)

    MONGODB_URI: str = "mongodb://localhost:27017"
    MONGODB_DATABASE: str = "db_chat"
    CHECKPOINT_DATABASE: str = "db_chat_checkpoints"

    # ── Ollama (unchanged — already fully free) ───────────────────────────
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    ROUTER_MODEL: str = "qwen3:1.7b"
    SQL_MODEL: str = "qwen2.5-coder:3b"
    NOSQL_MODEL: str = "qwen2.5-coder:3b"
    EMBEDDING_MODEL: str = "nomic-embed-text"

    VECTOR_STORE_PATH: str = "./storage/chroma"
    RETRIEVER_TOP_K: int = Field(default=4, ge=1, le=20)
    MAX_QUERY_ROWS: int = Field(default=500, ge=1, le=10000)         # chat
    QUERY_TIMEOUT_SECONDS: int = Field(default=15, ge=1, le=120)
    MAX_QUERY_REPAIR_ATTEMPTS: int = Field(default=2, ge=0, le=5)
    ENCRYPTION_KEY: str = Field(default="", min_length=0) 
    
    SQLITE_PATH: str = "./storage/demo.db"
    POSTGRES_URI: str = ""
    MYSQL_URI: str = ""
    MONGODB_CHAT_URI: str = ""
    MONGODB_CHAT_DATABASE: str = ""

    # ── Reports (NEW — separate from chat) ────────────────────────────────
    REPORT_STORAGE_PATH: str = "./storage/reports"
    MAX_REPORT_ROWS: int = Field(default=100_000, ge=1, le=1_000_000)  # reports
    REPORT_QUERY_TIMEOUT_SECONDS: int = Field(default=60, ge=1, le=300)
    REPORT_TTL_DAYS: int = Field(default=7, ge=1, le=90)
    REPORT_SUMMARY_ENABLED: bool = True     # toggle Ollama summary feature

    # ── SSRF guard (now a real bool, parsed from env correctly) ───────────
    ALLOW_PRIVATE_NETWORKS: bool = False

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    @model_validator(mode="after")
    def _prod_guards(self):
        if self.APP_ENV == "production":
            if self.ALLOW_PRIVATE_NETWORKS:
                raise RuntimeError("ALLOW_PRIVATE_NETWORKS must be false in production")
            if self.JWT_SECRET_KEY.startswith("development-"):
                raise RuntimeError("JWT_SECRET_KEY must be a real secret in production")
        return self


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()