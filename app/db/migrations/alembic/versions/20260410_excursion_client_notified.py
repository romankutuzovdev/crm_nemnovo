"""excursion_client_links.client_notified — клиент оповещён о мероприятии

Revision ID: 20260410_exc_client_notif
Revises: 20260409_excursion_payer_co
Create Date: 2026-04-10

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260410_exc_client_notif"
down_revision: Union[str, None] = "20260409_excursion_payer_co"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "excursion_client_links",
        sa.Column("client_notified", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("excursion_client_links", "client_notified")
