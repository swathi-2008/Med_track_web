from sqlalchemy.orm import Session
from sqlalchemy import func
from app.errors import NotFoundError, ConflictError
from app.models.medicine import Medicine
from app.models.batch import Batch
from app.models.audit import AuditLog
from app.schemas.medicine import MedicineCreate, MedicineUpdate
from app.clock import get_today

def list_medicines(
    db: Session,
    q: str | None = None,
    category: str | None = None,
    active_only: bool | None = None,
    page: int = 1,
    size: int = 50,
) -> tuple[list[dict], int]:
    query = db.query(Medicine)

    if q:
        search = f"%{q.strip().lower()}%"
        query = query.filter(
            func.lower(Medicine.name).like(search) | func.lower(Medicine.category).like(search)
        )

    if category:
        query = query.filter(Medicine.category == category)

    if active_only is not None:
        query = query.filter(Medicine.active == active_only)

    total = query.count()
    medicines = query.order_by(Medicine.name.asc()).offset((page - 1) * size).limit(size).all()

    today = get_today()
    results = []
    for m in medicines:
        # Sum available non-expired stock
        total_stock = (
            db.query(func.coalesce(func.sum(Batch.quantity_available), 0))
            .filter(
                Batch.medicine_id == m.id,
                Batch.status == "ACTIVE",
                Batch.expiry_date >= today
            )
            .scalar()
        )
        results.append({
            "id": m.id,
            "name": m.name,
            "category": m.category,
            "strength": m.strength,
            "unit": m.unit,
            "reorder_level": m.reorder_level,
            "selling_price": m.selling_price,
            "selling_price_display": f"₹{m.selling_price / 100:.2f}",
            "active": m.active,
            "total_stock": total_stock,
            "created_at": m.created_at,
            "updated_at": m.updated_at,
        })

    return results, total

def get_medicine(db: Session, medicine_id: str) -> dict:
    med = db.query(Medicine).filter(Medicine.id == medicine_id).first()
    if not med:
        raise NotFoundError(f"Medicine with ID '{medicine_id}' not found.")

    today = get_today()
    total_stock = (
        db.query(func.coalesce(func.sum(Batch.quantity_available), 0))
        .filter(
            Batch.medicine_id == med.id,
            Batch.status == "ACTIVE",
            Batch.expiry_date >= today
        )
        .scalar()
    )

    return {
        "id": med.id,
        "name": med.name,
        "category": med.category,
        "strength": med.strength,
        "unit": med.unit,
        "reorder_level": med.reorder_level,
        "selling_price": med.selling_price,
        "selling_price_display": f"₹{med.selling_price / 100:.2f}",
        "active": med.active,
        "total_stock": total_stock,
        "created_at": med.created_at,
        "updated_at": med.updated_at,
    }

def create_medicine(db: Session, data: MedicineCreate, user_id: str) -> Medicine:
    existing = db.query(Medicine).filter(func.lower(Medicine.name) == data.name.strip().lower()).first()
    if existing:
        raise ConflictError(f"A medicine with name '{data.name}' already exists.")

    med = Medicine(
        name=data.name.strip(),
        category=data.category.strip(),
        strength=data.strength.strip(),
        unit=data.unit.strip(),
        reorder_level=data.reorder_level,
        selling_price=data.selling_price,
        active=True,
    )
    db.add(med)
    db.commit()
    db.refresh(med)

    audit = AuditLog(
        user_id=user_id,
        action="CREATE_MEDICINE",
        entity_type="Medicine",
        entity_id=med.id,
        reason=f"Created medicine {med.name}",
    )
    db.add(audit)
    db.commit()

    return med

def update_medicine(db: Session, medicine_id: str, data: MedicineUpdate, user_id: str) -> Medicine:
    med = db.query(Medicine).filter(Medicine.id == medicine_id).first()
    if not med:
        raise NotFoundError(f"Medicine with ID '{medicine_id}' not found.")

    # Check duplicate if name changed
    if data.name.strip().lower() != med.name.lower():
        existing = db.query(Medicine).filter(
            func.lower(Medicine.name) == data.name.strip().lower(),
            Medicine.id != medicine_id
        ).first()
        if existing:
            raise ConflictError(f"Another medicine with name '{data.name}' already exists.")

    med.name = data.name.strip()
    med.category = data.category.strip()
    med.strength = data.strength.strip()
    med.unit = data.unit.strip()
    med.reorder_level = data.reorder_level
    med.selling_price = data.selling_price
    if data.active is not None:
        med.active = data.active

    db.commit()
    db.refresh(med)

    audit = AuditLog(
        user_id=user_id,
        action="UPDATE_MEDICINE",
        entity_type="Medicine",
        entity_id=med.id,
        reason=f"Updated details for {med.name}",
    )
    db.add(audit)
    db.commit()

    return med

def set_medicine_status(db: Session, medicine_id: str, active: bool, user_id: str) -> Medicine:
    med = db.query(Medicine).filter(Medicine.id == medicine_id).first()
    if not med:
        raise NotFoundError(f"Medicine with ID '{medicine_id}' not found.")

    med.active = active
    db.commit()
    db.refresh(med)

    audit = AuditLog(
        user_id=user_id,
        action="ACTIVATE_MEDICINE" if active else "DEACTIVATE_MEDICINE",
        entity_type="Medicine",
        entity_id=med.id,
        reason=f"Status set to {'ACTIVE' if active else 'INACTIVE'}",
    )
    db.add(audit)
    db.commit()

    return med
