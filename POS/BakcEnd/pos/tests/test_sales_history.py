from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from ..models import CashSession, InventoryMovement, Product, Sale, SaleItem
from ..services import create_sale
from .helpers import create_admin, create_cashier

SALES_URL = '/api/ventas/'


class SalesHistoryTestCase(APITestCase):
    def setUp(self):
        self.admin = create_admin()
        self.cashier = create_cashier()
        self.taco = Product.objects.create(name='Taco de Birria', price='25.00', stock=20)
        self.consome = Product.objects.create(name='Consomé', price='30.00')
        today = timezone.localdate()
        self.yesterday_session = CashSession.objects.create(
            business_date=today - timedelta(days=1),
            opening_amount='500.00',
            opened_by=self.cashier,
            status=CashSession.Status.CLOSED,
        )
        self.today_session = CashSession.objects.create(
            business_date=today,
            opening_amount='500.00',
            opened_by=self.cashier,
        )
        self.old_sale = self.make_sale(self.yesterday_session, self.consome, 2, Sale.Status.CLOSED)
        self.sale = create_sale([{'product_id': self.taco.id, 'quantity': 3}], self.cashier)
        self.client.force_authenticate(self.admin)

    def make_sale(self, session, product, quantity, sale_status):
        """Venta de otro día creada directamente (create_sale solo usa la caja de hoy)."""
        subtotal = Decimal(product.price) * quantity
        tax = (subtotal * Decimal('0.08')).quantize(Decimal('0.01'))
        sale = Sale.objects.create(
            cash_session=session,
            cashier=self.cashier,
            status=sale_status,
            tax_rate=Decimal('0.08'),
            exchange_rate=Decimal('19.50'),
            subtotal=subtotal,
            tax=tax,
            total=subtotal + tax,
        )
        SaleItem.objects.create(
            sale=sale,
            product=product,
            product_name=product.name,
            unit_price=product.price,
            quantity=quantity,
            line_total=subtotal,
        )
        return sale


