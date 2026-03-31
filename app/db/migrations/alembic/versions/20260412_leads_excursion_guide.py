"""leads: optional excursion guide on lead

Revision ID: 20260412_leads_exc_guide
Revises: 20260412_lead_service_items
Create Date: 2026-04-12

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from app.db.types import GUID


revision: str = "20260412_leads_exc_guide"
down_revision: Union[str, None] = "20260412_lead_service_items"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("leads", schema=None) as batch_op:
        batch_op.add_column(sa.Column("excursion_guide_id", GUID(), nullable=True))
        batch_op.create_index(
            batch_op.f("ix_leads_excursion_guide_id"),
            ["excursion_guide_id"],
            unique=False,
        )
        batch_op.create_foreign_key(
            "fk_leads_excursion_guide_id",
            "excursion_guides",
            ["excursion_guide_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("leads", schema=None) as batch_op:
        batch_op.drop_constraint("fk_leads_excursion_guide_id", type_="foreignkey")
        batch_op.drop_index(batch_op.f("ix_leads_excursion_guide_id"))
        batch_op.drop_column("excursion_guide_id")

