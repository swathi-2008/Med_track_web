import math
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.common import PaginatedResponse
from app.schemas.medicine import (
    MedicineCreate,
    MedicineUpdate,
    MedicineStatusUpdate,
    MedicineResponse,
)
from app.security.dependencies import require_roles, verify_csrf, get_current_user
from app.models.user import User
from app.services import medicine_service

router = APIRouter(prefix="/medicines", tags=["Medicines Master"])

@router.get("", response_model=PaginatedResponse[MedicineResponse])
async def get_medicines(
    q: str | None = Query(None, description="Search by name or category"),
    category: str | None = Query(None),
    active_only: bool | None = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "MANAGER", "SALES_STAFF", "PURCHASE_STAFF")),
):
    items, total = medicine_service.list_medicines(
        db, q=q, category=category, active_only=active_only, page=page, size=size
    )
    total_pages = math.ceil(total / size) if size > 0 else 1
    return PaginatedResponse(
        items=[MedicineResponse.model_validate(m) for m in items],
        total=total,
        page=page,
        size=size,
        total_pages=total_pages,
    )

@router.get("/{medicine_id}", response_model=MedicineResponse)
async def get_medicine_by_id(
    medicine_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "MANAGER", "SALES_STAFF", "PURCHASE_STAFF")),
):
    data = medicine_service.get_medicine(db, medicine_id)
    return MedicineResponse.model_validate(data)

@router.post("", response_model=MedicineResponse, dependencies=[Depends(verify_csrf)])
async def create_medicine(
    payload: MedicineCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    med = medicine_service.create_medicine(db, payload, user_id=current_user.id)
    return medicine_service.get_medicine(db, med.id)

@router.put("/{medicine_id}", response_model=MedicineResponse, dependencies=[Depends(verify_csrf)])
async def update_medicine(
    medicine_id: str,
    payload: MedicineUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    med = medicine_service.update_medicine(db, medicine_id, payload, user_id=current_user.id)
    return medicine_service.get_medicine(db, med.id)

@router.patch("/{medicine_id}/status", response_model=MedicineResponse, dependencies=[Depends(verify_csrf)])
async def set_medicine_status(
    medicine_id: str,
    payload: MedicineStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN")),
):
    med = medicine_service.set_medicine_status(db, medicine_id, payload.active, user_id=current_user.id)
    return medicine_service.get_medicine(db, med.id)
