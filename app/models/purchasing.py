import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, CheckConstraint, Index
from sqlalchemy.orm import relationship
from app.database import Base

def generate_uuid() -> str:
    return str(uuid.uuid4())

class PurchaseRequest(Base):
    __tablename__ = "purchase_requests"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    request_number = Column(String(64), unique=True, nullable=False, index=True)
    requested_by_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    status = Column(String(32), default="PENDING", nullable=False)  # PENDING, APPROVED, REJECTED
    reviewed_by_id = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    review_reason = Column(String(256), nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        CheckConstraint("status IN ('PENDING', 'APPROVED', 'REJECTED')", name="chk_pr_status_valid"),
    )

    requested_by = relationship("User", foreign_keys=[requested_by_id])
    reviewed_by = relationship("User", foreign_keys=[reviewed_by_id])
    items = relationship("PurchaseRequestItem", back_populates="request", cascade="all, delete-orphan")
    purchase_orders = relationship("PurchaseOrder", back_populates="request")


class PurchaseRequestItem(Base):
    __tablename__ = "purchase_request_items"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    request_id = Column(String(36), ForeignKey("purchase_requests.id", ondelete="CASCADE"), nullable=False, index=True)
    medicine_id = Column(String(36), ForeignKey("medicines.id"), nullable=False, index=True)
    quantity_requested = Column(Integer, nullable=False)
    notes = Column(String(256), nullable=True)

    __table_args__ = (
        CheckConstraint("quantity_requested > 0", name="chk_pri_qty_positive"),
    )

    request = relationship("PurchaseRequest", back_populates="items")
    medicine = relationship("Medicine")


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    po_number = Column(String(64), unique=True, nullable=False, index=True)
    request_id = Column(String(36), ForeignKey("purchase_requests.id"), nullable=True, index=True)
    supplier_id = Column(String(36), ForeignKey("suppliers.id"), nullable=False, index=True)
    status = Column(String(32), default="OPEN", nullable=False)  # OPEN, PARTIALLY_RECEIVED, RECEIVED, CANCELLED
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        CheckConstraint("status IN ('OPEN', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED')", name="chk_po_status_valid"),
    )

    request = relationship("PurchaseRequest", back_populates="purchase_orders")
    supplier = relationship("Supplier", back_populates="purchase_orders")
    items = relationship("PurchaseOrderItem", back_populates="purchase_order", cascade="all, delete-orphan")
    goods_receipts = relationship("GoodsReceipt", back_populates="purchase_order")


class PurchaseOrderItem(Base):
    __tablename__ = "purchase_order_items"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    po_id = Column(String(36), ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    medicine_id = Column(String(36), ForeignKey("medicines.id"), nullable=False, index=True)
    quantity_ordered = Column(Integer, nullable=False)
    quantity_received = Column(Integer, default=0, nullable=False)
    unit_price = Column(Integer, nullable=False)  # minor units (paise)

    __table_args__ = (
        CheckConstraint("quantity_ordered > 0", name="chk_poi_qty_ordered_positive"),
        CheckConstraint("quantity_received >= 0", name="chk_poi_qty_received_non_negative"),
        CheckConstraint("unit_price >= 0", name="chk_poi_unit_price_non_negative"),
    )

    purchase_order = relationship("PurchaseOrder", back_populates="items")
    medicine = relationship("Medicine")


class GoodsReceipt(Base):
    __tablename__ = "goods_receipts"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    receipt_number = Column(String(64), unique=True, nullable=False, index=True)
    po_id = Column(String(36), ForeignKey("purchase_orders.id"), nullable=False, index=True)
    received_by_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    idempotency_key = Column(String(128), unique=True, nullable=True, index=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    purchase_order = relationship("PurchaseOrder", back_populates="goods_receipts")
    received_by = relationship("User")
    items = relationship("GoodsReceiptItem", back_populates="receipt", cascade="all, delete-orphan")


class GoodsReceiptItem(Base):
    __tablename__ = "goods_receipt_items"

    id = Column(String(36), primary_key=True, default=generate_uuid)
    receipt_id = Column(String(36), ForeignKey("goods_receipts.id", ondelete="CASCADE"), nullable=False, index=True)
    po_item_id = Column(String(36), ForeignKey("purchase_order_items.id"), nullable=False, index=True)
    batch_id = Column(String(36), ForeignKey("batches.id"), nullable=False, index=True)
    quantity_received = Column(Integer, nullable=False)
    purchase_price = Column(Integer, nullable=False)  # minor units (paise)

    __table_args__ = (
        CheckConstraint("quantity_received > 0", name="chk_gri_qty_received_positive"),
        CheckConstraint("purchase_price >= 0", name="chk_gri_purchase_price_non_negative"),
    )

    receipt = relationship("GoodsReceipt", back_populates="items")
    po_item = relationship("PurchaseOrderItem")
    batch = relationship("Batch")
