"""SQLModel tables mirroring the two CSVs, with the integrity the CSVs can't enforce.

Constraints added over the flat CSVs:
  - item.type is a closed enum (raw|intermediate|product)
  - prices are non-negative (CHECK)
  - recipe_component.quantity >= 1 (CHECK)
  - recipe_component references real items (FK, ON DELETE CASCADE)
Cycle prevention is enforced in the recipes router (SQLite can't express it).

The Sale table is an append-only ledger of actual sales; it snapshots the price
and cost at the moment of sale so reports stay stable when items change later.
"""
import enum
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import CheckConstraint, Column, Enum, ForeignKey, String
from sqlmodel import Field, SQLModel


class ItemType(str, enum.Enum):
    raw = "raw"
    intermediate = "intermediate"
    product = "product"


class Item(SQLModel, table=True):
    __tablename__ = "item"
    __table_args__ = (
        CheckConstraint("buy_price IS NULL OR buy_price >= 0", name="ck_item_buy_price"),
        CheckConstraint("sell_price IS NULL OR sell_price >= 0", name="ck_item_sell_price"),
        CheckConstraint("output_qty IS NULL OR output_qty >= 1", name="ck_item_output_qty"),
    )

    id: str = Field(primary_key=True)
    name_uk: str
    category: Optional[str] = None
    type: ItemType = Field(sa_column=Column(Enum(ItemType), nullable=False))
    buy_price: Optional[float] = None
    craft_level: Optional[int] = None
    craft_time: Optional[str] = None
    craft_exp: Optional[int] = None
    output_qty: Optional[int] = None
    shop_section: Optional[str] = None
    sell_price: Optional[float] = None
    components_complete: bool = False
    notes: Optional[str] = None


class RecipeComponent(SQLModel, table=True):
    __tablename__ = "recipe_component"
    __table_args__ = (
        CheckConstraint("quantity >= 1", name="ck_recipe_quantity"),
    )

    product_id: str = Field(
        sa_column=Column(
            String,
            ForeignKey("item.id", ondelete="CASCADE"),
            primary_key=True,
        )
    )
    component_id: str = Field(
        sa_column=Column(
            String,
            ForeignKey("item.id", ondelete="CASCADE"),
            primary_key=True,
        )
    )
    quantity: int = 1


class Sale(SQLModel, table=True):
    """One recorded sale. Append-only ledger — never mutated after insert.

    `unit_price` and `unit_cost` are snapshots captured at sale time, so editing
    an item's price (or deleting the item) never rewrites past reports. The FK is
    ON DELETE SET NULL (not CASCADE): deleting an item keeps its sales history,
    and `item_name` preserves the display name.
    """
    __tablename__ = "sale"
    __table_args__ = (
        CheckConstraint("quantity >= 1", name="ck_sale_quantity"),
        CheckConstraint("unit_price >= 0", name="ck_sale_unit_price"),
        CheckConstraint("unit_cost IS NULL OR unit_cost >= 0", name="ck_sale_unit_cost"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    item_id: Optional[str] = Field(
        default=None,
        sa_column=Column(String, ForeignKey("item.id", ondelete="SET NULL"), nullable=True),
    )
    item_name: str                       # snapshot of Item.name_uk at sale time
    quantity: int
    unit_price: float                    # snapshot: charged per unit
    unit_cost: Optional[float] = None    # snapshot: production cost; None = unknown ("—")
    sold_at: str                         # ISO 8601; effective sale moment (may be backdated)
    created_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )                                    # audit: when the row was entered
