"""
Test Configuration & Operational Database Protection Guard.

Ensures no automated test can ever connect to or modify the operational database.
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.engine.url import make_url
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

# Operational database names that tests are strictly forbidden to access
OPERATIONAL_DB_NAMES = {"restaurant_db", "dineflow_db"}

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")
if not TEST_DATABASE_URL:
    raise RuntimeError(
        "TEST_DATABASE_URL is not configured. Tests require an explicitly configured isolated test database."
    )


def verify_test_database_safety(url: str) -> None:
    """
    Validates that the provided database URL is an isolated test database
    and NOT the operational/production database.
    Raises RuntimeError immediately if any violation is detected.
    """
    if not url or not str(url).strip():
        raise RuntimeError(
            "CRITICAL SAFETY GUARD VIOLATION: TEST_DATABASE_URL is not configured! "
            "Tests must explicitly target an isolated test database."
        )

    clean_url = str(url).strip()
    parsed_url = make_url(clean_url)
    db_name = parsed_url.database or ""

    # 1. Reject if database name matches operational database
    if db_name in OPERATIONAL_DB_NAMES:
        raise RuntimeError(
            f"CRITICAL SAFETY GUARD VIOLATION: Automated tests cannot connect to operational database '{db_name}'! "
            f"Tests must connect to dedicated 'dineflow_test_db'."
        )

    # 2. Reject if exact URL matches settings.DATABASE_URL
    operational_clean_url = settings.DATABASE_URL.strip()
    if clean_url == operational_clean_url:
        raise RuntimeError(
            "CRITICAL SAFETY GUARD VIOLATION: Test database URL matches the operational settings.DATABASE_URL! "
            "Tests must target an isolated test database."
        )

    # 3. Reject if the database name doesn't contain 'test' and isn't in-memory SQLite
    if "test" not in db_name.lower() and ":memory:" not in clean_url.lower():
        raise RuntimeError(
            f"CRITICAL SAFETY GUARD VIOLATION: Test database name '{db_name}' must explicitly include 'test' "
            "or use an in-memory SQLite database (:memory:)."
        )


# Verify the test database safety upon module import
verify_test_database_safety(TEST_DATABASE_URL)

test_engine = create_engine(
    TEST_DATABASE_URL,
    pool_pre_ping=True
)

TestingSessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=test_engine
)


def override_get_db():
    """Default fallback override for FastAPI get_db dependency."""
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
