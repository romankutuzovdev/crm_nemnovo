"""leads: add preferred_datetime for calendar time edits

Revision ID: 20260413_lead_pref_dt
Revises: 20260412_leads_exc_guide
Create Date: 2026-04-13

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260413_lead_pref_dt"
down_revision: Union[str, None] = "20260412_leads_exc_guide"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("leads", schema=None) as batch_op:
        batch_op.add_column(sa.Column("preferred_datetime", sa.DateTime(timezone=False), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("leads", schema=None) as batch_op:
        batch_op.drop_column("preferred_datetime")

