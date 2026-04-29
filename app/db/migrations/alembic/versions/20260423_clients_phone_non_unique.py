"""clients: allow duplicate phone numbers

Revision ID: 20260423_clients_phone_dupe
Revises: 20260414_tour_alloc
Create Date: 2026-04-23
"""

from typing import Sequence, Union

from alembic import op


revision: str = "20260423_clients_phone_dupe"
down_revision: Union[str, None] = "20260414_tour_alloc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index("ix_clients_phone", table_name="clients")
    op.create_index("ix_clients_phone", "clients", ["phone"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_clients_phone", table_name="clients")
    op.create_index("ix_clients_phone", "clients", ["phone"], unique=True)
