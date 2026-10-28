from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.security.dependencies import require_roles, verify_csrf, get_current_user
from app.schemas.adjustments import StockAdjustmentCreate, StockAdjustmentReview
from app.services import adjustment_service

router = APIRouter(prefix="/stock-adjustments", tags=["Stock Adjustments"])

@router.get("")
async def get_stock_adjustments(
    status: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "MANAGER", "PURCHASE_STAFF")),
):
    return adjustment_service.list_adjustments(db, status=status)

@router.post("", dependencies=[Depends(verify_csrf)])
async def create_stock_adjustment(
    payload: StockAdjustmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "MANAGER", "PURCHASE_STAFF", "SALES_STAFF")),
):
    return adjustment_service.create_adjustment(db, payload, user_id=current_user.id)

@router.post("/{adjustment_id}/approve", dependencies=[Depends(verify_csrf)])
async def approve_stock_adjustment(
    adjustment_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "MANAGER")),
):
    return adjustment_service.approve_adjustment(db, adjustment_id=adjustment_id, reviewer_id=current_user.id)

@router.post("/{adjustment_id}/reject", dependencies=[Depends(verify_csrf)])
async def reject_stock_adjustment(
    adjustment_id: str,
    payload: StockAdjustmentReview,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "MANAGER")),
):
    return adjustment_service.reject_adjustment(
        db, adjustment_id=adjustment_id, reviewer_id=current_user.id, reason=payload.reason
    )
