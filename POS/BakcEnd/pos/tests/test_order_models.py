"""
Pruebas de los modelos de comandas: la base de datos impide dos comandas
abiertas en la misma mesa, pero la mesa se puede volver a abrir después de
cobrar o cancelar.
"""

from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from ..models import CashSession, Order
from .helpers import create_cashier, create_waiter


class OrderModelTests(TestCase):
    def setUp(self):
        """Crea una jornada de caja abierta y un mesero."""
        self.cashier = create_cashier()
        self.waiter = create_waiter()
        self.session = CashSession.objects.create(
            business_date=timezone.localdate(),
            opening_amount='500.00',
            opened_by=self.cashier,
        )

    def open_order(self, table_number=3):
        """Crea directamente una comanda abierta en la mesa indicada."""
        return Order.objects.create(
            table_number=table_number,
            opened_by=self.waiter,
            cash_session=self.session,
        )

    def test_two_open_orders_on_same_table_are_rejected(self):
        """La restricción única impide dos comandas abiertas en una misma mesa."""
        self.open_order(3)

        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                self.open_order(3)

    def test_table_can_reopen_after_charged_or_cancelled(self):
        """Cobrada o cancelada, la comanda ya no ocupa la mesa."""
        first = self.open_order(3)
        first.status = Order.Status.CHARGED
        first.save()
        second = self.open_order(3)
        second.status = Order.Status.CANCELLED
        second.save()

        third = self.open_order(3)

        self.assertEqual(third.status, Order.Status.OPEN)
        self.assertEqual(Order.objects.filter(table_number=3).count(), 3)
