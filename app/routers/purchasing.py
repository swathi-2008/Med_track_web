from fastapi import APIRouter, Depends, Header, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.security.dependencies import require_roles, verify_csrf, get_current_user
from app.schemas.purchasing import (
    PurchaseRequestCreate,
    PurchaseRequestReview,
    PurchaseOrderCreate,
    GoodsReceiptCreate,
)
from app.services import purchase_service

router = APIRouter(tags=["Purchasing & Goods Receipts"])

# --- Purchase Requests ---
@router.get("/purchase-requests")
async def get_purchase_requests(
    status: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "MANAGER", "PURCHASE_STAFF")),
):
    return purchase_service.list_purchase_requests(db, status=status)

@router.post("/purchase-requests", dependencies=[Depends(verify_csrf)])
async def create_purchase_request(
    payload: PurchaseRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "MANAGER", "PURCHASE_STAFF")),
):
    return purchase_service.create_purchase_request(db, payload, user_id=current_user.id)

@router.post("/purchase-requests/{request_id}/approve", dependencies=[Depends(verify_csrf)])
async def approve_purchase_request(
    request_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "MANAGER")),
):
    return purchase_service.approve_purchase_request(db, request_id=request_id, reviewer_id=current_user.id)

@router.post("/purchase-requests/{request_id}/reject", dependencies=[Depends(verify_csrf)])
async def reject_purchase_request(
    request_id: str,
    payload: PurchaseRequestReview,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "MANAGER")),
):
    return purchase_service.reject_purchase_request(
        db, request_id=request_id, reviewer_id=current_user.id, reason=payload.reason
    )

# --- Purchase Orders ---
@router.get("/purchase-orders")
async def get_purchase_orders(
    status: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "MANAGER", "PURCHASE_STAFF")),
):
    return purchase_service.list_purchase_orders(db, status=status)

@router.post("/purchase-orders", dependencies=[Depends(verify_csrf)])
async def create_purchase_order(
    payload: PurchaseOrderCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "MANAGER", "PURCHASE_STAFF")),
):
    return purchase_service.create_purchase_order(db, payload, user_id=current_user.id)

# --- Goods Receipts ---
@router.post("/goods-receipts", dependencies=[Depends(verify_csrf)])
async def create_goods_receipt(
    payload: GoodsReceiptCreate,
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "MANAGER", "PURCHASE_STAFF")),
):
    return purchase_service.record_goods_receipt(
        db, payload, user_id=current_user.id, idempotency_key=idempotency_key
    )
