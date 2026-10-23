"""
Pruebas de caja: apertura, cierre, cálculo del efectivo esperado y exportación
de cierres.
"""

from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from ..models import CashSession, Product, Sale
from .helpers import create_admin, create_cashier

CASHBOX_URL = '/api/caja/'


class CashBoxApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin()
        self.cashier = create_cashier()
        self.client.force_authenticate(self.cashier)
        self.product = Product.objects.create(name='Taco de Birria', price='25.00')

    def open_cash(self, amount='500.00'):
        return self.client.post(f'{CASHBOX_URL}abrir/', {'opening_amount': amount})

    def sell(self, quantity=1):
        return self.client.post('/api/ventas/', {
            'items': [{'product_id': self.product.id, 'quantity': quantity}],
            'payment': 'Efectivo',
        }, format='json')

    def test_current_without_opening(self):
        response = self.client.get(f'{CASHBOX_URL}actual/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'sin_abrir')
        self.assertIsNone(response.data['session'])

    def test_cashier_can_open_cash(self):
        response = self.open_cash()

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['status'], 'abierta')
        self.assertEqual(response.data['business_date'], timezone.localdate().isoformat())
        self.assertEqual(response.data['opened_by'], 'cashier')

    def test_opening_amount_must_be_positive(self):
        for amount in ('0', '-10'):
            self.assertEqual(self.open_cash(amount).status_code, status.HTTP_400_BAD_REQUEST)

    def test_cannot_open_twice_the_same_day(self):
        self.open_cash()

        response = self.open_cash()

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    def test_cannot_reopen_after_closing(self):
        self.open_cash()
        self.client.post(f'{CASHBOX_URL}cerrar/')

        response = self.open_cash()

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn('cerrada', response.data['detail'])

    def test_cannot_open_while_previous_day_is_open(self):
        CashSession.objects.create(
            business_date=timezone.localdate() - timedelta(days=1),
            opening_amount='300.00',
            opened_by=self.cashier,
        )

        response = self.open_cash()

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        current = self.client.get(f'{CASHBOX_URL}actual/').data
        self.assertIsNotNone(current['pending_session'])

    def test_close_without_open_cash_fails(self):
        response = self.client.post(f'{CASHBOX_URL}cerrar/')

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    def test_close_computes_expected_cash_like_the_frontend(self):
        self.open_cash('500.00')
        self.sell(2)  # 2 × 25 = 50 + 8 % = 54.00

        response = self.client.post(f'{CASHBOX_URL}cerrar/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'cerrada')
        self.assertEqual(response.data['sales_count'], 1)
        self.assertEqual(Decimal(response.data['sales_total']), Decimal('54.00'))
        self.assertEqual(Decimal(response.data['expected_cash']), Decimal('554.00'))
        self.assertEqual(Decimal(response.data['counted_cash']), Decimal('554.00'))
        self.assertEqual(Decimal(response.data['difference']), Decimal('0.00'))
        self.assertEqual(Decimal(response.data['retained_fund']), Decimal('500.00'))
        self.assertEqual(response.data['closed_by'], 'cashier')

    def test_close_with_counted_cash_and_expenses(self):
        self.open_cash('500.00')
        self.sell(2)  # 54.00
        self.sell(1)  # 27.00

        response = self.client.post(f'{CASHBOX_URL}cerrar/', {
            'counted_cash': '560.00',
            'minor_expenses': '10.00',
        })

        self.assertEqual(Decimal(response.data['sales_total']), Decimal('81.00'))
        self.assertEqual(Decimal(response.data['expected_cash']), Decimal('571.00'))
        self.assertEqual(Decimal(response.data['difference']), Decimal('-11.00'))

    def test_close_marks_day_sales_as_closed(self):
        self.open_cash()
        self.sell()
        self.sell()

        self.client.post(f'{CASHBOX_URL}cerrar/')

        self.assertFalse(Sale.objects.filter(status=Sale.Status.OPEN).exists())
        self.assertEqual(Sale.objects.filter(status=Sale.Status.CLOSED).count(), 2)

    def test_current_reports_today_sales(self):
        self.open_cash()
        self.sell(2)

        data = self.client.get(f'{CASHBOX_URL}actual/').data

        self.assertEqual(data['status'], 'abierta')
        self.assertEqual(data['sales_today']['count'], 1)
        self.assertEqual(Decimal(data['sales_today']['total']), Decimal('54.00'))

    def test_previous_day_open_session_can_be_closed(self):
        CashSession.objects.create(
            business_date=timezone.localdate() - timedelta(days=1),
            opening_amount='300.00',
            opened_by=self.cashier,
        )

        response = self.client.post(f'{CASHBOX_URL}cerrar/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.open_cash().status_code, status.HTTP_201_CREATED)

    def test_closings_list_and_export_are_admin_only(self):
        self.open_cash()
        self.client.post(f'{CASHBOX_URL}cerrar/')

        self.assertEqual(
            self.client.get(f'{CASHBOX_URL}cierres/').status_code,
            status.HTTP_403_FORBIDDEN,
        )

        self.client.force_authenticate(self.admin)
        closings = self.client.get(f'{CASHBOX_URL}cierres/')
        export = self.client.get(f'{CASHBOX_URL}cierres/exportar/')

        self.assertEqual(closings.status_code, status.HTTP_200_OK)
        self.assertEqual(len(closings.data), 1)
        self.assertEqual(export.status_code, status.HTTP_200_OK)
        self.assertEqual(export['Content-Type'], 'text/csv; charset=utf-8')
        content = export.content.decode('utf-8-sig')
        self.assertIn('Efectivo esperado', content)
        self.assertIn(timezone.localdate().isoformat(), content)

    def test_admin_can_also_operate_cash(self):
        self.client.force_authenticate(self.admin)

        self.assertEqual(self.open_cash().status_code, status.HTTP_201_CREATED)
