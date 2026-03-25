import pytest
from decimal import Decimal

from app.modules.deals.models import Deal
from app.shared.enums import PaymentStatus


def test_recalculate_payment_status_unpaid():
    deal = Deal.__new__(Deal)
    deal.total_amount = Decimal("10000")
    deal.paid_amount = Decimal("0")
    deal.recalculate_payment_status()
    assert deal.payment_status == PaymentStatus.UNPAID


def test_recalculate_payment_status_partial():
    deal = Deal.__new__(Deal)
    deal.total_amount = Decimal("10000")
    deal.paid_amount = Decimal("5000")
    deal.recalculate_payment_status()
    assert deal.payment_status == PaymentStatus.PARTIAL


def test_recalculate_payment_status_paid():
    deal = Deal.__new__(Deal)
    deal.total_amount = Decimal("10000")
    deal.paid_amount = Decimal("10000")
    deal.recalculate_payment_status()
    assert deal.payment_status == PaymentStatus.PAID


def test_recalculate_payment_status_overpaid():
    deal = Deal.__new__(Deal)
    deal.total_amount = Decimal("10000")
    deal.paid_amount = Decimal("10001")
    deal.recalculate_payment_status()
    assert deal.payment_status == PaymentStatus.OVERPAID


def test_debt_amount():
    deal = Deal.__new__(Deal)
    deal.total_amount = Decimal("10000")
    deal.paid_amount = Decimal("3000")
    assert deal.debt_amount == 7000.0
