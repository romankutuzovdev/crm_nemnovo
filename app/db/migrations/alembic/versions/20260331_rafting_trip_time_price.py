"""rafting_trips: start time + client trip price

Revision ID: 20260331_raft_time_price
Revises: 20260330_deal_item_client
Create Date: 2026-03-31

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260331_raft_time_price"
down_revision: Union[str, None] = "20260330_deal_item_client"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("rafting_trips", schema=None) as batch_op:
        batch_op.add_column(sa.Column("trip_start_time", sa.Time(), nullable=True))
        batch_op.add_column(sa.Column("trip_price", sa.Numeric(12, 2), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("rafting_trips", schema=None) as batch_op:
        batch_op.drop_column("trip_price")
        batch_op.drop_column("trip_start_time")
