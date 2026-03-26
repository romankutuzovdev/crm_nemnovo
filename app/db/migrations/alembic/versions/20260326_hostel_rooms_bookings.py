"""hostel rooms and bookings

Revision ID: 20260326_hostel
Revises: 16556b501739
Create Date: 2026-03-26

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from app.db.types import GUID

revision: str = "20260326_hostel"
down_revision: Union[str, None] = "16556b501739"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "hostel_rooms",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("code", sa.String(length=30), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("capacity", sa.Integer(), nullable=False),
        sa.Column("floor", sa.Integer(), nullable=True),
        sa.Column("base_price_per_night", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_hostel_rooms_code"), "hostel_rooms", ["code"], unique=True)
    op.create_index(op.f("ix_hostel_rooms_created_at"), "hostel_rooms", ["created_at"], unique=False)

    op.create_table(
        "hostel_bookings",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("room_id", GUID(), nullable=False),
        sa.Column("deal_id", GUID(), nullable=True),
        sa.Column("check_in", sa.Date(), nullable=False),
        sa.Column("check_out", sa.Date(), nullable=False),
        sa.Column("total_amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("check_in < check_out", name="ck_hostel_booking_dates"),
        sa.ForeignKeyConstraint(["deal_id"], ["deals.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["room_id"], ["hostel_rooms.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_hostel_bookings_check_in"), "hostel_bookings", ["check_in"], unique=False)
    op.create_index(op.f("ix_hostel_bookings_check_out"), "hostel_bookings", ["check_out"], unique=False)
    op.create_index(op.f("ix_hostel_bookings_created_at"), "hostel_bookings", ["created_at"], unique=False)
    op.create_index(op.f("ix_hostel_bookings_deal_id"), "hostel_bookings", ["deal_id"], unique=False)
    op.create_index(op.f("ix_hostel_bookings_room_id"), "hostel_bookings", ["room_id"], unique=False)
    op.create_index(op.f("ix_hostel_bookings_status"), "hostel_bookings", ["status"], unique=False)

    op.create_table(
        "hostel_guests",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("booking_id", GUID(), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=30), nullable=True),
        sa.Column("id_document", sa.String(length=120), nullable=True),
        sa.ForeignKeyConstraint(["booking_id"], ["hostel_bookings.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_hostel_guests_booking_id"), "hostel_guests", ["booking_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_hostel_guests_booking_id"), table_name="hostel_guests")
    op.drop_table("hostel_guests")
    op.drop_index(op.f("ix_hostel_bookings_status"), table_name="hostel_bookings")
    op.drop_index(op.f("ix_hostel_bookings_room_id"), table_name="hostel_bookings")
    op.drop_index(op.f("ix_hostel_bookings_deal_id"), table_name="hostel_bookings")
    op.drop_index(op.f("ix_hostel_bookings_created_at"), table_name="hostel_bookings")
    op.drop_index(op.f("ix_hostel_bookings_check_out"), table_name="hostel_bookings")
    op.drop_index(op.f("ix_hostel_bookings_check_in"), table_name="hostel_bookings")
    op.drop_table("hostel_bookings")
    op.drop_index(op.f("ix_hostel_rooms_created_at"), table_name="hostel_rooms")
    op.drop_index(op.f("ix_hostel_rooms_code"), table_name="hostel_rooms")
    op.drop_table("hostel_rooms")
