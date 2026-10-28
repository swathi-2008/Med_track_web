# MedTrack — Pharmacy Stock & Expiry Manager

> **Enterprise Pharmacy Management Web Application**  
> Complete web redesign of the Java Swing MedTrack project, featuring strict FEFO dispensing, multi-tier expiry tracking, guarded atomic rowcount concurrency, procurement lifecycle (PR → PO → GRN), role-based access control (RBAC), and deterministic decision support.

---

## 1. Architectural Overview & Tech Stack

MedTrack is built as a clean, decoupled application:

- **Backend:** Python 3.10+ with **FastAPI**, **Pydantic v2**, and **SQLAlchemy 2.0** (typed ORM).
- **Database:** SQLite with strict connection pragmas:
  - `PRAGMA foreign_keys = ON`
  - `PRAGMA journal_mode = WAL` (Write-Ahead Logging for concurrent reads and writes)
  - `PRAGMA busy_timeout = 5000` (5-second writer queue timeout)
  - Explicit `BEGIN IMMEDIATE` transactions for all stock-mutating operations.
- **Migrations:** **Alembic** (`migrations/`). Database schema is maintained solely through versioned migrations (`alembic upgrade head`); production paths never invoke destructive `create_all` or reset data at startup.
- **Frontend:** Vanilla HTML5, modern CSS3, vanilla ES6+ JavaScript, Fetch API, Chart.js, and Lucide icons. Static files are served directly by FastAPI at `/`.
- **Security:**
  - Password hashing with **bcrypt** (cost factor 12).
  - Server-side SHA-256 session tokens stored in `HttpOnly`, `SameSite=Lax` cookies.
  - Double-submit CSRF tokens (`X-CSRF-Token`) validated on all mutating HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`).
  - Brute-force rate limiting (5 consecutive failed login attempts locks account for 10 minutes).
  - Formula injection neutralization (cells beginning with `=`, `+`, `-`, `@` prefixed with `'` in all CSV downloads).

---

## 2. Role-Based Access Control (RBAC) Matrix

MedTrack strictly enforces four distinct roles at the backend dependency level (`require_roles`):

| Feature / Action | ADMIN | MANAGER | SALES_STAFF | PURCHASE_STAFF |
| :--- | :---: | :---: | :---: | :---: |
| **Executive Dashboard & KPIs** | Full | Full | Dispensing focus | Purchasing focus |
| **User Administration & Roles** | CRUD | ❌ | ❌ | ❌ |
| **Last Active Admin Protection** | Enforced | — | — | — |
| **System Audit Logs** | View | ❌ | ❌ | ❌ |
| **Medicine Master Catalog** | CRUD | View | View | View |
| **Batch Inventory** | View | View | View | View |
| **Expiry Risk Center & Quarantine** | Full | Full | View | View |
| **Decision Intelligence (Cases A–E)** | View | View | ❌ | ❌ |
| **POS Counter Checkout (FEFO)** | Full | ❌ | Full | ❌ |
| **Sales Receipts & Reprint** | Full | View | Full | ❌ |
| **Purchase Requisition (PR)** | Create | Review/Approve | ❌ | Create |
| **PR Self-Approval Block** | Enforced | Enforced | — | — |
| **Purchase Order (PO)** | View | View | ❌ | Generate |
| **Goods Receipt (GRN)** | Receive | Receive | ❌ | Receive |
| **Stock Adjustments** | Request/Review | Review | ❌ | Request |
| **Suppliers Directory** | CRUD | View | ❌ | CRUD |
| **Reports & CSV Exports** | Full | Full | Sales Only | Purchases Only |

---

## 3. Core Business Logic & Rules

### A. FEFO Stock Allocation (First-Expired, First-Out)
- Active lots with positive `quantity_available` are ordered chronologically by `expiry_date ASC`, breaking ties deterministically by `batch_id ASC`.
- Expired lots (`expiry_date < today`) and quarantined lots are strictly excluded from dispensing.
- Multi-batch order lines are automatically broken down across the earliest available lots.
- Every batch deduction executes inside an atomic write transaction guarded by rowcount:
  ```sql
  UPDATE batches SET quantity_available = quantity_available - :q
  WHERE id = :batch_id AND quantity_available >= :q
  ```
  If another cashier concurrent transaction depleted the batch, rowcount equals `0` and triggers an immediate rollback with a 409 Conflict.
- `Idempotency-Key` headers on sales requests cache transaction responses, preventing double-billing on network retries.

### B. Expiry Risk Center
Batches are categorized into actionable risk tiers relative to the current business date:
- **EXPIRED (`< 0 days`):** Past expiration date. Immediate quarantine required; cannot be dispensed.
- **CRITICAL (`0 – 7 days`):** Immediate emergency dispensing priority or supplier return.
- **HIGH (`8 – 30 days`):** Dispense aggressively via FEFO.
- **MEDIUM (`31 – 60 days`):** Monitored window.
- **LOW / HEALTHY (`> 60 days`):** Normal shelf-life buffer.
- Every tier calculates **Value-at-Risk** (Quantity × Acquisition Cost) to evaluate financial write-off exposure.

### C. Decision Support Engine (Cases A–E)
> *Explicit Disclaimer in UI: "Rule-based decision support — not machine learning"*

