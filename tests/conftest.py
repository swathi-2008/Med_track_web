import pytest
from datetime import date, datetime, timezone
from fastapi.testclient import TestClient

from app.main import create_app
from app.clock import reset_test_clock, set_test_clock
from app.database import SessionLocal
from app.models.purchasing import (
    GoodsReceiptItem,
    GoodsReceipt,
    PurchaseOrderItem,
    PurchaseOrder,
    PurchaseRequestItem,
    PurchaseRequest,
)
from app.models.sales import SaleItem, Sale
from app.models.stock import StockTransaction, StockAdjustment
from app.models.batch import Batch
from app.models.medicine import Medicine, Supplier
from app.models.user import UserSession, User
from app.models.audit import AuditLog, IdempotencyKey

def clear_all_tables(session):
    """Deletes all table records in strict child-to-parent foreign-key order."""
    session.query(GoodsReceiptItem).delete()
    session.query(GoodsReceipt).delete()
    session.query(PurchaseOrderItem).delete()
    session.query(PurchaseOrder).delete()
    session.query(PurchaseRequestItem).delete()
    session.query(PurchaseRequest).delete()
    session.query(SaleItem).delete()
    session.query(Sale).delete()
    session.query(StockTransaction).delete()
    session.query(StockAdjustment).delete()
    session.query(Batch).delete()
    session.query(Medicine).delete()
    session.query(Supplier).delete()
    session.query(UserSession).delete()
    session.query(AuditLog).delete()
    session.query(IdempotencyKey).delete()
    session.query(User).delete()
    session.commit()

@pytest.fixture(autouse=True)
def clean_clock():
    reset_test_clock()
    yield
    reset_test_clock()

@pytest.fixture
def client():
    app_instance = create_app()
    with TestClient(app_instance) as test_client:
        yield test_client
