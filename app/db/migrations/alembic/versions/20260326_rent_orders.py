"""rent catalog and orders

Revision ID: 20260326_rent
Revises: 20260326_hostel
Create Date: 2026-03-26

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from app.db.types import GUID

revision: str = "20260326_rent"
down_revision: Union[str, None] = "20260326_hostel"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "rent_catalog_items",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("unit_label", sa.String(length=50), nullable=True),
        sa.Column("default_unit_price", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_rent_catalog_items_created_at"), "rent_catalog_items", ["created_at"], unique=False)

    op.create_table(
        "rent_orders",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("service_date", sa.Date(), nullable=False),
        sa.Column("deal_id", GUID(), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("total_amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["deal_id"], ["deals.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_rent_orders_created_at"), "rent_orders", ["created_at"], unique=False)
    op.create_index(op.f("ix_rent_orders_deal_id"), "rent_orders", ["deal_id"], unique=False)
    op.create_index(op.f("ix_rent_orders_service_date"), "rent_orders", ["service_date"], unique=False)
    op.create_index(op.f("ix_rent_orders_status"), "rent_orders", ["status"], unique=False)

    op.create_table(
        "rent_order_lines",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("order_id", GUID(), nullable=False),
        sa.Column("catalog_item_id", GUID(), nullable=True),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("line_total", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.ForeignKeyConstraint(["catalog_item_id"], ["rent_catalog_items.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["order_id"], ["rent_orders.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_rent_order_lines_catalog_item_id"), "rent_order_lines", ["catalog_item_id"], unique=False)
    op.create_index(op.f("ix_rent_order_lines_order_id"), "rent_order_lines", ["order_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_rent_order_lines_order_id"), table_name="rent_order_lines")
    op.drop_index(op.f("ix_rent_order_lines_catalog_item_id"), table_name="rent_order_lines")
    op.drop_table("rent_order_lines")
    op.drop_index(op.f("ix_rent_orders_status"), table_name="rent_orders")
    op.drop_index(op.f("ix_rent_orders_service_date"), table_name="rent_orders")
    op.drop_index(op.f("ix_rent_orders_deal_id"), table_name="rent_orders")
    op.drop_index(op.f("ix_rent_orders_created_at"), table_name="rent_orders")
    op.drop_table("rent_orders")
    op.drop_index(op.f("ix_rent_catalog_items_created_at"), table_name="rent_catalog_items")
    op.drop_table("rent_catalog_items")
