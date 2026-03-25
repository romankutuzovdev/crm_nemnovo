"""ModelView для SQLAdmin."""
from sqladmin import ModelView

from app.modules.assets.models import Asset, AssetCategory, AssetMaintenance, Product
from app.modules.bookings.models import Booking
from app.modules.clients.models import Client, ClientNote, Company
from app.modules.deals.models import Deal, DealItem
from app.modules.leads.models import Lead
from app.modules.payments.models import Invoice, Payment
from app.modules.users.models import AuditLog, Role, User


class UserAdmin(ModelView, model=User):
    name = "Пользователь"
    name_plural = "Пользователи"
    icon = "fa-solid fa-user"
    column_list = [User.email, User.full_name, User.role, User.is_active, User.created_at]
    column_searchable_list = [User.email, User.full_name]
    column_sortable_list = [User.email, User.created_at]
    form_columns = [User.email, User.full_name, User.phone, User.role, User.is_active]


class RoleAdmin(ModelView, model=Role):
    name = "Роль"
    name_plural = "Роли"
    icon = "fa-solid fa-user-tag"
    column_list = [Role.id, Role.name, Role.created_at]


class CompanyAdmin(ModelView, model=Company):
    name = "Компания"
    name_plural = "Компании"
    icon = "fa-solid fa-building"
    column_list = [Company.name, Company.inn, Company.phone, Company.email]
    column_searchable_list = [Company.name, Company.inn]


class ClientAdmin(ModelView, model=Client):
    name = "Клиент"
    name_plural = "Клиенты"
    icon = "fa-solid fa-address-card"
    column_list = [Client.first_name, Client.last_name, Client.phone, Client.email, Client.source]
    column_searchable_list = [Client.first_name, Client.last_name, Client.phone, Client.email]
    form_columns = [
        Client.first_name, Client.last_name, Client.email, Client.phone,
        Client.company, Client.source, Client.assigned_to, Client.tags,
    ]


class ClientNoteAdmin(ModelView, model=ClientNote):
    name = "Заметка клиента"
    name_plural = "Заметки клиентов"
    column_list = [ClientNote.client_id, ClientNote.text, ClientNote.created_at]


class LeadAdmin(ModelView, model=Lead):
    name = "Заявка"
    name_plural = "Заявки"
    icon = "fa-solid fa-bullhorn"
    column_list = [Lead.id, Lead.source, Lead.status, Lead.service_type, Lead.preferred_date, Lead.created_at]
    column_sortable_list = [Lead.created_at, Lead.status]
    form_columns = [Lead.client_id, Lead.source, Lead.status, Lead.service_type, Lead.guests_count, Lead.assigned_to]


class DealAdmin(ModelView, model=Deal):
    name = "Сделка"
    name_plural = "Сделки"
    icon = "fa-solid fa-handshake"
    column_list = [
        Deal.number, Deal.client, Deal.service_type, Deal.status,
        Deal.start_date, Deal.end_date, Deal.total_amount, Deal.payment_status,
    ]
    column_searchable_list = [Deal.number]
    column_sortable_list = [Deal.created_at, Deal.start_date, Deal.total_amount]
    form_columns = [
        Deal.client, Deal.service_type, Deal.status, Deal.start_date, Deal.end_date,
        Deal.guests_count, Deal.total_amount, Deal.paid_amount, Deal.payment_status,
        Deal.assigned_to, Deal.notes,
    ]


class DealItemAdmin(ModelView, model=DealItem):
    name = "Позиция сделки"
    name_plural = "Позиции сделок"
    column_list = [DealItem.deal, DealItem.description, DealItem.quantity, DealItem.unit_price, DealItem.total_price]


class AssetCategoryAdmin(ModelView, model=AssetCategory):
    name = "Категория актива"
    name_plural = "Категории активов"
    icon = "fa-solid fa-tags"
    column_list = [AssetCategory.name, AssetCategory.description]


class AssetAdmin(ModelView, model=Asset):
    name = "Актив"
    name_plural = "Активы"
    icon = "fa-solid fa-warehouse"
    column_list = [Asset.name, Asset.code, Asset.category, Asset.capacity, Asset.status]
    column_searchable_list = [Asset.name, Asset.code]
    form_columns = [Asset.category, Asset.name, Asset.code, Asset.capacity, Asset.status, Asset.description]


class AssetMaintenanceAdmin(ModelView, model=AssetMaintenance):
    name = "Обслуживание актива"
    name_plural = "Обслуживание активов"
    column_list = [AssetMaintenance.asset, AssetMaintenance.start_date, AssetMaintenance.end_date, AssetMaintenance.reason]


class ProductAdmin(ModelView, model=Product):
    name = "Товар"
    name_plural = "Товары"
    icon = "fa-solid fa-box"
    column_list = [Product.name, Product.sku, Product.category, Product.price, Product.stock_quantity]


class BookingAdmin(ModelView, model=Booking):
    name = "Бронирование"
    name_plural = "Бронирования"
    icon = "fa-solid fa-calendar-check"
    column_list = [Booking.deal, Booking.asset, Booking.start_datetime, Booking.end_datetime, Booking.status]
    column_sortable_list = [Booking.start_datetime]
    form_columns = [Booking.deal, Booking.asset, Booking.start_datetime, Booking.end_datetime, Booking.quantity, Booking.status]


class PaymentAdmin(ModelView, model=Payment):
    name = "Платёж"
    name_plural = "Платежи"
    icon = "fa-solid fa-credit-card"
    column_list = [Payment.deal, Payment.amount, Payment.method, Payment.status, Payment.paid_at]
    form_columns = [Payment.deal, Payment.amount, Payment.method, Payment.status, Payment.paid_at, Payment.notes]


class InvoiceAdmin(ModelView, model=Invoice):
    name = "Счёт"
    name_plural = "Счета"
    column_list = [Invoice.deal_id, Invoice.amount, Invoice.due_date, Invoice.status]


class AuditLogAdmin(ModelView, model=AuditLog):
    name = "Журнал аудита"
    name_plural = "Журнал аудита"
    icon = "fa-solid fa-clipboard-list"
    column_list = [AuditLog.action, AuditLog.resource, AuditLog.resource_id, AuditLog.created_at]
    column_sortable_list = [AuditLog.created_at]
    can_create = False
    can_edit = False
    can_delete = False
