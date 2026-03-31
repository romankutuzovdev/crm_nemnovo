"""transport_vehicles: brand, model, org, trip_cost, driver; drop legacy name

Revision ID: 20260406_transport_ext
Revises: 20260405_instr_passport
Create Date: 2026-04-06

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "20260406_transport_ext"
down_revision: Union[str, None] = "20260405_instr_passport"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("transport_vehicles", schema=None) as batch_op:
        batch_op.add_column(sa.Column("brand", sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column("model", sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column("organization", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("trip_cost", sa.Numeric(12, 2), nullable=True))
        batch_op.add_column(sa.Column("driver_details", sa.Text(), nullable=True))

    conn = op.get_bind()
    conn.execute(sa.text("UPDATE transport_vehicles SET brand = name WHERE brand IS NULL"))
    conn.execute(sa.text("UPDATE transport_vehicles SET brand = 'ТС' WHERE brand IS NULL OR TRIM(brand) = ''"))

    with op.batch_alter_table("transport_vehicles", schema=None) as batch_op:
        batch_op.alter_column(
            "brand",
            existing_type=sa.String(length=120),
            nullable=False,
        )
        batch_op.drop_column("name")


def downgrade() -> None:
    with op.batch_alter_table("transport_vehicles", schema=None) as batch_op:
        batch_op.add_column(sa.Column("name", sa.String(length=255), nullable=True))

    conn = op.get_bind()
    conn.execute(
        sa.text(
            "UPDATE transport_vehicles SET name = TRIM(COALESCE(brand, '') || ' ' || COALESCE(model, ''))"
        )
    )
    conn.execute(sa.text("UPDATE transport_vehicles SET name = brand WHERE name IS NULL OR TRIM(name) = ''"))

    with op.batch_alter_table("transport_vehicles", schema=None) as batch_op:
        batch_op.alter_column(
            "name",
            existing_type=sa.String(length=255),
            nullable=False,
        )
        batch_op.drop_column("driver_details")
        batch_op.drop_column("trip_cost")
        batch_op.drop_column("organization")
        batch_op.drop_column("model")
        batch_op.drop_column("brand")