class SalesListTests(SalesHistoryTestCase):
    def test_admin_lists_all_sales_newest_first(self):
        response = self.client.get(SALES_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([sale['id'] for sale in response.data], [self.sale.id, self.old_sale.id])
        self.assertEqual(response.data[0]['items_count'], 3)
        self.assertEqual(response.data[0]['items'][0]['product_name'], 'Taco de Birria')

    def test_cashier_only_sees_today(self):
        self.client.force_authenticate(self.cashier)

        response = self.client.get(SALES_URL)

        self.assertEqual([sale['id'] for sale in response.data], [self.sale.id])
        detail = self.client.get(f'{SALES_URL}{self.old_sale.id}/')
        self.assertEqual(detail.status_code, status.HTTP_404_NOT_FOUND)

    def test_filter_by_date_range(self):
        yesterday = (timezone.localdate() - timedelta(days=1)).isoformat()

        response = self.client.get(SALES_URL, {'desde': yesterday, 'hasta': yesterday})

        self.assertEqual([sale['id'] for sale in response.data], [self.old_sale.id])

    def test_invalid_date_is_rejected(self):
        response = self.client.get(SALES_URL, {'desde': '20-10-2026'})

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_search_by_product_name_and_id(self):
        by_name = self.client.get(SALES_URL, {'q': 'consom'})
        by_id = self.client.get(SALES_URL, {'q': f'#{self.sale.id}'})

        self.assertEqual([sale['id'] for sale in by_name.data], [self.old_sale.id])
        self.assertIn(self.sale.id, [sale['id'] for sale in by_id.data])

    def test_filter_by_status(self):
        response = self.client.get(SALES_URL, {'estado': 'cerrada'})
        invalid = self.client.get(SALES_URL, {'estado': 'borrada'})

        self.assertEqual([sale['id'] for sale in response.data], [self.old_sale.id])
        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)

    def test_detail_returns_items(self):
        response = self.client.get(f'{SALES_URL}{self.sale.id}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(response.data['total']), Decimal('81.00'))
        self.assertEqual(response.data['items'][0]['quantity'], 3)

    def test_history_requires_authentication(self):
        self.client.force_authenticate(None)

        self.assertEqual(self.client.get(SALES_URL).status_code, status.HTTP_401_UNAUTHORIZED)


class SalesSummaryAndExportTests(SalesHistoryTestCase):
    def test_summary_matches_history_cards(self):
        response = self.client.get(f'{SALES_URL}resumen/')

        # 81.00 (3 tacos) + 64.80 (2 consomés)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(response.data['total_sales']), Decimal('145.80'))
        self.assertEqual(response.data['transactions'], 2)
        self.assertEqual(response.data['items'], 5)
        self.assertEqual(Decimal(response.data['average_sale']), Decimal('72.90'))

    def test_summary_excludes_cancelled_sales(self):
        self.client.post(f'{SALES_URL}{self.sale.id}/cancelar/')

        response = self.client.get(f'{SALES_URL}resumen/')

        self.assertEqual(response.data['transactions'], 1)
        self.assertEqual(Decimal(response.data['total_sales']), Decimal('64.80'))

    def test_summary_without_sales(self):
        response = self.client.get(f'{SALES_URL}resumen/', {'desde': '2000-01-01', 'hasta': '2000-01-01'})

        self.assertEqual(response.data['transactions'], 0)
        self.assertEqual(Decimal(response.data['average_sale']), Decimal('0.00'))

    def test_export_csv_uses_filters(self):
        response = self.client.get(f'{SALES_URL}exportar/', {'q': 'taco'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['Content-Type'], 'text/csv; charset=utf-8')
        lines = response.content.decode('utf-8-sig').strip().splitlines()
        self.assertEqual(len(lines), 2)
        self.assertIn('Productos', lines[0])
        self.assertIn('3x Taco de Birria', lines[1])

    def test_cashier_can_export_only_today(self):
        self.client.force_authenticate(self.cashier)

        response = self.client.get(f'{SALES_URL}exportar/')

        lines = response.content.decode('utf-8-sig').strip().splitlines()
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(lines), 2)


class SalesVerificationTests(SalesHistoryTestCase):
    def test_consistent_sales_pass(self):
        response = self.client.get(f'{SALES_URL}verificar/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['checked'], 2)
        self.assertEqual(response.data['with_errors'], 0)

    def test_detects_tampered_totals(self):
        Sale.objects.filter(pk=self.sale.pk).update(total=Decimal('1.00'))

        response = self.client.get(f'{SALES_URL}verificar/')

        self.assertEqual(response.data['with_errors'], 1)
        self.assertEqual(response.data['errors'][0]['sale_id'], self.sale.id)

    def test_detects_open_sale_in_closed_session(self):
        Sale.objects.filter(pk=self.old_sale.pk).update(status=Sale.Status.OPEN)

        response = self.client.get(f'{SALES_URL}verificar/')

        self.assertEqual(response.data['errors'][0]['sale_id'], self.old_sale.id)

    def test_verification_is_admin_only(self):
        self.client.force_authenticate(self.cashier)

        response = self.client.get(f'{SALES_URL}verificar/')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


class SaleCancellationTests(SalesHistoryTestCase):
    def test_cancel_restores_stock_and_records_who(self):
        response = self.client.post(f'{SALES_URL}{self.sale.id}/cancelar/', {'reason': 'Error de captura'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'cancelada')
        self.assertEqual(response.data['cancelled_by'], 'admin')
        self.assertEqual(response.data['cancel_reason'], 'Error de captura')
        self.taco.refresh_from_db()
        self.assertEqual(self.taco.stock, 20)
        movement = InventoryMovement.objects.get(type=InventoryMovement.Type.CANCELLATION)
        self.assertEqual((movement.stock_before, movement.stock_after), (17, 20))
        self.assertEqual(movement.sale_id, self.sale.id)

    def test_cancel_does_not_touch_products_without_stock(self):
        sale = create_sale([{'product_id': self.consome.id, 'quantity': 1}], self.cashier)

        self.client.post(f'{SALES_URL}{sale.id}/cancelar/')

        self.consome.refresh_from_db()
        self.assertIsNone(self.consome.stock)

    def test_cannot_cancel_twice(self):
        self.client.post(f'{SALES_URL}{self.sale.id}/cancelar/')

        response = self.client.post(f'{SALES_URL}{self.sale.id}/cancelar/')

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.taco.refresh_from_db()
        self.assertEqual(self.taco.stock, 20)

    def test_cannot_cancel_sale_from_closed_session(self):
        response = self.client.post(f'{SALES_URL}{self.old_sale.id}/cancelar/')

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.old_sale.refresh_from_db()
        self.assertEqual(self.old_sale.status, Sale.Status.CLOSED)

    def test_cashier_cannot_cancel(self):
        self.client.force_authenticate(self.cashier)

        response = self.client.post(f'{SALES_URL}{self.sale.id}/cancelar/')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_cancelled_sale_is_left_out_of_cash_closing(self):
        self.client.post(f'{SALES_URL}{self.sale.id}/cancelar/')

        response = self.client.post('/api/caja/cerrar/')

        # Al cerrar se toma la jornada abierta más antigua: hoy.
        self.assertEqual(response.data['sales_count'], 0)
        self.assertEqual(Decimal(response.data['expected_cash']), Decimal('500.00'))
        self.sale.refresh_from_db()
        self.assertEqual(self.sale.status, Sale.Status.CANCELLED)

    def test_sales_cannot_be_deleted_or_edited(self):
        self.assertEqual(
            self.client.delete(f'{SALES_URL}{self.sale.id}/').status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )
        self.assertEqual(
            self.client.patch(f'{SALES_URL}{self.sale.id}/', {'total': '1.00'}).status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )
