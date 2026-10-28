# MedTrack — Implementation Plan & Milestone Roadmap

## Project Overview
MedTrack is an enterprise-grade Pharmacy Stock and Expiry Manager built with Python (FastAPI, SQLAlchemy 2.0, Alembic, SQLite WAL), strict role-based access control (ADMIN, MANAGER, SALES_STAFF, PURCHASE_STAFF), FEFO (First-Expired, First-Out) sales, batch tracking, Dual-Risk intelligence, purchase request-to-receipt lifecycle, stock adjustments, comprehensive audit logging, CSV reports with formula injection protection, and a responsive vanilla ES6/HTML5/CSS3 frontend.

---

## Architecture & Technology Stack
- **Backend**: Python 3.10+ with FastAPI, Pydantic v2, pydantic-settings, SQLAlchemy 2.0 (typed ORM), Alembic migrations, bcrypt password hashing.
- **Database**: SQLite WAL mode with `PRAGMA foreign_keys=ON`, `PRAGMA busy_timeout=5000`, `PRAGMA journal_mode=WAL`, `BEGIN IMMEDIATE` write transactions. Money stored as integers (minor units / paise).
- **Security**: Server-side sessions (SHA-256 tokens in HttpOnly SameSite=Lax cookies), double-submit CSRF tokens in `X-CSRF-Token` header, login rate limiter, security headers middleware, strict RBAC dependencies.
- **Clock Dependency**: Injectable `clock.py` (`get_today`, `get_utcnow`) enabling deterministic freeze-date testing.
- **Frontend**: Vanilla ES6+ modules (`api.js`, `auth.js`, `router.js`, `components.js`, page modules), semantic CSS with CSS variables, Lucide icons, Chart.js for analytics. No heavy framework; served static from FastAPI.
- **Testing**: Pytest test suite with SQLite migration runner, boundary tests, concurrency tests, and RBAC matrix validation.

---

## Milestones & Task Breakdown

### Milestone 1: Skeleton, Configuration, Layout, and Design System
- [x] Python virtualenv and dependencies pinned (`requirements.txt`, `requirements-dev.txt`).
- [x] PowerShell runner `run.ps1`, `.gitignore`, `.env.example`, `metadata.json`.
- [x] Core config module (`app/config.py`) with Pydantic Settings.
- [x] Injectable clock service (`app/clock.py`).
- [x] Error handler and standard JSON error response schema (`app/errors.py`).
- [x] FastAPI application factory with security headers and static mount (`app/main.py`).
- [x] Node/Express bridge (`server.ts`) to proxy port 3000 to Python Uvicorn backend for AI Studio environment.
- [x] Responsive frontend shell (`frontend/index.html`, `frontend/login.html`, `frontend/css/*`, `frontend/js/api.js`).

### Milestone 2: SQLite Connectivity, Models, Alembic Migration, Persistence
- [x] SQLite connection setup with PRAGMAs (WAL, foreign_keys, busy_timeout) (`app/database.py`).
- [x] SQLAlchemy 2.0 declarative models (`app/models/*`):
  - User, UserSession, Medicine, Supplier, Batch, PurchaseRequest, PurchaseRequestItem, PurchaseOrder, PurchaseOrderItem, GoodsReceipt, GoodsReceiptItem, Sale, SaleItem, StockTransaction, StockAdjustment, IdempotencyKey, AuditLog.
- [x] Alembic environment and initial migration `1cbf5badf1f1_initial_schema.py`.
- [x] Initial tests: database connection, pragmas, schema migration, model constraints.

### Milestone 3: Authentication, Sessions, CSRF, RBAC, Rate Limiting
- [x] Password hashing via bcrypt (`app/security/passwords.py`).
- [x] Session management with SHA-256 tokens (`app/security/sessions.py`).
- [x] CSRF validation via `hmac.compare_digest` (`app/security/csrf.py`).
- [x] In-memory IP + User rate limiter (`app/security/rate_limit.py`).
- [x] Role dependencies (`require_roles("ADMIN", "MANAGER", ...)`) in `app/security/dependencies.py`.
- [x] First-run admin auto-provisioning from environment variables.
- [x] Auth router (`POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`).
- [x] Login UI (`frontend/login.html`, `frontend/js/auth.js`) with inline errors and show/hide password.
- [x] Tests for auth, sessions, CSRF, rate-limiting, and RBAC.

### Milestone 4: Medicines, Suppliers, and Batches
- [x] Medicine repository, service, schemas, router (CRUD, active flag soft-delete, category, reorder level).
- [x] Supplier repository, service, schemas, router (CRUD).
- [x] Batch repository, service, schemas, router (batch creation, status patch with quarantine/recall, unique batch number per medicine).
- [x] UI for Medicines, Suppliers, Batches with sorting, search, modals, and pagination.
- [x] Pytest suite for medicine/supplier/batch operations.

### Milestone 5: ExpiryService, FEFO StockService, Expiry Risk Center
- [x] `ExpiryService`: days left calculation against injected clock, risk classification (EXPIRED, CRITICAL 0-7d, HIGH 8-30d, MEDIUM 31-60d, LOW >60d), value-at-risk computation.
- [x] `StockService`: FEFO ordering (expiry date ASC, then batch id ASC), multi-batch split suggestions, exclusion of non-saleable stock.
- [x] Expiry Risk Center API (`GET /api/batches/expiry-risk`).
- [x] Expiry Risk UI with 7/30/60 day filters, value-at-risk, and actionable guidance.
- [x] Pytest unit tests for exact boundary days (-1, 0, 7, 8, 30, 31, 60, 61) with fixed test clock.

### Milestone 6: Sales Engine, Atomic FEFO Deductions, Idempotency, Receipts
- [x] Atomic sales transaction with `BEGIN IMMEDIATE` / row-count guarded batch deduction.
- [x] Transaction reference generation (`SAL-yyyyMMdd-0001`).
- [x] Idempotency key handling via `Idempotency-Key` header.
- [x] Stock movement transaction ledger entries (`RECEIPT`, `SALE`, `ADJUSTMENT`, `QUARANTINE`).
- [x] Sales UI (product search, real-time FEFO batch preview, quantity stepper, confirmation, printable receipt modal).
- [x] Pytest tests: successful sale, stock rollback on failure, duplicate idempotent request, multithreaded concurrency test.

### Milestone 7: Purchasing, Approvals, Goods Receipts, Stock Adjustments
- [x] Purchase request creation and workflow (`PENDING` -> `APPROVED` / `REJECTED`).
- [x] Self-approval restriction (user cannot approve own request; reject requires reason).
- [x] Purchase order generation from approved requests.
- [x] Goods receipt against PO: validates open PO, quantity <= outstanding, future expiry date, updates batch & stock.
- [x] Stock adjustments: creation, review/approval workflow with atomic stock balance adjustments.
- [x] UI for Purchasing workflows, Receipts, and Adjustments.
- [x] Pytest tests for purchasing rules, self-approval prevention, and receipt validation.

### Milestone 8: DecisionEngine & Dual-Risk Intelligence Center
- [x] Deterministic rule-based `DecisionEngine` covering Cases A, B, C, D, E with 5-part explanation:
  - Problem, Data Considered, Rule Applied, Suggested Action, Reason.
- [x] Intelligence API (`GET /api/intelligence/recommendations`, `/expiry-summary`, `/stock-risk`).
- [x] Dual-Risk Intelligence Center UI with clear "Rule-based decision support" disclaimer.
- [x] Comprehensive pytest tests for cases A, B, C, D, E.

### Milestone 9: Reports, CSV Neutralization, Audit Logs, Role Dashboards
- [x] Reports service with date filtering: inventory, expiry, sales, purchases, stock movements, low-stock, valuation.
- [x] Secure CSV export with formula injection mitigation (prefixing `=`, `+`, `-`, `@`).
- [x] Audit service & API logging login, user changes, medicine edits, sales, approvals, receipts.
- [x] Role-specific dashboards (ADMIN, MANAGER, SALES_STAFF, PURCHASE_STAFF) with Chart.js charts.
- [x] Audit log viewer UI, User administration UI with last-active-admin protection, and CSV download triggers.
- [x] Comprehensive pytest tests for reports, CSV formula protection, users RBAC, and dashboard metrics.

### Milestone 10: Full Test Suite, Seed Demo, End-to-End Walkthrough & README
- [x] Idempotent `app/seed_demo.py` with one account per role and realistic pharmacy inventory across all shelf-life states.
- [x] Complete pytest suite execution and reporting (41 passed out of 41 tests).
- [x] End-to-end multi-role verification across all frontend modules.
- [x] Comprehensive `README.md` and complete documentation.
