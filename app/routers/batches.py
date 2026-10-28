import math
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.common import PaginatedResponse
from app.schemas.batch import (
    BatchCreate,
    BatchStatusUpdate,
    BatchResponse,
)
from app.security.dependencies import require_roles, verify_csrf, get_current_user
from app.models.user import User
from app.services import batch_service

router = APIRouter(prefix="/batches", tags=["Batch Inventory"])

@router.get("", response_model=PaginatedResponse[BatchResponse])
async def get_batches(
    medicine_id: str | None = Query(None),
    status: str | None = Query(None),
    q: str | None = Query(None, description="Search batch number"),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "MANAGER", "SALES_STAFF", "PURCHASE_STAFF")),
):
    items, total = batch_service.list_batches(
        db, medicine_id=medicine_id, status=status, q=q, page=page, size=size
    )
    total_pages = math.ceil(total / size) if size > 0 else 1
    return PaginatedResponse(
        items=[BatchResponse.model_validate(b) for b in items],
        total=total,
        page=page,
        size=size,
        total_pages=total_pages,
    )

@router.get("/expiry-risk")
async def get_expiry_risk(
    window: int | None = Query(None, description="Window in days (e.g. 7, 30, 60)"),
    include_expired: bool = Query(True),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "MANAGER")),
):
    from app.services import expiry_service
    return expiry_service.get_expiry_risk_report(db, window_days=window, include_expired=include_expired)

@router.get("/{batch_id}", response_model=BatchResponse)
async def get_batch_by_id(
    batch_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "MANAGER", "SALES_STAFF", "PURCHASE_STAFF")),
):
    b = batch_service.get_batch(db, batch_id)
    return BatchResponse.model_validate(b)

@router.post("", response_model=BatchResponse, dependencies=[Depends(verify_csrf)])
async def create_batch(
    payload: BatchCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "MANAGER", "PURCHASE_STAFF")),
):
    batch = batch_service.create_batch(db, payload, user_id=current_user.id)
    data = batch_service.get_batch(db, batch.id)
    return BatchResponse.model_validate(data)

@router.patch("/{batch_id}/status", response_model=BatchResponse, dependencies=[Depends(verify_csrf)])
async def update_batch_status(
    batch_id: str,
    payload: BatchStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "MANAGER")),
):
    batch = batch_service.update_batch_status(db, batch_id, payload, user_id=current_user.id)
    data = batch_service.get_batch(db, batch.id)
    return BatchResponse.model_validate(data)
