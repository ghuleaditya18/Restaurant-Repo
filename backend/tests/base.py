"""
Shared base test case and fixtures for DineFlow automated testing.

Provides complete database isolation using PostgreSQL savepoint transactions
and FastAPI dependency overrides against dineflow_test_db.
"""
import os
import unittest
import jwt
from starlette.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.core.config import settings
from app.db.session import get_db
from tests.test_config import (
    TEST_DATABASE_URL,
    test_engine,
    verify_test_database_safety,
)


class IsolatedTestCase(unittest.TestCase):
    """
    Base test case ensuring 100% database isolation on dineflow_test_db.
    Each test runs inside a nested savepoint transaction on a dedicated connection.
    When the test finishes, transaction.rollback() unwinds all changes, including
    commits made by FastAPI endpoints.
    """
    @classmethod
    def setUpClass(cls):
        os.environ["DINEFLOW_TEST_MODE"] = "1"
        verify_test_database_safety(TEST_DATABASE_URL)
        cls.client = TestClient(app)

    def setUp(self):
        # Open dedicated connection and begin top-level transaction
        self.connection = test_engine.connect()
        self.transaction = self.connection.begin()

        # Session bound with create_savepoint handles endpoint commits safely
        self.Session = sessionmaker(
            bind=self.connection,
            join_transaction_mode="create_savepoint"
        )
        self.db = self.Session()

        # Override get_db to share this isolated transaction
        def override_get_db():
            session = self.Session()
            try:
                yield session
            finally:
                session.close()

        app.dependency_overrides[get_db] = override_get_db

    def tearDown(self):
        # Clear dependency overrides
        app.dependency_overrides.clear()

        # Close session, rollback connection transaction to undo all changes, close connection
        try:
            self.db.close()
        except Exception:
            pass

        try:
            self.transaction.rollback()
        except Exception:
            pass

        try:
            self.connection.close()
        except Exception:
            pass

    def get_auth_token(self, user_id: int) -> str:
        """Generates a valid JWT auth token for testing."""
        return jwt.encode(
            {"sub": str(user_id)},
            settings.SECRET_KEY,
            algorithm=settings.ALGORITHM,
        )

    def get_auth_headers(self, user_id: int = 1) -> dict:
        """Returns Authorization Bearer header for the given user ID."""
        token = self.get_auth_token(user_id)
        return {"Authorization": f"Bearer {token}"}
