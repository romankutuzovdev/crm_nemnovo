"""ui_setting singleton: calendar_colors JSON

Revision ID: 20260401_ui_colors
Revises: 20260331_client_comment
Create Date: 2026-04-01

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260401_ui_colors"
down_revision: Union[str, None] = "20260331_client_comment"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ui_setting",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("calendar_colors", sa.JSON(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("ui_setting")
