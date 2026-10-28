from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field
import os

class Settings(BaseSettings):
    db_path: str = Field(default="./data/medtrack.db", validation_alias="MEDTRACK_DB_PATH")
    admin_user: str = Field(default="admin", validation_alias="MEDTRACK_ADMIN_USER")
    admin_password: str = Field(default="AdminPassword123!", validation_alias="MEDTRACK_ADMIN_PASSWORD")
    cookie_secure: bool = Field(default=False, validation_alias="MEDTRACK_COOKIE_SECURE")
    session_absolute_hours: int = Field(default=8, validation_alias="MEDTRACK_SESSION_ABSOLUTE_HOURS")
    session_idle_minutes: int = Field(default=30, validation_alias="MEDTRACK_SESSION_IDLE_MINUTES")
    expiry_critical_days: int = Field(default=7, validation_alias="MEDTRACK_EXPIRY_CRITICAL_DAYS")
    expiry_high_days: int = Field(default=30, validation_alias="MEDTRACK_EXPIRY_HIGH_DAYS")
    expiry_medium_days: int = Field(default=60, validation_alias="MEDTRACK_EXPIRY_MEDIUM_DAYS")
    replenishment_target_multiplier: float = Field(default=2.0, validation_alias="MEDTRACK_REPLENISHMENT_TARGET_MULTIPLIER")
    env: str = Field(default="development", validation_alias="MEDTRACK_ENV")
    openapi_docs: bool = Field(default=True, validation_alias="MEDTRACK_OPENAPI_DOCS")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"
    )

    @property
    def is_production(self) -> bool:
        return self.env.lower() in ("production", "prod")

settings = Settings()