Every recommendation provides a structured 5-part explanation:
1. **Problem:** Current inventory anomaly observed.
2. **Data Considered:** Eligible stock, reorder level, days to expiry, 30-day dispensing velocity, incoming shipments.
3. **Rule Applied:** Deterministic threshold formula.
4. **Suggested Action:** Prescribed human workflow.
5. **Reason:** Clinical and financial justification.

**Cases:**
- **Case A (Velocity-Balanced Monitoring):** Low stock (`stock <= reorder_level`), but forecasted dispensing velocity will consume expiring lots before shelf-life expires (`velocity * days >= expiring_units`). Action: `MONITOR + use FEFO`; do not purchase yet to prevent crowding out expiring stock.
- **Case B (Uncovered Shortage):** Stock plus confirmed incoming POs is below reorder level. Action: Suggest replenishment quantity `(reorder_level * 2.0) - (stock + incoming)`.
- **Case C (Expired Stock Containment):** Zero tolerance. Immediate clinical quarantine and removal.
- **Case D (Shelf-Life Loss Minimization):** Overall stock is healthy, but near-expiry lots (`<= 30 days`) are present. Action: Prioritize dispensing and review supplier return agreements.
- **Case E (In-Flight PO Shortage Neutralization):** On-hand stock is low, but existing Open Purchase Orders fully offset the gap. Action: Do not raise duplicate requisitions; expedite goods receipt.
- **Dual-Risk (Compound Inventory Matrix):** Stock is below reorder level, AND expiring stock cannot be cleared by expected sales rate. High risk of both stockout and capital write-off.

### D. Procurement Lifecycle
1. **Purchase Request (PR):** Raised by Purchase Staff when items approach reorder level.
2. **Manager Review:** Managers approve or reject. **Self-approval is strictly prohibited** (a manager cannot approve a PR they created). Rejection requires a mandatory explanatory reason.
3. **Purchase Order (PO):** Created upon PR approval or directly for contracted suppliers.
4. **Goods Receipt (GRN):**
   - Inbound batches require an expiry date strictly in the future (`expiry_date > today`).
   - Received quantities cannot exceed ordered quantities (`quantity_received + delivery <= quantity_ordered`).
   - Generates active inventory batch and records an immutable ledger entry.
   - Automatically updates PO status to `PARTIALLY_RECEIVED` or `COMPLETED`.

---

## 4. Quickstart & Windows PowerShell Execution

### Option 1: Native Windows PowerShell (`run.ps1`)
The included `run.ps1` script handles complete environment setup, testing, and startup:

```powershell
# 1. Run migrations, execute test suite, and launch server:
.\run.ps1

# 2. Run with demonstration dataset pre-populated:
.\run.ps1 -Demo

# 3. Launch in development auto-reload mode on port 8000:
.\run.ps1 -Reload

# 4. Skip tests during rapid development:
.\run.ps1 -SkipTests
```

### Option 2: Manual Terminal Setup

```bash
# 1. Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate       # On Windows: .venv\Scripts\Activate.ps1

# 2. Install dependencies
pip install -r requirements.txt -r requirements-dev.txt

# 3. Run database migrations
alembic upgrade head

# 4. Run test suite
PYTHONPATH=. pytest tests/

# 5. (Optional) Seed demonstration dataset
python -m app.seed_demo

# 6. Start the server
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Access the application in your browser at `http://localhost:8000`.

---

## 5. Demonstration Credentials

When seeded via `python -m app.seed_demo` or `.\run.ps1 -Demo`, the following accounts are available:

| Role | Username | Password | Purpose |
| :--- | :--- | :--- | :--- |
| **ADMIN** | `admin` | `Admin@MedTrack2026!` | Full system control, user accounts, audit trail |
| **MANAGER** | `manager` | `Manager@MedTrack2026!` | Requisition approvals, dual-risk analytics, expiry center |
| **SALES_STAFF** | `sales` | `Sales@MedTrack2026!` | POS counter checkout, receipt printing, FEFO dispensing |
| **PURCHASE_STAFF**| `purchase` | `Purchase@MedTrack2026!` | Requisitions, PO monitoring, goods receipt (GRN) |

---

## 6. SQLite Concurrency & Production PostgreSQL Migration

### SQLite Concurrency Controls
MedTrack employs battle-tested SQLite concurrency settings:
- **WAL Mode (`PRAGMA journal_mode=WAL`):** Allows non-blocking readers during active write transactions.
- **Busy Timeout (`PRAGMA busy_timeout=5000`):** Writers wait up to 5 seconds to acquire locks rather than immediately raising `SQLITE_BUSY`.
- **`BEGIN IMMEDIATE`:** Write transactions immediately acquire a reserved lock at transaction start rather than upgrading upon the first write, eliminating write-deadlocks.

### PostgreSQL Migration Guide
For enterprise multi-branch deployments exceeding 100 concurrent checkout registers:
1. Install `psycopg2-binary` or `asyncpg`.
2. Configure `MEDTRACK_DB_PATH` in `.env` to a PostgreSQL connection URI:
   `postgresql+psycopg2://user:password@localhost:5432/medtrack`
3. Update `app/database.py` to remove SQLite PRAGMA event listeners when using PostgreSQL dialects.
4. Run `alembic upgrade head` against the PostgreSQL database. All SQLAlchemy models utilize standard SQL types (`String(36)`, `Integer`, `DateTime`, `CheckConstraint`) fully compatible with PostgreSQL.
