"""
Pytest configuration and shared fixtures for DineFlow automated testing.
"""
import os
import pytest
from starlette.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.db.session import get_db
from tests.test_config import (
    TEST_DATABASE_URL,
    test_engine,
    verify_test_database_safety,
)

# Mark as test environment
os.environ["DINEFLOW_TEST_MODE"] = "1"
verify_test_database_safety(TEST_DATABASE_URL)


@pytest.fixture(scope="session")
def client():
    """Provides a TestClient instance for the FastAPI application."""
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def db_session():
    """
    Provides an isolated database session running within a savepoint transaction.
    Rolls back automatically at the end of the test.
    """
    connection = test_engine.connect()
    transaction = connection.begin()
    session_factory = sessionmaker(
        bind=connection,
        join_transaction_mode="create_savepoint"
    )
    session = session_factory()

    def override():
        s = session_factory()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = override

    try:
        yield session
    finally:
        app.dependency_overrides.clear()
        session.close()
        transaction.rollback()
        connection.close()
