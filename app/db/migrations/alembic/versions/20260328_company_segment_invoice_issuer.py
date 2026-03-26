"""company.segment + invoice.issuer_company_id

Revision ID: 20260328_segment
Revises: 20260327_rafting
Create Date: 2026-03-28

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from app.db.types import GUID

revision: str = "20260328_segment"
down_revision: Union[str, None] = "20260327_rafting"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("companies", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "segment",
                sa.String(length=10),
                nullable=False,
                server_default="b2b",
            )
        )

    with op.batch_alter_table("invoices", schema=None) as batch_op:
        batch_op.add_column(sa.Column("issuer_company_id", GUID(), nullable=True))
        batch_op.create_foreign_key(
            "fk_invoices_issuer_company_id_companies",
            "companies",
            ["issuer_company_id"],
            ["id"],
            ondelete="SET NULL",
        )
    op.create_index(
        op.f("ix_invoices_issuer_company_id"),
        "invoices",
        ["issuer_company_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_invoices_issuer_company_id"), table_name="invoices")
    with op.batch_alter_table("invoices", schema=None) as batch_op:
        batch_op.drop_constraint("fk_invoices_issuer_company_id_companies", type_="foreignkey")
        batch_op.drop_column("issuer_company_id")

    with op.batch_alter_table("companies", schema=None) as batch_op:
        batch_op.drop_column("segment")
