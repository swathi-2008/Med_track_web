from datetime import date
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.config import settings
from app.clock import get_today
from app.models.batch import Batch
from app.models.medicine import Medicine

def classify_expiry(expiry_date: date, today: date) -> tuple[int, str, str]:
    """
    Computes days_left and determines the risk category and human suggested action.
    Uses configurable thresholds from settings.
    """
    days_left = (expiry_date - today).days

    if days_left < 0:
        category = "EXPIRED"
        action = "Quarantine immediately and log for regulatory safe disposal. Do not dispense."
    elif days_left <= settings.expiry_critical_days:
        category = "CRITICAL"
        action = f"Expiring in {days_left}d. Prioritize FEFO counter sales immediately or initiate supplier return."
    elif days_left <= settings.expiry_high_days:
        category = "HIGH"
        action = f"Expiring in {days_left}d. Monitor weekly sales velocity; restrict new intake of identical SKU."
    elif days_left <= settings.expiry_medium_days:
        category = "MEDIUM"
        action = f"Expiring in {days_left}d. Ensure standard FEFO shelf rotation and track demand."
    else:
        category = "LOW"
        action = "Healthy shelf life. Standard storage and FIFO/FEFO dispensing."

    return days_left, category, action

def get_expiry_risk_report(db: Session, window_days: int | None = None, include_expired: bool = True) -> dict:
    """
    Generates an itemized expiry risk report.
    Only batches with quantity_available > 0 are evaluated for wastage risk.
    """
    today = get_today()

    query = (
        db.query(Batch)
        .join(Medicine, Batch.medicine_id == Medicine.id)
        .filter(Batch.quantity_available > 0)
    )

    batches = query.order_by(Batch.expiry_date.asc()).all()

    items = []
    total_quantity_at_risk = 0
    total_value_at_risk = 0
    counts_by_category = {"EXPIRED": 0, "CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}

    for b in batches:
        days_left, category, action = classify_expiry(b.expiry_date, today)
        counts_by_category[category] += 1

        # Filtering by window if requested
        if window_days is not None:
            if days_left < 0 and not include_expired:
                continue
            if days_left > window_days:
                continue

        value_at_risk = b.quantity_available * b.purchase_price
        if category in ("EXPIRED", "CRITICAL", "HIGH", "MEDIUM"):
            total_quantity_at_risk += b.quantity_available
            total_value_at_risk += value_at_risk

        items.append({
            "id": b.id,
            "batch_number": b.batch_number,
            "medicine_id": b.medicine_id,
            "medicine_name": b.medicine.name,
            "strength": b.medicine.strength,
            "unit": b.medicine.unit,
            "expiry_date": b.expiry_date,
            "days_left": days_left,
            "quantity_available": b.quantity_available,
            "purchase_price": b.purchase_price,
            "value_at_risk": value_at_risk,
            "value_at_risk_display": f"₹{value_at_risk / 100:.2f}",
            "status": b.status,
            "risk_category": category,
            "suggested_action": action,
        })

    return {
        "as_of_date": today,
        "total_batches_evaluated": len(batches),
        "total_batches_at_risk": len(items),
        "total_quantity_at_risk": total_quantity_at_risk,
        "total_value_at_risk": total_value_at_risk,
        "total_value_at_risk_display": f"₹{total_value_at_risk / 100:.2f}",
        "counts_by_category": counts_by_category,
        "items": items,
    }
