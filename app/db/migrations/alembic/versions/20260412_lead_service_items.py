"""leads: structured service items for audit-friendly edits

Revision ID: 20260412_lead_service_items
Revises: 20260411_exc_pay_stat
Create Date: 2026-04-12

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from app.db.types import GUID


revision: str = "20260412_lead_service_items"
down_revision: Union[str, None] = "20260411_exc_pay_stat"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "lead_service_items",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("lead_id", GUID(), nullable=False),
        sa.Column("client_id", GUID(), nullable=True),
        sa.Column("service_type", sa.String(length=50), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="SET NULL"),
    )
    op.create_index(op.f("ix_lead_service_items_lead_id"), "lead_service_items", ["lead_id"], unique=False)
    op.create_index(op.f("ix_lead_service_items_client_id"), "lead_service_items", ["client_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_lead_service_items_client_id"), table_name="lead_service_items")
    op.drop_index(op.f("ix_lead_service_items_lead_id"), table_name="lead_service_items")
    op.drop_table("lead_service_items")

