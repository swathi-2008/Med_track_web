import pytest
from datetime import date, timedelta
from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.clock import set_test_clock
from app.models.user import User
from app.models.medicine import Medicine, Supplier
from app.models.batch import Batch
from app.models.purchasing import PurchaseOrder, PurchaseOrderItem
from app.models.sales import Sale, SaleItem
from app.security.passwords import hash_password
from app.services.decision_engine import analyze_inventory_intelligence

FIXED_TODAY = date(2026, 10, 27)

@pytest.fixture(autouse=True)
def setup_decision_test():
    set_test_clock(override_date=FIXED_TODAY)
    session = SessionLocal()
    try:
        from tests.conftest import clear_all_tables
        clear_all_tables(session)

        mgr = User(
            username="manager_intel",
            password_hash=hash_password("MgrPass12345!"),
            full_name="Manager Intel",
            role="MANAGER",
            active=True,
        )
        session.add(mgr)
        session.commit()
    finally:
        session.close()

def test_case_c_expired_stock_containment():
    session = SessionLocal()
    try:
        med = Medicine(
            name="Cough Syrup 100ml",
            category="Respiratory",
            strength="100ml",
            unit="Bottle",
            reorder_level=20,
            selling_price=800,
            active=True,
        )
        session.add(med)
        session.commit()

        # Expired batch with positive quantity
        b_expired = Batch(
            medicine_id=med.id,
            batch_number="EXP-CASE-C",
            expiry_date=FIXED_TODAY - timedelta(days=5),
            quantity_received=15,
            quantity_available=15,
            purchase_price=400,
            status="ACTIVE",
        )
        session.add(b_expired)
        session.commit()

        intel = analyze_inventory_intelligence(session)
        recs = intel["recommendations"]
        assert len(recs) == 1
        r = recs[0]
        assert r["medicine_id"] == med.id
        assert r["risk_type"] == "EXPIRY"
        assert r["severity"] == "CRITICAL"
        assert "Rule C" in r["rule_applied"]
        assert "quarantine" in r["suggested_action"].lower()
    finally:
        session.close()

def test_case_e_incoming_po_covers_gap():
    session = SessionLocal()
    try:
        supp = Supplier(
            name="Alpha Pharma Ltd",
            contact_person="Ravi",
            email="ravi@alpha.com",
            phone="1234567890",
            address="Delhi",
            active=True,
        )
        med = Medicine(
            name="Atorvastatin 20mg",
            category="Cardiology",
            strength="20mg",
            unit="Tablet",
            reorder_level=50,
            selling_price=1000,
            active=True,
        )
        session.add_all([supp, med])
        session.commit()

        # Eligible on hand is 10 (deficit is 40)
        b_low = Batch(
            medicine_id=med.id,
            batch_number="ATOR-01",
            expiry_date=FIXED_TODAY + timedelta(days=200),
            quantity_received=10,
            quantity_available=10,
            purchase_price=500,
            status="ACTIVE",
        )
        session.add(b_low)
        session.commit()

        # Open PO has 50 units ordered, 0 received -> covers the 40 unit gap!
        po = PurchaseOrder(
            po_number="PO-CASE-E-01",
            supplier_id=supp.id,
            status="OPEN",
        )
        session.add(po)
        session.flush()

        poi = PurchaseOrderItem(
            po_id=po.id,
            medicine_id=med.id,
            quantity_ordered=50,
            quantity_received=0,
            unit_price=500,
        )
        session.add(poi)
        session.commit()

        intel = analyze_inventory_intelligence(session)
        recs = [r for r in intel["recommendations"] if r["medicine_id"] == med.id]
        assert len(recs) == 1
        r = recs[0]
        assert "Rule E" in r["rule_applied"]
        assert "covers the gap" in r["suggested_action"].lower()
        assert r["suggested_quantity"] == 0
    finally:
        session.close()

