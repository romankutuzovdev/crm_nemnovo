"""deal_items: item_kind primary | addon

Revision ID: 20260402_item_kind
Revises: 20260401_ui_colors
Create Date: 2026-04-02

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260402_item_kind"
down_revision: Union[str, None] = "20260401_ui_colors"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("deal_items", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "item_kind",
                sa.String(length=20),
                nullable=False,
                server_default="primary",
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("deal_items", schema=None) as batch_op:
        batch_op.drop_column("item_kind")
