"""Idempotent demonstration seed script for MedTrack.

Can be run via:
  python -m app.seed_demo
or
  .\\run.ps1 -Demo
"""
from datetime import datetime, timedelta, timezone, time
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.clock import get_today, get_utcnow

from app.models.user import User
from app.models.medicine import Medicine, Supplier
from app.models.batch import Batch
from app.models.purchasing import (
    PurchaseRequest, PurchaseRequestItem,
    PurchaseOrder, PurchaseOrderItem,
)
from app.models.sales import Sale, SaleItem
from app.models.stock import StockTransaction, StockAdjustment
from app.models.audit import AuditLog
from app.security.passwords import hash_password

def seed_demo_data():
    db: Session = SessionLocal()
    try:
        today = get_today()

        now = get_utcnow()

        # 1. Check if already seeded
        existing_admin = db.query(User).filter(User.username == "admin").first()
        if existing_admin:
            print("Demo data already seeded. Skipping to preserve idempotency.")
            return

        print("Seeding MedTrack demonstration data...")

        # 2. Roles and Users (4 strict roles)
        users_config = [
            ("admin", "Admin@MedTrack2026!", "System Administrator", "ADMIN"),
            ("manager", "Manager@MedTrack2026!", "Clinical Pharmacy Manager", "MANAGER"),
            ("sales", "Sales@MedTrack2026!", "Senior Dispensing Pharmacist", "SALES_STAFF"),
            ("purchase", "Purchase@MedTrack2026!", "Procurement Officer", "PURCHASE_STAFF"),
        ]

        users = {}
        for username, password, full_name, role in users_config:
            u = User(
                username=username,
                password_hash=hash_password(password),
                full_name=full_name,
                role=role,
                active=True,
            )
            db.add(u)
            users[username] = u
        db.flush()

        # 3. Suppliers
        suppliers_data = [
            ("Sun Pharma Healthcare", "Vikram Patel", "orders@sunpharma.example.com", "+91 98200 11223", "Plot 14, MIDC Industrial Area, Mumbai"),
            ("Cipla Life Sciences", "Ananya Sharma", "logistics@cipla.example.com", "+91 98110 44556", "Peninsula Chambers, Lower Parel, Mumbai"),
            ("Dr. Reddy's Laboratories", "Rajesh Varma", "distribution@drreddys.example.com", "+91 98490 77889", "Road No 3, Banjara Hills, Hyderabad"),
            ("Torrent Pharmaceuticals", "Meera Iyer", "supply@torrentpharma.example.com", "+91 98790 33445", "Torrent House, Off Ashram Road, Ahmedabad"),
        ]

        suppliers = []
        for name, contact, email, phone, addr in suppliers_data:
            s = Supplier(
                name=name,
                contact_person=contact,
                email=email,
                phone=phone,
                address=addr,
                active=True,
            )
            db.add(s)
            suppliers.append(s)
        db.flush()

        # 4. Medicine Master
        # Selling price stored in minor units (paise: INR * 100)
        medicines_data = [
            ("Paracetamol 650mg", "Analgesic", "650mg", "Tablet", 50, 450),       # ₹4.50
            ("Amoxicillin 500mg", "Antibiotic", "500mg", "Capsule", 30, 1200),     # ₹12.00
            ("Metformin 500mg", "Antidiabetic", "500mg", "Tablet", 40, 650),      # ₹6.50
            ("Atorvastatin 20mg", "Cardiovascular", "20mg", "Tablet", 35, 1850),  # ₹18.50
            ("Azithromycin 500mg", "Antibiotic", "500mg", "Tablet", 25, 2400),    # ₹24.00
            ("Pantoprazole 40mg", "Gastrointestinal", "40mg", "Tablet", 30, 1100),# ₹11.00
            ("Cetirizine 10mg", "Antihistamine", "10mg", "Tablet", 40, 350),      # ₹3.50
            ("Telmisartan 40mg", "Cardiovascular", "40mg", "Tablet", 30, 1400),   # ₹14.00
            ("Cough Relief Expectorant", "Respiratory", "100ml", "Bottle", 20, 9500), # ₹95.00
            ("Amoxicillin + Clavulanate 625mg", "Antibiotic", "625mg", "Tablet", 20, 3200), # ₹32.00
            ("Ibuprofen 400mg", "Analgesic", "400mg", "Tablet", 45, 550),         # ₹5.50
            ("Omeprazole 20mg", "Gastrointestinal", "20mg", "Capsule", 35, 800),   # ₹8.00
        ]

        medicines = []
        for name, cat, strg, unit, reorder, price in medicines_data:
            m = Medicine(
                name=name,
                category=cat,
                strength=strg,
                unit=unit,
                reorder_level=reorder,
                selling_price=price,
                active=True,
            )
            db.add(m)
            medicines.append(m)
        db.flush()

        # 5. Batches in all shelf-life states (Expired, Critical, High, Medium, Healthy)
        # b_config: (med_idx, supp_idx, batch_num, expiry_offset_days, qty_received, qty_avail, purchase_paise, status)
        batches_config = [
            # Amoxicillin 500mg (index 1) - EXPIRED lot (quarantine candidate)
            (1, 1, "AMX-2024-EXP", -14, 50, 20, 700, "ACTIVE"),
            # Amoxicillin 500mg - Healthy fresh lot
            (1, 1, "AMX-2026-F01", 180, 100, 80, 750, "ACTIVE"),

            # Paracetamol 650mg (index 0) - CRITICAL lot (≤7 days)
            (0, 0, "PCM-2026-C04", 4, 100, 35, 250, "ACTIVE"),
            # Paracetamol 650mg - Healthy lot (FEFO second in line)
            (0, 0, "PCM-2026-H12", 240, 200, 190, 260, "ACTIVE"),

            # Azithromycin 500mg (index 4) - HIGH risk lot (≤30 days)
            (4, 2, "AZI-2026-H22", 22, 60, 25, 1450, "ACTIVE"),
            (4, 2, "AZI-2027-F02", 365, 80, 75, 1500, "ACTIVE"),

            # Pantoprazole 40mg (index 5) - MEDIUM risk lot (≤60 days)
            (5, 3, "PAN-2026-M45", 48, 80, 50, 680, "ACTIVE"),
            (5, 3, "PAN-2027-F01", 420, 120, 120, 700, "ACTIVE"),

            # Metformin 500mg (index 2) - Healthy long shelf-life
            (2, 0, "MET-2027-L01", 300, 150, 140, 380, "ACTIVE"),

            # Atorvastatin 20mg (index 3) - LOW on-hand stock below reorder level (12 <= 35)
            (3, 1, "ATOR-2027-A1", 280, 50, 12, 1100, "ACTIVE"),

            # Cetirizine 10mg (index 6) - Healthy ample stock
            (6, 2, "CET-2027-C01", 330, 200, 185, 190, "ACTIVE"),

            # Telmisartan 40mg (index 7) - Low stock
            (7, 3, "TEL-2026-T01", 150, 40, 15, 850, "ACTIVE"),

            # Cough Relief (index 8) - Already Quarantined batch example
            (8, 0, "CR-2024-Q01", -45, 30, 15, 5500, "QUARANTINED"),
            (8, 0, "CR-2027-H01", 390, 50, 45, 5800, "ACTIVE"),
        ]

        batches = []
        for m_idx, s_idx, b_num, exp_days, q_rec, q_avail, cost, b_status in batches_config:
            b = Batch(
                medicine_id=medicines[m_idx].id,
                supplier_id=suppliers[s_idx].id,
                batch_number=b_num,
                expiry_date=today + timedelta(days=exp_days),
                quantity_received=q_rec,
                quantity_available=q_avail,
                purchase_price=cost,
                status=b_status,
            )
            db.add(b)
            batches.append(b)
        db.flush()

        # 6. Historical Sales (over the last 6 days for Chart.js velocity trend)
        sales_cashier = users["sales"]
        for day_offset in range(5, -1, -1):
            sale_day = today - timedelta(days=day_offset)
            sale_dt = datetime.combine(sale_day, time(11 + day_offset, 30), tzinfo=timezone.utc)

            pcm_batch = batches[3] # Paracetamol healthy batch
            amt = 10 * medicines[0].selling_price

            s = Sale(
                reference_number=f"SAL-{sale_day.strftime('%Y%m%d')}-000{6 - day_offset}",
                user_id=sales_cashier.id,
                total_amount=amt,
                status="COMPLETED",
                created_at=sale_dt,
            )
            db.add(s)
            db.flush()

            si = SaleItem(
                sale_id=s.id,
                batch_id=pcm_batch.id,
                medicine_id=medicines[0].id,
                quantity=10,
                unit_price_snapshot=medicines[0].selling_price,
                subtotal=amt,
            )
            db.add(si)

            # Stock ledger
            st = StockTransaction(
                medicine_id=medicines[0].id,
                batch_id=pcm_batch.id,
                transaction_type="SALE",
                signed_quantity=-10,
                reference_type="SALE",
                reference_id=s.reference_number,
                user_id=sales_cashier.id,
                reason="Counter POS sale",
                created_at=sale_dt,
            )
            db.add(st)

        # 7. Pending Purchase Request (Awaiting Manager review)
        pr_staff = users["purchase"]
        pr = PurchaseRequest(
            request_number=f"PR-{today.strftime('%Y%m%d')}-0001",
            requested_by_id=pr_staff.id,
            status="PENDING",
            created_at=now - timedelta(hours=3),
        )
        db.add(pr)
        db.flush()

        pri1 = PurchaseRequestItem(
            request_id=pr.id,
            medicine_id=medicines[3].id, # Atorvastatin
            quantity_requested=50,
            notes="Below reorder threshold",
        )
        pri2 = PurchaseRequestItem(
            request_id=pr.id,
            medicine_id=medicines[7].id, # Telmisartan
            quantity_requested=40,
            notes="Below reorder threshold",
        )
        db.add_all([pri1, pri2])

        # 8. Open Purchase Order (Awaiting Goods Receipt / GRN)
        po = PurchaseOrder(
            po_number=f"PO-{today.strftime('%Y%m%d')}-0001",
            supplier_id=suppliers[1].id, # Cipla
            status="OPEN",
            created_at=now - timedelta(days=1),
        )
        db.add(po)
        db.flush()


        poi = PurchaseOrderItem(
            po_id=po.id,
            medicine_id=medicines[1].id, # Amoxicillin
            quantity_ordered=100,
            quantity_received=0,
            unit_price=750,
        )
        db.add(poi)

        # 9. Initial Stock Adjustment (Pending manager review)
        adj = StockAdjustment(
            medicine_id=medicines[0].id, # Paracetamol
            batch_id=batches[2].id, # Paracetamol critical lot
            requested_by_id=pr_staff.id,
            adjusted_quantity=-2,
            reason="Sample damage inspection - blister strip crushed during transit.",
            status="PENDING",
            created_at=now - timedelta(hours=1),
        )
        db.add(adj)


        # 10. Audit Logs
        db.add(AuditLog(
            user_id=users["admin"].id,
            action="SYSTEM_INITIALIZED",
            entity_type="SYSTEM",
            details="System bootstrap and clinical demo database populated successfully.",
            created_at=now,
        ))

        db.commit()
        print("Demo data seeded successfully:")
        print("  - 4 Users: admin, manager, sales, purchase (Password: <Role>@MedTrack2026!)")
        print("  - 4 Suppliers, 12 Medicines, 11 Batches (spanning all shelf-life states)")
        print("  - 6 Historical sales for 7-day velocity chart")
        print("  - 1 Pending PR, 1 Open PO (ready for GRN), 1 Pending Stock Adjustment")
    except Exception as e:
        db.rollback()
        print(f"Error seeding demo data: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    seed_demo_data()
