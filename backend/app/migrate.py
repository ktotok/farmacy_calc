"""Django-style migration runner — apply pending SQL migrations from app/migrations/.

Local dev:  cd backend && python -m app.migrate
Docker:     called automatically by entrypoint.sh before uvicorn starts.
"""
import os

from sqlalchemy import text

from .db import engine, init_db

MIGRATIONS_DIR = os.path.join(os.path.dirname(__file__), "migrations")


def run() -> None:
    init_db()
    with engine.begin() as conn:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS _migrations (
                id      TEXT PRIMARY KEY,
                applied TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """))

        files = sorted(
            f for f in os.listdir(MIGRATIONS_DIR)
            if f.endswith(".sql") and not f.startswith("_")
        )
        for fname in files:
            if conn.execute(
                text("SELECT id FROM _migrations WHERE id=:id"), {"id": fname}
            ).first():
                continue
            sql = open(os.path.join(MIGRATIONS_DIR, fname)).read()
            # Execute each statement separately (SQLite/SQLAlchemy run one at a
            # time). Strip full-line `--` comments first so a comment placed above
            # a statement (the normal way to annotate SQL) isn't swept into the
            # same ;-chunk and cause the statement itself to be skipped.
            for chunk in sql.split(";"):
                stmt = "\n".join(
                    line for line in chunk.splitlines()
                    if not line.strip().startswith("--")
                ).strip()
                if stmt:
                    conn.execute(text(stmt))
            conn.execute(
                text("INSERT INTO _migrations(id) VALUES(:id)"), {"id": fname}
            )
            print(f"[migrate] {fname}: applied")


if __name__ == "__main__":
    run()
