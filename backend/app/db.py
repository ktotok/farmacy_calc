"""Database engine + session for Аптека Роудс.

SQLite is the source of truth. The file lives in data/pharmacy.db alongside the
CSVs (which are kept for import/export + initial seed). Foreign keys are enabled
per-connection (SQLite needs the PRAGMA on every connection).
"""
import os

from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(ROOT, "data")
DB_PATH = os.environ.get("PHARMACY_DB", os.path.join(DATA_DIR, "pharmacy.db"))

# check_same_thread=False so the threaded ASGI server can share the engine.
engine = create_engine(
    f"sqlite:///{DB_PATH}",
    echo=False,
    connect_args={"check_same_thread": False},
)


@event.listens_for(engine, "connect")
def _enable_foreign_keys(dbapi_conn, _record):
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA foreign_keys=ON")
    cur.close()


def init_db():
    """Create tables if they do not exist."""
    # Log the resolved DB path so a misconfigured persistence location (ephemeral
    # container FS vs mounted volume) is obvious in the boot logs.
    print(f"[db] Using SQLite at {os.path.abspath(DB_PATH)}", flush=True)
    SQLModel.metadata.create_all(engine)


def get_session():
    """FastAPI dependency: yields a session per request."""
    with Session(engine) as session:
        yield session
