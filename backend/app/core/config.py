from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_PATH = Path(__file__).resolve().parent.parent.parent / ".env"


class Settings(BaseSettings):

    DATABASE_URL: str

    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    STALE_ORDER_TIMEOUT_HOURS: int = 24

    model_config = SettingsConfigDict(
        env_file=ENV_PATH,
        extra="ignore"
    )


settings = Settings()
