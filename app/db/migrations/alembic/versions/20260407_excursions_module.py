"""excursions: guides, program, objects, clients, transport & finance

Revision ID: 20260407_excursions
Revises: 20260406_transport_ext
Create Date: 2026-04-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from app.db.types import GUID

revision: str = "20260407_excursions"
down_revision: Union[str, None] = "20260406_transport_ext"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "excursion_guides",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=30), nullable=True),
        sa.Column("passport_details", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_excursion_guides_created_at"), "excursion_guides", ["created_at"], unique=False)

    op.create_table(
        "excursions",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("excursion_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("guide_id", GUID(), nullable=True),
        sa.Column("vehicle_id", GUID(), nullable=True),
        sa.Column("deal_id", GUID(), nullable=True),
        sa.Column("income_total", sa.Numeric(12, 2), nullable=False),
        sa.Column("expense_total", sa.Numeric(12, 2), nullable=False),
        sa.Column("transport_income", sa.Numeric(12, 2), nullable=True),
        sa.Column("transport_expense", sa.Numeric(12, 2), nullable=True),
        sa.Column("guide_fee", sa.Numeric(12, 2), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["deal_id"], ["deals.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["guide_id"], ["excursion_guides.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["vehicle_id"], ["transport_vehicles.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_excursions_created_at"), "excursions", ["created_at"], unique=False)
    op.create_index(op.f("ix_excursions_deal_id"), "excursions", ["deal_id"], unique=False)
    op.create_index(op.f("ix_excursions_excursion_date"), "excursions", ["excursion_date"], unique=False)
    op.create_index(op.f("ix_excursions_guide_id"), "excursions", ["guide_id"], unique=False)
    op.create_index(op.f("ix_excursions_status"), "excursions", ["status"], unique=False)
    op.create_index(op.f("ix_excursions_vehicle_id"), "excursions", ["vehicle_id"], unique=False)

    op.create_table(
        "excursion_program_steps",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("excursion_id", GUID(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=True),
        sa.Column("end_time", sa.Time(), nullable=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["excursion_id"], ["excursions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_excursion_program_steps_excursion_id"),
        "excursion_program_steps",
        ["excursion_id"],
        unique=False,
    )

    op.create_table(
        "excursion_program_objects",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("step_id", GUID(), nullable=False),
        sa.Column("asset_id", GUID(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("capacity", sa.Integer(), nullable=True),
        sa.Column("unit_price", sa.Numeric(12, 2), nullable=False),
        sa.ForeignKeyConstraint(["asset_id"], ["assets.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["step_id"], ["excursion_program_steps.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_excursion_program_objects_asset_id"), "excursion_program_objects", ["asset_id"], unique=False
    )
    op.create_index(
        op.f("ix_excursion_program_objects_step_id"), "excursion_program_objects", ["step_id"], unique=False
    )

    op.create_table(
        "excursion_client_links",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("excursion_id", GUID(), nullable=False),
        sa.Column("client_id", GUID(), nullable=False),
        sa.Column("guests_count", sa.Integer(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["client_id"], ["clients.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["excursion_id"], ["excursions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("excursion_id", "client_id", name="uq_excursion_client"),
    )
    op.create_index(
        op.f("ix_excursion_client_links_client_id"), "excursion_client_links", ["client_id"], unique=False
    )
    op.create_index(
        op.f("ix_excursion_client_links_excursion_id"), "excursion_client_links", ["excursion_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_excursion_client_links_excursion_id"), table_name="excursion_client_links")
    op.drop_index(op.f("ix_excursion_client_links_client_id"), table_name="excursion_client_links")
    op.drop_table("excursion_client_links")
    op.drop_index(op.f("ix_excursion_program_objects_step_id"), table_name="excursion_program_objects")
    op.drop_index(op.f("ix_excursion_program_objects_asset_id"), table_name="excursion_program_objects")
    op.drop_table("excursion_program_objects")
    op.drop_index(op.f("ix_excursion_program_steps_excursion_id"), table_name="excursion_program_steps")
    op.drop_table("excursion_program_steps")
    op.drop_index(op.f("ix_excursions_vehicle_id"), table_name="excursions")
    op.drop_index(op.f("ix_excursions_status"), table_name="excursions")
    op.drop_index(op.f("ix_excursions_guide_id"), table_name="excursions")
    op.drop_index(op.f("ix_excursions_excursion_date"), table_name="excursions")
    op.drop_index(op.f("ix_excursions_deal_id"), table_name="excursions")
    op.drop_index(op.f("ix_excursions_created_at"), table_name="excursions")
    op.drop_table("excursions")
    op.drop_index(op.f("ix_excursion_guides_created_at"), table_name="excursion_guides")
    op.drop_table("excursion_guides")
