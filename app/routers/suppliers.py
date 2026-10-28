import math
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.common import PaginatedResponse
from app.schemas.supplier import (
    SupplierCreate,
    SupplierUpdate,
    SupplierResponse,
)
from app.security.dependencies import require_roles, verify_csrf, get_current_user
from app.models.user import User
from app.services import supplier_service

router = APIRouter(prefix="/suppliers", tags=["Suppliers Directory"])

@router.get("", response_model=PaginatedResponse[SupplierResponse])
async def get_suppliers(
    q: str | None = Query(None, description="Search by name, contact, email"),
    active_only: bool | None = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "MANAGER", "PURCHASE_STAFF")),
):
    items, total = supplier_service.list_suppliers(
        db, q=q, active_only=active_only, page=page, size=size
    )
    total_pages = math.ceil(total / size) if size > 0 else 1
    return PaginatedResponse(
        items=[SupplierResponse.model_validate(s) for s in items],
        total=total,
        page=page,
        size=size,
        total_pages=total_pages,
    )

@router.get("/{supplier_id}", response_model=SupplierResponse)
async def get_supplier_by_id(
    supplier_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "MANAGER", "PURCHASE_STAFF")),
):
    supplier = supplier_service.get_supplier(db, supplier_id)
    return SupplierResponse.model_validate(supplier)

@router.post("", response_model=SupplierResponse, dependencies=[Depends(verify_csrf)])
async def create_supplier(
    payload: SupplierCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "PURCHASE_STAFF")),
):
    supplier = supplier_service.create_supplier(db, payload, user_id=current_user.id)
    return SupplierResponse.model_validate(supplier)

@router.put("/{supplier_id}", response_model=SupplierResponse, dependencies=[Depends(verify_csrf)])
async def update_supplier(
    supplier_id: str,
    payload: SupplierUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("ADMIN", "PURCHASE_STAFF")),
):
    supplier = supplier_service.update_supplier(db, supplier_id, payload, user_id=current_user.id)
    return SupplierResponse.model_validate(supplier)
