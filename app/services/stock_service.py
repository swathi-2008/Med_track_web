from sqlalchemy.orm import Session
from app.clock import get_today
from app.errors import NotFoundError, BusinessRuleError, ValidationError
from app.models.medicine import Medicine
from app.models.batch import Batch

def get_eligible_batches_for_sale(db: Session, medicine_id: str) -> list[Batch]:
    """
    Returns saleable batches adhering to FEFO:
    - Status == ACTIVE
    - Expiry date >= today (unexpired)
    - quantity_available > 0
    - Medicine is active
    Ordered by expiry_date ASC, then id ASC (deterministic tie-break).
    """
    today = get_today()

    return (
        db.query(Batch)
        .join(Medicine, Batch.medicine_id == Medicine.id)
        .filter(
            Batch.medicine_id == medicine_id,
            Medicine.active == True,
            Batch.status == "ACTIVE",
            Batch.expiry_date >= today,
            Batch.quantity_available > 0,
        )
        .order_by(Batch.expiry_date.asc(), Batch.id.asc())
        .all()
    )

def calculate_fefo_allocation(db: Session, medicine_id: str, requested_quantity: int) -> dict:
    """
    Determines FEFO batch allocation for a desired quantity of a medicine.
    Returns split allocations across batches if needed.
    """
    if requested_quantity <= 0:
        raise ValidationError("Requested quantity must be a positive integer.")

    med = db.query(Medicine).filter(Medicine.id == medicine_id).first()
    if not med:
        raise NotFoundError(f"Medicine with ID '{medicine_id}' not found.")
    if not med.active:
        raise BusinessRuleError(f"Medicine '{med.name}' is inactive and cannot be sold.")

    eligible_batches = get_eligible_batches_for_sale(db, medicine_id)
    total_available = sum(b.quantity_available for b in eligible_batches)

    allocations = []
    remaining_needed = requested_quantity
    total_amount = 0

    for b in eligible_batches:
        if remaining_needed <= 0:
            break

        take_qty = min(b.quantity_available, remaining_needed)
        subtotal = take_qty * med.selling_price

        allocations.append({
            "batch_id": b.id,
            "batch_number": b.batch_number,
            "expiry_date": b.expiry_date,
            "quantity": take_qty,
            "unit_price": med.selling_price,
            "subtotal": subtotal,
        })

        total_amount += subtotal
        remaining_needed -= take_qty

    fulfillable = remaining_needed == 0

    return {
        "medicine_id": med.id,
        "medicine_name": med.name,
        "unit": med.unit,
        "selling_price": med.selling_price,
        "selling_price_display": f"₹{med.selling_price / 100:.2f}",
        "requested_quantity": requested_quantity,
        "total_available": total_available,
        "fulfillable": fulfillable,
        "shortage": max(0, remaining_needed),
        "allocations": allocations,
        "total_amount": total_amount,
        "total_amount_display": f"₹{total_amount / 100:.2f}",
    }
