"""contracts table; deals.contract_id, contract_text

Revision ID: 20260403_contracts
Revises: 20260402_item_kind
Create Date: 2026-04-03

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from app.db.types import GUID

revision: str = "20260403_contracts"
down_revision: Union[str, None] = "20260402_item_kind"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "contracts",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("company_id", GUID(), nullable=False),
        sa.Column("number", sa.String(length=100), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_contracts_company_id", "contracts", ["company_id"], unique=False)
    op.create_index("ix_contracts_number", "contracts", ["number"], unique=False)

    with op.batch_alter_table("deals", schema=None) as batch_op:
        batch_op.add_column(sa.Column("contract_id", GUID(), nullable=True))
        batch_op.add_column(sa.Column("contract_text", sa.Text(), nullable=True))
        batch_op.create_foreign_key(
            "fk_deals_contract_id_contracts",
            "contracts",
            ["contract_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch_op.create_index("ix_deals_contract_id", ["contract_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("deals", schema=None) as batch_op:
        batch_op.drop_index("ix_deals_contract_id")
        batch_op.drop_constraint("fk_deals_contract_id_contracts", type_="foreignkey")
        batch_op.drop_column("contract_text")
        batch_op.drop_column("contract_id")
    op.drop_index("ix_contracts_number", table_name="contracts")
    op.drop_index("ix_contracts_company_id", table_name="contracts")
    op.drop_table("contracts")
