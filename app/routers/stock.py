from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.security.dependencies import require_roles
from app.services import stock_service

router = APIRouter(prefix="/stock", tags=["Stock & FEFO Intelligence"])

@router.get("/fefo-suggestion")
async def get_fefo_suggestion(
    medicine_id: str = Query(..., description="ID of medicine to dispense"),
    quantity: int = Query(..., ge=1, description="Quantity to dispense"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "MANAGER", "SALES_STAFF")),
):
    return stock_service.calculate_fefo_allocation(db, medicine_id=medicine_id, requested_quantity=quantity)
