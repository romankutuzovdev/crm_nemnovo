from enum import StrEnum


class UserRole(StrEnum):
    ADMIN = "admin"
    DIRECTOR = "director"
    MANAGER = "manager"


class LeadStatus(StrEnum):
    NEW = "new"
    IN_PROGRESS = "in_progress"
    CONVERTED = "converted"
    REJECTED = "rejected"


class LeadSource(StrEnum):
    SITE_FORM = "site_form"
    TELEPHONY = "telephony"
    MANUAL = "manual"
    REFERRAL = "referral"


class ServiceType(StrEnum):
    RAFTING = "rafting"
    HOSTEL = "hostel"
    RENT = "rent"
    COMBINED = "combined"


class CompanySegment(StrEnum):
    """B2B — юрлицо / ИП; B2C — частное лицо как контрагент (редко)."""

    B2B = "b2b"
    B2C = "b2c"


class DealStatus(StrEnum):
    NEW = "new"
    CONFIRMED = "confirmed"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class PaymentStatus(StrEnum):
    UNPAID = "unpaid"
    PARTIAL = "partial"
    PAID = "paid"
    OVERPAID = "overpaid"


class PaymentMethod(StrEnum):
    CASH = "cash"
    CARD = "card"
    ONLINE = "online"
    TRANSFER = "transfer"


class PaymentTxStatus(StrEnum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    FAILED = "failed"
    REFUNDED = "refunded"


class BookingStatus(StrEnum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"


class AssetStatus(StrEnum):
    ACTIVE = "active"
    MAINTENANCE = "maintenance"
    RETIRED = "retired"


class AssetCategory(StrEnum):
    KAYAK = "kayak"
    HOSTEL_ROOM = "hostel_room"
    TRANSPORT = "transport"
    EQUIPMENT = "equipment"


class NotificationChannel(StrEnum):
    SMS = "sms"
    EMAIL = "email"
    PUSH = "push"


class NotificationStatus(StrEnum):
    QUEUED = "queued"
    SENT = "sent"
    FAILED = "failed"


class InvoiceStatus(StrEnum):
    DRAFT = "draft"
    SENT = "sent"
    PAID = "paid"
    OVERDUE = "overdue"


class AuditAction(StrEnum):
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    DELETE = "DELETE"
