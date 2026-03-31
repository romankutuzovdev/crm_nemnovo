"""excursions.payer_company_id — организация, от которой оплата

Revision ID: 20260409_excursion_payer_co
Revises: 20260408_asset_qty
Create Date: 2026-04-09

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from app.db.types import GUID

revision: str = "20260409_excursion_payer_co"
down_revision: Union[str, None] = "20260408_asset_qty"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("excursions", sa.Column("payer_company_id", GUID(), nullable=True))
    op.create_index(
        op.f("ix_excursions_payer_company_id"), "excursions", ["payer_company_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_excursions_payer_company_id"), table_name="excursions")
    op.drop_column("excursions", "payer_company_id")
