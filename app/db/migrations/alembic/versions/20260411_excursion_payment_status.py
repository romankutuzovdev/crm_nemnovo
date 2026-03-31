"""excursions.payment_status — статус оплаты мероприятия

Revision ID: 20260411_exc_pay_stat
Revises: 20260410_exc_client_notif
Create Date: 2026-04-11

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260411_exc_pay_stat"
down_revision: Union[str, None] = "20260410_exc_client_notif"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "excursions",
        sa.Column(
            "payment_status",
            sa.String(length=30),
            nullable=False,
            server_default="unpaid",
        ),
    )
    op.create_index(op.f("ix_excursions_payment_status"), "excursions", ["payment_status"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_excursions_payment_status"), table_name="excursions")
    op.drop_column("excursions", "payment_status")
