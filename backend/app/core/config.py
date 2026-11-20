from decimal import Decimal
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_PATH = Path(__file__).resolve().parent.parent.parent / ".env"


class Settings(BaseSettings):

    DATABASE_URL: str

    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    STALE_ORDER_TIMEOUT_HOURS: int = 24

    # Spa Configuration
    SPA_DEFAULT_TAX_RATE: Decimal = Decimal("18.00")
    SPA_OPENING_TIME: str = "10:00"
    SPA_CLOSING_TIME: str = "18:00"
    SPA_SLOT_INTERVAL_MINUTES: int = 15
    SPA_THERAPY_BUFFER_MINUTES: int = 15
    SPA_TIMEZONE: str = "Asia/Kolkata"

    model_config = SettingsConfigDict(
        env_file=ENV_PATH,
        extra="ignore"
    )


settings = Settings()
