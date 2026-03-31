"""rafting_routes: default price per person hint

Revision ID: 20260404_raft_route_ppp
Revises: 20260403_contracts
Create Date: 2026-04-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260404_raft_route_ppp"
down_revision: Union[str, None] = "20260403_contracts"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "rafting_routes",
        sa.Column("default_price_per_person", sa.Numeric(10, 2), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("rafting_routes", "default_price_per_person")
