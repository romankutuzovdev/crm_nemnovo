"""deals: tour fields and payment allocations

Revision ID: 20260414_tour_alloc
Revises: 20260413_lead_pref_dt
Create Date: 2026-04-14
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from app.db.types import GUID


revision: str = "20260414_tour_alloc"
down_revision: Union[str, None] = "20260413_lead_pref_dt"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("deals", schema=None) as batch_op:
        batch_op.add_column(sa.Column("tour_title", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("tour_type", sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column("tour_status", sa.String(length=50), nullable=True))
        batch_op.create_index("ix_deals_tour_status", ["tour_status"], unique=False)

    op.create_table(
        "payment_allocations",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("payment_id", GUID(), nullable=False),
        sa.Column("client_id", GUID(), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["payment_id"], ["payments.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_payment_allocations_payment_id"), "payment_allocations", ["payment_id"], unique=False)
    op.create_index(op.f("ix_payment_allocations_client_id"), "payment_allocations", ["client_id"], unique=False)
    op.create_index(op.f("ix_payment_allocations_created_at"), "payment_allocations", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_payment_allocations_created_at"), table_name="payment_allocations")
    op.drop_index(op.f("ix_payment_allocations_client_id"), table_name="payment_allocations")
    op.drop_index(op.f("ix_payment_allocations_payment_id"), table_name="payment_allocations")
    op.drop_table("payment_allocations")

    with op.batch_alter_table("deals", schema=None) as batch_op:
        batch_op.drop_index("ix_deals_tour_status")
        batch_op.drop_column("tour_status")
        batch_op.drop_column("tour_type")
        batch_op.drop_column("tour_title")
