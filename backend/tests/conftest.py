"""Test fixtures: a fresh seeded+migrated SQLite DB per test session via TestClient."""
import os
import tempfile

import pytest
from sqlmodel import Session

# Point the app at a throwaway DB *before* importing it (engine is built at import).
_TMP_DB = os.path.join(tempfile.mkdtemp(), "test_pharmacy.db")
os.environ["PHARMACY_DB"] = _TMP_DB

from fastapi.testclient import TestClient  # noqa: E402

from app.db import engine  # noqa: E402
from app.main import app  # noqa: E402
from app.migrate import run as migrate  # noqa: E402
from app.seed import seed  # noqa: E402


@pytest.fixture(scope="session")
def client():
    # `with` triggers FastAPI startup (init_db). Seed + migrate run explicitly,
    # mirroring what entrypoint.sh does in Docker.
    with TestClient(app) as c:
        with Session(engine) as session:
            seed(session)
        migrate()
        yield c
    if os.path.exists(_TMP_DB):
        os.remove(_TMP_DB)
