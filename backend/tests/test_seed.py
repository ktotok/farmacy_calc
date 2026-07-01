"""Tests for seed guard: seed() must never overwrite an existing DB."""
import pytest
from sqlmodel import Session, SQLModel, create_engine

from app.seed import seed


@pytest.fixture()
def empty_session():
    """Fresh in-memory SQLite session with schema but no data."""
    engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        yield session


def test_seed_populates_empty_db(empty_session):
    result = seed(empty_session)
    assert result.get("skipped") is not True
    assert result["items"] > 0
    assert result["recipes"] > 0


def test_seed_skips_non_empty_db(empty_session):
    seed(empty_session)
    result = seed(empty_session)
    assert result == {"skipped": True}


def test_seed_does_not_change_item_count_on_second_call(empty_session):
    from sqlmodel import select
    from app.models import Item

    seed(empty_session)
    count_before = len(empty_session.exec(select(Item)).all())

    seed(empty_session)
    count_after = len(empty_session.exec(select(Item)).all())

    assert count_before == count_after
