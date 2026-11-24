import os
import sys
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

OPERATIONAL_DB_NAMES = {"restaurant_db", "dineflow_db"}


def _is_test_environment() -> bool:
    """Returns True if the process is currently executing tests."""
    if os.environ.get("DINEFLOW_TEST_MODE") == "1":
        return True
    if "pytest" in sys.modules:
        return True
    if any("unittest" in arg or "pytest" in arg for arg in sys.argv):
        return True
    return False


def _assert_operational_safety(target_engine) -> None:
    """Blocks any test code from connecting to the operational database."""
    if _is_test_environment():
        db_name = (target_engine.url.database or "").strip()
        if db_name in OPERATIONAL_DB_NAMES:
            raise RuntimeError(
                f"CRITICAL SAFETY GUARD TRIGGERED: Direct call to operational database '{db_name}' "
                f"in test mode is prohibited! Automated tests must connect to the isolated "
                f"test database 'dineflow_test_db' or use TestingSessionLocal."
            )


engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True
)

_SessionLocalFactory = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)


def SessionLocal(*args, **kwargs):
    """
    Session factory for operational database.
    Guarded against unauthorized access during automated tests.
    """
    _assert_operational_safety(engine)
    return _SessionLocalFactory(*args, **kwargs)


def get_db():
    """
    FastAPI dependency yielding operational database session.
    Guarded against unauthorized access during automated tests.
    """
    _assert_operational_safety(engine)
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()
