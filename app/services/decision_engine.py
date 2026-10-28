from datetime import date, datetime, timedelta, timezone
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.config import settings
from app.clock import get_today, get_utcnow
from app.models.medicine import Medicine
from app.models.batch import Batch
from app.models.purchasing import PurchaseOrder, PurchaseOrderItem, PurchaseRequest, PurchaseRequestItem
from app.models.sales import Sale, SaleItem

def analyze_inventory_intelligence(db: Session) -> dict:
    today = get_today()
    now_utc = get_utcnow()
    thirty_days_ago = now_utc - timedelta(days=30)

    medicines = db.query(Medicine).filter(Medicine.active == True).order_by(Medicine.name.asc()).all()

    recommendations = []
    shortage_count = 0
    expiry_count = 0
    dual_count = 0

    for med in medicines:
        # 1. Batches breakdown
        batches = db.query(Batch).filter(Batch.medicine_id == med.id).all()

        eligible_stock = 0
        expired_stock = 0
        critical_expiring_stock = 0
        high_expiring_stock = 0
        medium_expiring_stock = 0
        nearest_expiry_days = None

        for b in batches:
            days_left = (b.expiry_date - today).days

            if b.status == "ACTIVE" and b.quantity_available > 0:
                if days_left < 0:
                    expired_stock += b.quantity_available
                else:
                    eligible_stock += b.quantity_available
                    if nearest_expiry_days is None or days_left < nearest_expiry_days:
                        nearest_expiry_days = days_left

                    if days_left <= settings.expiry_critical_days:
                        critical_expiring_stock += b.quantity_available
                    elif days_left <= settings.expiry_high_days:
                        high_expiring_stock += b.quantity_available
                    elif days_left <= settings.expiry_medium_days:
                        medium_expiring_stock += b.quantity_available
            elif days_left < 0 and b.quantity_available > 0:
                # Quarantined or other non-active expired
                expired_stock += b.quantity_available

        # 2. 30-day sales velocity
        sales_demand_30d = (
            db.query(func.coalesce(func.sum(SaleItem.quantity), 0))
            .join(Sale, SaleItem.sale_id == Sale.id)
            .filter(
                SaleItem.medicine_id == med.id,
                Sale.created_at >= thirty_days_ago,
                Sale.status == "COMPLETED",
            )
            .scalar()
        )

        daily_velocity = sales_demand_30d / 30.0 if sales_demand_30d > 0 else 0.0

        # 3. Confirmed incoming PO stock
        confirmed_incoming = (
            db.query(func.coalesce(func.sum(PurchaseOrderItem.quantity_ordered - PurchaseOrderItem.quantity_received), 0))
            .join(PurchaseOrder, PurchaseOrderItem.po_id == PurchaseOrder.id)
            .filter(
                PurchaseOrderItem.medicine_id == med.id,
                PurchaseOrder.status.in_(("OPEN", "PARTIALLY_RECEIVED")),
            )
            .scalar()
        )

        # 4. Pending PR requests
        pending_requests_qty = (
            db.query(func.coalesce(func.sum(PurchaseRequestItem.quantity_requested), 0))
            .join(PurchaseRequest, PurchaseRequestItem.request_id == PurchaseRequest.id)
            .filter(
                PurchaseRequestItem.medicine_id == med.id,
                PurchaseRequest.status == "PENDING",
            )
            .scalar()
        )

        data_considered = {
            "eligible_stock": eligible_stock,
            "reorder_level": med.reorder_level,
            "expired_stock": expired_stock,
            "critical_stock_7d": critical_expiring_stock,
            "high_stock_30d": high_expiring_stock,
            "medium_stock_60d": medium_expiring_stock,
            "nearest_expiry_days": nearest_expiry_days,
            "sales_demand_30d": sales_demand_30d,
            "confirmed_incoming_po": confirmed_incoming,
            "pending_requests": pending_requests_qty,
        }

        # Target replenishment computation
        target_qty = int(med.reorder_level * settings.replenishment_target_multiplier)
        shortfall = max(0, target_qty - (eligible_stock + confirmed_incoming))

        has_shortage = (eligible_stock + confirmed_incoming) < med.reorder_level
        has_expiry_risk = (critical_expiring_stock + high_expiring_stock) > 0
        has_expired = expired_stock > 0

        # --- Rule Evaluation ---

        # Case C: Expired stock present
        if has_expired:
            expiry_count += 1
            recommendations.append({
                "medicine_id": med.id,
                "medicine_name": med.name,
                "category": med.category,
                "risk_type": "EXPIRY",
                "severity": "CRITICAL",
                "problem": f"{expired_stock} {med.unit}(s) have passed their expiration date and remain on premises.",
                "data_considered": data_considered,
                "rule_applied": "Rule C: Zero-Tolerance Expired Stock Containment",
                "suggested_action": f"Immediately quarantine and remove all {expired_stock} expired units from dispensing areas for regulatory disposal.",
                "reason": "Dispensing expired pharmaceutical product violates safety mandates and endangers patients.",
                "suggested_quantity": None,
            })
            continue

        # Case E: Shortage covered by Open PO
        if eligible_stock < med.reorder_level and confirmed_incoming >= (med.reorder_level - eligible_stock):
            recommendations.append({
                "medicine_id": med.id,
                "medicine_name": med.name,
                "category": med.category,
                "risk_type": "SHORTAGE",
                "severity": "LOW",
                "problem": f"On-hand stock ({eligible_stock}) is below reorder level ({med.reorder_level}), but open purchase orders provide {confirmed_incoming} units.",
                "data_considered": data_considered,
                "rule_applied": "Rule E: In-Flight PO Shortage Neutralization",
                "suggested_action": "Incoming stock covers the gap. Do not raise duplicate purchase orders; expedite warehouse goods receipt.",
                "reason": f"Confirmed incoming stock ({confirmed_incoming}) fully offsets the inventory deficit ({med.reorder_level - eligible_stock}).",
                "suggested_quantity": 0,
            })
            continue

        # Case A: Low stock but velocity balances near-expiry stock
        if eligible_stock <= med.reorder_level and nearest_expiry_days is not None and nearest_expiry_days <= 30 and (critical_expiring_stock + high_expiring_stock) > 0:
            expected_demand_until_expiry = daily_velocity * nearest_expiry_days if daily_velocity > 0 else 0.0
            expiring_units = critical_expiring_stock + high_expiring_stock
            if daily_velocity > 0 and expected_demand_until_expiry >= expiring_units:
                recommendations.append({
                    "medicine_id": med.id,
                    "medicine_name": med.name,
                    "category": med.category,
                    "risk_type": "MONITOR",
                    "severity": "MEDIUM",
                    "problem": f"Eligible stock ({eligible_stock}) is at or below reorder level ({med.reorder_level}), but satisfies expected demand ({expected_demand_until_expiry:.1f} units) until nearest expiring lot ({nearest_expiry_days}d).",
                    "data_considered": data_considered,
                    "rule_applied": "Rule A: Velocity-Balanced Stock Monitoring",
                    "suggested_action": "MONITOR + use FEFO. Do not place purchase order yet to prevent overstocking expiring inventory.",
                    "reason": "Existing stock satisfies forecasted dispensing rate until lot expiration; immediate intake risks displacing near-expiry stock.",
                    "suggested_quantity": None,
                })
                continue

        # Case Dual Risk: Shortage + Expiry Risk (unbalanced by velocity)
        if has_shortage and has_expiry_risk:
            dual_count += 1
            recommendations.append({
                "medicine_id": med.id,
                "medicine_name": med.name,
                "category": med.category,
                "risk_type": "DUAL_RISK",
                "severity": "CRITICAL",
                "problem": f"Dual-Risk: Eligible stock ({eligible_stock}) is below reorder level ({med.reorder_level}), while {critical_expiring_stock + high_expiring_stock} units expire within 30 days.",
                "data_considered": data_considered,
                "rule_applied": "Dual-Risk Compound Inventory Matrix",
                "suggested_action": f"Raise purchase requisition for {shortfall} fresh units while aggressively prioritizing expiring units via FEFO dispensing.",
                "reason": "Pharmacy faces a double failure mode: imminent stockout compounded by write-off loss on near-expiry batches.",
                "suggested_quantity": shortfall,
            })
            continue

        # Case B: Uncovered Shortage -> Purchase Recommendation
        if has_shortage:
            shortage_count += 1
            severity = "CRITICAL" if eligible_stock == 0 else "HIGH"
            recommendations.append({
                "medicine_id": med.id,
                "medicine_name": med.name,
                "category": med.category,
                "risk_type": "SHORTAGE",
                "severity": severity,
                "problem": f"Eligible stock ({eligible_stock}) plus incoming shipments ({confirmed_incoming}) is below reorder level ({med.reorder_level}).",
                "data_considered": data_considered,
                "rule_applied": "Rule B: Dynamic Replenishment Threshold",
                "suggested_action": f"Create purchase requisition for {shortfall} {med.unit}(s).",
                "reason": f"Inventory deficit requires replenishment to restore target buffer ({target_qty} units based on {settings.replenishment_target_multiplier}x multiplier).",
                "suggested_quantity": shortfall,
            })
            continue

        # Case D: Expiry Risk (Healthy stock level but lots expiring soon)
        if has_expiry_risk:
            expiry_count += 1
            expiring_units = critical_expiring_stock + high_expiring_stock
            recommendations.append({
                "medicine_id": med.id,
                "medicine_name": med.name,
                "category": med.category,
                "risk_type": "EXPIRY",
                "severity": "HIGH" if critical_expiring_stock > 0 else "MEDIUM",
                "problem": f"{expiring_units} {med.unit}(s) expire within 30 days ({critical_expiring_stock} critical ≤7d, {high_expiring_stock} high ≤30d).",
                "data_considered": data_considered,
                "rule_applied": "Rule D: Shelf-Life Loss Minimization",
                "suggested_action": "Prioritize FEFO counter sales, review prescriber velocity, and evaluate supplier return terms.",
                "reason": "Near-expiry batches will result in capital write-off loss if un-dispensed before threshold.",
                "suggested_quantity": None,
            })

    return {
        "disclaimer": "Rule-based decision support — not machine learning",
        "total_medicines_analyzed": len(medicines),
        "shortage_risks_count": shortage_count,
        "expiry_risks_count": expiry_count,
        "dual_risks_count": dual_count,
        "recommendations": recommendations,
    }