def test_case_b_uncovered_shortage_replenishment():
    session = SessionLocal()
    try:
        med = Medicine(
            name="Metoprolol 50mg",
            category="Cardiology",
            strength="50mg",
            unit="Tablet",
            reorder_level=40,
            selling_price=600,
            active=True,
        )
        session.add(med)
        session.commit()

        # Eligible stock is 10, no incoming PO -> shortage of 30 below reorder
        b = Batch(
            medicine_id=med.id,
            batch_number="MET-01",
            expiry_date=FIXED_TODAY + timedelta(days=250),
            quantity_received=10,
            quantity_available=10,
            purchase_price=300,
            status="ACTIVE",
        )
        session.add(b)
        session.commit()

        intel = analyze_inventory_intelligence(session)
        recs = [r for r in intel["recommendations"] if r["medicine_id"] == med.id]
        assert len(recs) == 1
        r = recs[0]
        assert r["risk_type"] == "SHORTAGE"
        assert "Rule B" in r["rule_applied"]
        # Target = 40 * 2.0 = 80. Shortfall = 80 - 10 = 70.
        assert r["suggested_quantity"] == 70
    finally:
        session.close()

def test_case_a_velocity_balanced_monitoring():
    session = SessionLocal()
    try:
        med = Medicine(
            name="Sertraline 50mg",
            category="Psychiatry",
            strength="50mg",
            unit="Tablet",
            reorder_level=20,
            selling_price=1200,
            active=True,
        )
        user = session.query(User).filter(User.username == "manager_intel").first()
        session.add(med)
        session.commit()

        # Batch expiring in 15 days, 15 units available
        b = Batch(
            medicine_id=med.id,
            batch_number="SER-01",
            expiry_date=FIXED_TODAY + timedelta(days=15),
            quantity_received=15,
            quantity_available=15,  # 15 <= 20 reorder level
            purchase_price=600,
            status="ACTIVE",
        )
        session.add(b)
        session.commit()

        # Simulate 30 sales in the last 30 days -> daily velocity = 1.0 unit/day
        sale = Sale(
            reference_number="SAL-SIM-VELOCITY",
            user_id=user.id,
            total_amount=36000,
            status="COMPLETED",
        )
        session.add(sale)
        session.flush()

        sale_item = SaleItem(
            sale_id=sale.id,
            batch_id=b.id,
            medicine_id=med.id,
            quantity=30,
            unit_price_snapshot=1200,
            subtotal=36000,
        )
        session.add(sale_item)
        session.commit()

        # Daily velocity is 1.0. Days until expiry = 15. Expected demand until expiry = 15.
        # Eligible stock is 15 >= 15 demand -> triggers Case A (MONITOR + use FEFO)!
        intel = analyze_inventory_intelligence(session)
        recs = [r for r in intel["recommendations"] if r["medicine_id"] == med.id]
        assert len(recs) == 1
        r = recs[0]
        assert r["risk_type"] == "MONITOR"
        assert "Rule A" in r["rule_applied"]
        assert "MONITOR + use FEFO" in r["suggested_action"]
        assert r["suggested_quantity"] is None
    finally:
        session.close()

def test_case_d_expiry_risk_with_healthy_stock():
    session = SessionLocal()
    try:
        med = Medicine(
            name="Levothyroxine 50mcg",
            category="Thyroid",
            strength="50mcg",
            unit="Tablet",
            reorder_level=20,
            selling_price=400,
            active=True,
        )
        session.add(med)
        session.commit()

        # Stock is 100 (> 20 reorder, so no shortage), but lot expires in 6 days (critical!)
        b = Batch(
            medicine_id=med.id,
            batch_number="LEVO-EXP-CRIT",
            expiry_date=FIXED_TODAY + timedelta(days=6),
            quantity_received=100,
            quantity_available=100,
            purchase_price=200,
            status="ACTIVE",
        )
        session.add(b)
        session.commit()

        intel = analyze_inventory_intelligence(session)
        recs = [r for r in intel["recommendations"] if r["medicine_id"] == med.id]
        assert len(recs) == 1
        r = recs[0]
        assert r["risk_type"] == "EXPIRY"
        assert "Rule D" in r["rule_applied"]
        assert "prioritize" in r["suggested_action"].lower() or "fefo" in r["suggested_action"].lower()
    finally:
        session.close()
