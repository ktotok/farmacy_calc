"""Regression test for the migration runner's comment handling.

Guards against the `sql.split(';')` + `startswith('--')` bug that swept a
comment and the statement below it into the same chunk and skipped both — while
still marking the file applied in _migrations, so it never re-ran. See
migrations/001_shop_to_product.sql, whose UPDATE + DELETE were both silently
skipped on any DB seeded from older data.
"""
from sqlalchemy import text
from sqlmodel import Session, SQLModel, create_engine

from app import migrate as migrate_mod
from app.models import Item, ItemType


def test_migration_001_applies_on_pre_001_state(monkeypatch):
    # Fresh DB in the pre-001 state. ItemType is a CHECK-constrained enum, so we
    # can't insert the legacy type='shop' directly; seeding laudanum as a
    # different valid type (intermediate) still proves the UPDATE ran when it
    # flips to product. The three legacy ids give the DELETE something to remove.
    engine = create_engine("sqlite:///:memory:")
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        s.add(Item(id="laudanum", name_uk="Лауданум", type=ItemType.intermediate))
        for legacy in ("analgesic_infusion", "bandage_belt", "spray_syringe"):
            s.add(Item(id=legacy, name_uk=legacy, type=ItemType.raw))
        s.commit()

    # Point the runner at our throwaway engine; schema already exists.
    monkeypatch.setattr(migrate_mod, "engine", engine)
    monkeypatch.setattr(migrate_mod, "init_db", lambda: None)

    migrate_mod.run()

    with Session(engine) as s:
        assert s.get(Item, "laudanum").type == ItemType.product
        for legacy in ("analgesic_infusion", "bandage_belt", "spray_syringe"):
            assert s.get(Item, legacy) is None
        applied = s.connection().execute(
            text("SELECT id FROM _migrations")
        ).scalars().all()
        assert "001_shop_to_product.sql" in applied
