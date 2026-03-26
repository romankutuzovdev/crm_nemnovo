"""rafting catalog tables + rafting_trips

Revision ID: 20260327_rafting
Revises: 20260326_rent
Create Date: 2026-03-27

Если таблицы справочника сплава уже есть (например, из раннего create_all),
миграция может завершиться с ошибкой «table already exists» — тогда
создайте только `rafting_trips` вручную или откатите дубликаты и
примените заново.

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

from app.db.types import GUID

revision: str = "20260327_rafting"
down_revision: Union[str, None] = "20260326_rent"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "rafting_routes",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("difficulty", sa.String(length=50), nullable=True),
        sa.Column("duration_hours", sa.Integer(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_rafting_routes_created_at"), "rafting_routes", ["created_at"], unique=False)

    op.create_table(
        "rafting_instructors",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=30), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_rafting_instructors_created_at"), "rafting_instructors", ["created_at"], unique=False
    )

    op.create_table(
        "transport_vehicles",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("plate_number", sa.String(length=30), nullable=True),
        sa.Column("seats", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_transport_vehicles_created_at"), "transport_vehicles", ["created_at"], unique=False
    )

    op.create_table(
        "rafting_trips",
        sa.Column("id", GUID(), nullable=False),
        sa.Column("deal_id", GUID(), nullable=True),
        sa.Column("route_id", GUID(), nullable=False),
        sa.Column("instructor_id", GUID(), nullable=True),
        sa.Column("vehicle_id", GUID(), nullable=True),
        sa.Column("trip_date", sa.Date(), nullable=False),
        sa.Column("guests_count", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["deal_id"], ["deals.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["instructor_id"], ["rafting_instructors.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["route_id"], ["rafting_routes.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["vehicle_id"], ["transport_vehicles.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_rafting_trips_created_at"), "rafting_trips", ["created_at"], unique=False)
    op.create_index(op.f("ix_rafting_trips_deal_id"), "rafting_trips", ["deal_id"], unique=False)
    op.create_index(op.f("ix_rafting_trips_instructor_id"), "rafting_trips", ["instructor_id"], unique=False)
    op.create_index(op.f("ix_rafting_trips_route_id"), "rafting_trips", ["route_id"], unique=False)
    op.create_index(op.f("ix_rafting_trips_status"), "rafting_trips", ["status"], unique=False)
    op.create_index(op.f("ix_rafting_trips_trip_date"), "rafting_trips", ["trip_date"], unique=False)
    op.create_index(op.f("ix_rafting_trips_vehicle_id"), "rafting_trips", ["vehicle_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_rafting_trips_vehicle_id"), table_name="rafting_trips")
    op.drop_index(op.f("ix_rafting_trips_trip_date"), table_name="rafting_trips")
    op.drop_index(op.f("ix_rafting_trips_status"), table_name="rafting_trips")
    op.drop_index(op.f("ix_rafting_trips_route_id"), table_name="rafting_trips")
    op.drop_index(op.f("ix_rafting_trips_instructor_id"), table_name="rafting_trips")
    op.drop_index(op.f("ix_rafting_trips_deal_id"), table_name="rafting_trips")
    op.drop_index(op.f("ix_rafting_trips_created_at"), table_name="rafting_trips")
    op.drop_table("rafting_trips")
    op.drop_index(op.f("ix_transport_vehicles_created_at"), table_name="transport_vehicles")
    op.drop_table("transport_vehicles")
    op.drop_index(op.f("ix_rafting_instructors_created_at"), table_name="rafting_instructors")
    op.drop_table("rafting_instructors")
    op.drop_index(op.f("ix_rafting_routes_created_at"), table_name="rafting_routes")
    op.drop_table("rafting_routes")
