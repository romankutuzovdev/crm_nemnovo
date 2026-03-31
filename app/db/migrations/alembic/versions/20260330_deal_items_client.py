"""deal_items optional client per line

Revision ID: 20260330_deal_item_client
Revises: 20260330_rafting_payouts
Create Date: 2026-03-30

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from app.db.types import GUID

revision: str = "20260330_deal_item_client"
down_revision: Union[str, None] = "20260330_rafting_payouts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("deal_items", schema=None) as batch_op:
        batch_op.add_column(sa.Column("client_id", GUID(), nullable=True))
        batch_op.create_foreign_key(
            "fk_deal_items_client_id_clients",
            "clients",
            ["client_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index("ix_deal_items_client_id", ["client_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("deal_items", schema=None) as batch_op:
        batch_op.drop_index("ix_deal_items_client_id")
        batch_op.drop_constraint("fk_deal_items_client_id_clients", type_="foreignkey")
        batch_op.drop_column("client_id")
