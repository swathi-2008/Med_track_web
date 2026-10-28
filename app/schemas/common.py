from typing import Generic, TypeVar, List
from pydantic import BaseModel

T = TypeVar("T")

class PaginatedResponse(BaseModel, Generic[T]):
    items: List[T]
    total: int
    page: int
    size: int
    total_pages: int

def paise_to_inr(paise: int) -> float:
    return round((paise or 0) / 100.0, 2)

def inr_format(paise: int) -> str:
    val = (paise or 0) / 100.0
    return f"₹{val:,.2f}"

