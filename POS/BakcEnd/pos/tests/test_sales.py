from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from ..models import CashSession, InventoryMovement, Product, Sale, SaleItem, SystemSettings
from .helpers import create_admin, create_cashier

SALES_URL = '/api/ventas/'


class SaleApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin()
        self.cashier = create_cashier()
        self.client.force_authenticate(self.cashier)
        self.taco = Product.objects.create(name='Taco de Birria', price='25.00', stock=10)
        self.consome = Product.objects.create(name='Consomé', price='30.00')  # sin stock registrado
        CashSession.objects.create(
            business_date=timezone.localdate(),
            opening_amount='500.00',
            opened_by=self.cashier,
        )

    def sell(self, items, payment='Efectivo'):
        return self.client.post(SALES_URL, {'items': items, 'payment': payment}, format='json')

    def test_sale_totals_are_calculated_by_server(self):
        response = self.sell([
            {'product_id': self.taco.id, 'quantity': 3},
            {'product_id': self.consome.id, 'quantity': 1},
        ])

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Decimal(response.data['subtotal']), Decimal('105.00'))
        self.assertEqual(Decimal(response.data['tax']), Decimal('8.40'))
        self.assertEqual(Decimal(response.data['total']), Decimal('113.40'))
        self.assertEqual(response.data['cashier'], 'cashier')
        self.assertEqual(response.data['status'], 'abierta')

    def test_client_prices_and_totals_are_ignored(self):
        response = self.client.post(SALES_URL, {
            'items': [{'product_id': self.taco.id, 'quantity': 1, 'price': '0.01'}],
            'total': '0.01',
        }, format='json')

        self.assertEqual(Decimal(response.data['total']), Decimal('27.00'))

    def test_sale_discounts_stock_and_reports_remaining(self):
        response = self.sell([
            {'product_id': self.taco.id, 'quantity': 4},
            {'product_id': self.consome.id, 'quantity': 2},
        ])

        items = {item['product_id']: item for item in response.data['items']}
        self.assertEqual(items[self.taco.id]['stock_remaining'], 6)
        self.assertIsNone(items[self.consome.id]['stock_remaining'])
        self.taco.refresh_from_db()
        self.consome.refresh_from_db()
        self.assertEqual(self.taco.stock, 6)
        self.assertIsNone(self.consome.stock)

    def test_sale_creates_linked_inventory_movement(self):
        response = self.sell([{'product_id': self.taco.id, 'quantity': 2}])

        movement = InventoryMovement.objects.get()
        self.assertEqual(movement.type, InventoryMovement.Type.SALE)
        self.assertEqual(movement.sale_id, response.data['id'])
        self.assertEqual((movement.stock_before, movement.stock_after), (10, 8))

    def test_insufficient_stock_rejects_whole_sale(self):
        response = self.sell([
            {'product_id': self.consome.id, 'quantity': 1},
            {'product_id': self.taco.id, 'quantity': 11},
        ])

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['product_id'], self.taco.id)
        self.assertEqual(response.data['available'], 10)
        self.assertFalse(Sale.objects.exists())
        self.assertFalse(SaleItem.objects.exists())
        self.assertFalse(InventoryMovement.objects.exists())
        self.taco.refresh_from_db()
        self.assertEqual(self.taco.stock, 10)

    def test_repeated_product_lines_are_merged(self):
        response = self.sell([
            {'product_id': self.taco.id, 'quantity': 2},
            {'product_id': self.taco.id, 'quantity': 3},
        ])

        self.assertEqual(len(response.data['items']), 1)
        self.assertEqual(response.data['items'][0]['quantity'], 5)
        self.assertEqual(response.data['items'][0]['stock_remaining'], 5)

    def test_sale_requires_open_cash(self):
        CashSession.objects.all().delete()

        response = self.sell([{'product_id': self.taco.id, 'quantity': 1}])

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn('no está abierta', response.data['detail'])

    def test_sale_rejected_after_closing(self):
        self.client.post('/api/caja/cerrar/')

        response = self.sell([{'product_id': self.taco.id, 'quantity': 1}])

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn('cerrada', response.data['detail'])

    def test_invalid_payloads_are_rejected(self):
        for items in (
            [],
            [{'product_id': self.taco.id, 'quantity': 0}],
            [{'product_id': 9999, 'quantity': 1}],
        ):
            response = self.sell(items)
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, items)
        self.assertFalse(Sale.objects.exists())

    def test_only_cash_payment_is_accepted(self):
        response = self.sell([{'product_id': self.taco.id, 'quantity': 1}], payment='Tarjeta')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Sale.objects.exists())

    def test_inactive_product_cannot_be_sold(self):
        self.taco.is_active = False
        self.taco.save()

        response = self.sell([{'product_id': self.taco.id, 'quantity': 1}])

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_sale_keeps_snapshot_of_prices_and_settings(self):
        settings = SystemSettings.load()
        settings.tax_rate = Decimal('0.16')
        settings.exchange_rate = Decimal('18.00')
        settings.save()

        response = self.sell([{'product_id': self.taco.id, 'quantity': 1}])
        self.taco.price = Decimal('99.00')
        self.taco.name = 'Taco renombrado'
        self.taco.save()

        sale = Sale.objects.get(pk=response.data['id'])
        item = sale.items.get()
        self.assertEqual(sale.tax_rate, Decimal('0.16'))
        self.assertEqual(sale.exchange_rate, Decimal('18.00'))
        self.assertEqual(sale.total, Decimal('29.00'))
        self.assertEqual(item.unit_price, Decimal('25.00'))
        self.assertEqual(item.product_name, 'Taco de Birria')

    def test_admin_can_sell_too(self):
        self.client.force_authenticate(self.admin)

        response = self.sell([{'product_id': self.consome.id, 'quantity': 1}])

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_sales_require_authentication(self):
        self.client.force_authenticate(None)

        response = self.sell([{'product_id': self.taco.id, 'quantity': 1}])

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
