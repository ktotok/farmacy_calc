"""Pydantic request/response models. Validation here yields automatic 422s."""
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field

from .models import ItemType


class ItemCreate(BaseModel):
    id: str = Field(min_length=1)
    name_uk: str = Field(min_length=1)
    category: Optional[str] = None
    type: ItemType
    buy_price: Optional[float] = Field(default=None, ge=0)
    craft_level: Optional[int] = Field(default=None, ge=0)
    craft_time: Optional[str] = None
    craft_exp: Optional[int] = Field(default=None, ge=0)
    output_qty: Optional[int] = Field(default=None, ge=1)
    shop_section: Optional[str] = None
    sell_price: Optional[float] = Field(default=None, ge=0)
    components_complete: bool = False
    notes: Optional[str] = None


class ItemUpdate(BaseModel):
    """All fields optional — PATCH-style; id is immutable (set via path)."""
    name_uk: Optional[str] = Field(default=None, min_length=1)
    category: Optional[str] = None
    type: Optional[ItemType] = None
    buy_price: Optional[float] = Field(default=None, ge=0)
    craft_level: Optional[int] = Field(default=None, ge=0)
    craft_time: Optional[str] = None
    craft_exp: Optional[int] = Field(default=None, ge=0)
    output_qty: Optional[int] = Field(default=None, ge=1)
    shop_section: Optional[str] = None
    sell_price: Optional[float] = Field(default=None, ge=0)
    components_complete: Optional[bool] = None
    notes: Optional[str] = None


class ItemRead(BaseModel):
    id: str
    name_uk: str
    category: Optional[str] = None
    type: ItemType
    buy_price: Optional[float] = None
    craft_level: Optional[int] = None
    craft_time: Optional[str] = None
    craft_exp: Optional[int] = None
    output_qty: Optional[int] = None
    shop_section: Optional[str] = None
    sell_price: Optional[float] = None
    components_complete: bool = False
    notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class PriceUpdate(BaseModel):
    """Single price edit; accepted singly or as a list (reset-prices action)."""
    id: str
    field: str = Field(pattern="^(buy_price|sell_price)$")
    value: Optional[float] = Field(default=None, ge=0)


class RecipeComponentRead(BaseModel):
    product_id: str
    component_id: str
    quantity: int

    model_config = ConfigDict(from_attributes=True)


class RecipeComponentCreate(BaseModel):
    product_id: str
    component_id: str
    quantity: int = Field(ge=1)


class RecipeSet(BaseModel):
    """Replace the full component list of one product in a single call."""
    components: List[RecipeComponentCreate]


class DataResponse(BaseModel):
    items: List[ItemRead]
    recipes: List[RecipeComponentRead]
