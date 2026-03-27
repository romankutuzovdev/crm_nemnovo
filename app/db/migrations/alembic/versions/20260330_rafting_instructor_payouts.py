"""rafting instructor payouts + trip paid flags

Revision ID: 20260330_rafting_payouts
Revises: 20260329_stock_mv
Create Date: 2026-03-30

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from app.db.types import GUID

revision: str = "20260330_rafting_payouts"
down_revision: Union[str, None] = "20260329_stock_mv"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("rafting_instructors", schema=None) as batch_op:
        batch_op.add_column(sa.Column("payout_per_trip", sa.Numeric(10, 2), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("payout_per_guest", sa.Numeric(10, 2), nullable=False, server_default="0"))

    with op.batch_alter_table("rafting_trips", schema=None) as batch_op:
        batch_op.add_column(sa.Column("instructor_fee", sa.Numeric(10, 2), nullable=True))
        batch_op.add_column(sa.Column("instructor_paid", sa.Boolean(), nullable=False, server_default=sa.false()))
        batch_op.add_column(sa.Column("instructor_paid_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("instructor_paid_by", GUID(), nullable=True))
        batch_op.create_foreign_key(
            "fk_rafting_trips_instructor_paid_by_users",
            "users",
            ["instructor_paid_by"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index("ix_rafting_trips_instructor_paid", ["instructor_paid"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("rafting_trips", schema=None) as batch_op:
        batch_op.drop_index("ix_rafting_trips_instructor_paid")
        batch_op.drop_constraint("fk_rafting_trips_instructor_paid_by_users", type_="foreignkey")
        batch_op.drop_column("instructor_paid_by")
        batch_op.drop_column("instructor_paid_at")
        batch_op.drop_column("instructor_paid")
        batch_op.drop_column("instructor_fee")

    with op.batch_alter_table("rafting_instructors", schema=None) as batch_op:
        batch_op.drop_column("payout_per_guest")
        batch_op.drop_column("payout_per_trip")

