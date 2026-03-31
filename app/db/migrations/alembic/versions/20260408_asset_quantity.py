"""assets.quantity + asset_quantity_changes history

Revision ID: 20260408_asset_qty
Revises: 20260407_excursions
Create Date: 2026-04-08

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from app.db.types import GUID

revision: str = "20260408_asset_qty"
down_revision: Union[str, None] = "20260407_excursions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("assets", sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"))
    op.create_table(
        "asset_quantity_changes",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("asset_id", GUID(), nullable=False),
        sa.Column("previous_quantity", sa.Integer(), nullable=False),
        sa.Column("new_quantity", sa.Integer(), nullable=False),
        sa.Column("delta", sa.Integer(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_by", GUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["asset_id"], ["assets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_asset_quantity_changes_asset_id"), "asset_quantity_changes", ["asset_id"], unique=False
    )
    op.create_index(
        op.f("ix_asset_quantity_changes_created_at"),
        "asset_quantity_changes",
        ["created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_asset_quantity_changes_created_at"), table_name="asset_quantity_changes")
    op.drop_index(op.f("ix_asset_quantity_changes_asset_id"), table_name="asset_quantity_changes")
    op.drop_table("asset_quantity_changes")
    op.drop_column("assets", "quantity")
