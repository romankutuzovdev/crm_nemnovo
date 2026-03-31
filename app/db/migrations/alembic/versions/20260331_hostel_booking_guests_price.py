"""hostel_bookings: guests_count + price per person per night

Revision ID: 20260331_hostel_guests_rate
Revises: 20260331_raft_time_price
Create Date: 2026-03-31

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260331_hostel_guests_rate"
down_revision: Union[str, None] = "20260331_raft_time_price"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("hostel_bookings", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("guests_count", sa.Integer(), nullable=False, server_default="1")
        )
        batch_op.add_column(
            sa.Column("price_per_person_per_night", sa.Numeric(10, 2), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("hostel_bookings", schema=None) as batch_op:
        batch_op.drop_column("price_per_person_per_night")
        batch_op.drop_column("guests_count")
