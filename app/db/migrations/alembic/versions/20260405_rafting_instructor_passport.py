"""rafting_instructors: passport details

Revision ID: 20260405_instr_passport
Revises: 20260404_raft_route_ppp
Create Date: 2026-04-05

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260405_instr_passport"
down_revision: Union[str, None] = "20260404_raft_route_ppp"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "rafting_instructors",
        sa.Column("passport_details", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("rafting_instructors", "passport_details")
