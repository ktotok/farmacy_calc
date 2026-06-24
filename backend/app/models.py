"""SQLModel tables mirroring the two CSVs, with the integrity the CSVs can't enforce.

Constraints added over the flat CSVs:
  - item.type is a closed enum (raw|intermediate|product|shop)
  - prices are non-negative (CHECK)
  - recipe_component.quantity >= 1 (CHECK)
  - recipe_component references real items (FK, ON DELETE CASCADE)
Cycle prevention is enforced in the recipes router (SQLite can't express it).
"""
import enum
from typing import Optional

from sqlalchemy import CheckConstraint, Column, Enum, ForeignKey, String
from sqlmodel import Field, SQLModel


class ItemType(str, enum.Enum):
    raw = "raw"
    intermediate = "intermediate"
    product = "product"
    shop = "shop"


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
