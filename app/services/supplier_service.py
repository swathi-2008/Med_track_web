from sqlalchemy.orm import Session
from sqlalchemy import func
from app.errors import NotFoundError, ConflictError
from app.models.medicine import Supplier
from app.models.audit import AuditLog
from app.schemas.supplier import SupplierCreate, SupplierUpdate

def list_suppliers(
    db: Session,
    q: str | None = None,
    active_only: bool | None = None,
    page: int = 1,
    size: int = 50,
) -> tuple[list[Supplier], int]:
    query = db.query(Supplier)

    if q:
        search = f"%{q.strip().lower()}%"
        query = query.filter(
            func.lower(Supplier.name).like(search) |
            func.lower(Supplier.contact_person).like(search) |
            func.lower(Supplier.email).like(search)
        )

    if active_only is not None:
        query = query.filter(Supplier.active == active_only)

    total = query.count()
    suppliers = query.order_by(Supplier.name.asc()).offset((page - 1) * size).limit(size).all()
    return suppliers, total

def get_supplier(db: Session, supplier_id: str) -> Supplier:
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise NotFoundError(f"Supplier with ID '{supplier_id}' not found.")
    return supplier

def create_supplier(db: Session, data: SupplierCreate, user_id: str) -> Supplier:
    existing = db.query(Supplier).filter(func.lower(Supplier.name) == data.name.strip().lower()).first()
    if existing:
        raise ConflictError(f"Supplier with name '{data.name}' already exists.")

    supplier = Supplier(
        name=data.name.strip(),
        contact_person=data.contact_person.strip(),
        email=data.email.strip(),
        phone=data.phone.strip(),
        address=data.address.strip(),
        active=True,
    )
    db.add(supplier)
    db.commit()
    db.refresh(supplier)

    audit = AuditLog(
        user_id=user_id,
        action="CREATE_SUPPLIER",
        entity_type="Supplier",
        entity_id=supplier.id,
        reason=f"Created supplier {supplier.name}",
    )
    db.add(audit)
    db.commit()

    return supplier

def update_supplier(db: Session, supplier_id: str, data: SupplierUpdate, user_id: str) -> Supplier:
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise NotFoundError(f"Supplier with ID '{supplier_id}' not found.")

    if data.name.strip().lower() != supplier.name.lower():
        existing = db.query(Supplier).filter(
            func.lower(Supplier.name) == data.name.strip().lower(),
            Supplier.id != supplier_id
        ).first()
        if existing:
            raise ConflictError(f"Another supplier with name '{data.name}' already exists.")

    supplier.name = data.name.strip()
    supplier.contact_person = data.contact_person.strip()
    supplier.email = data.email.strip()
    supplier.phone = data.phone.strip()
    supplier.address = data.address.strip()
    if data.active is not None:
        supplier.active = data.active

    db.commit()
    db.refresh(supplier)

    audit = AuditLog(
        user_id=user_id,
        action="UPDATE_SUPPLIER",
        entity_type="Supplier",
        entity_id=supplier.id,
        reason=f"Updated details for {supplier.name}",
    )
    db.add(audit)
    db.commit()

    return supplier
