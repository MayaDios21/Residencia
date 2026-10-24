"""
Pruebas de los reportes del panel: resumen, ventas por día, productos más
vendidos y ventas por categoría, con filtros de fecha y sin ventas canceladas.
"""

from datetime import timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from ..models import CashSession, Category, Product, Sale, SaleItem
from .helpers import create_admin, create_cashier

REPORTS_URL = '/api/reportes/'


class ReportsApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin()
        self.cashier = create_cashier()
        self.client.force_authenticate(self.admin)
        tacos = Category.objects.create(name='Tacos', color='#8b2e35')
        bebidas = Category.objects.create(name='Bebidas', color='#2e6f8b')
        self.taco = Product.objects.create(name='Taco de Birria', price='25.00', category=tacos)
        self.coca = Product.objects.create(name='Coca Cola 600ml', price='25.00', category=bebidas)
        self.consome = Product.objects.create(name='Consomé', price='30.00')  # sin categoría

        self.today = timezone.localdate()
        self.yesterday = self.today - timedelta(days=1)
        yesterday_session = self.make_session(self.yesterday, CashSession.Status.CLOSED)
        today_session = self.make_session(self.today, CashSession.Status.OPEN)

        # Ayer: 4 tacos ($100) y 1 Coca ($25).
        self.make_sale(yesterday_session, [(self.taco, 4), (self.coca, 1)])
        # Hoy: 2 tacos ($50) y 1 consomé ($30); otra venta cancelada que no cuenta.
        self.make_sale(today_session, [(self.taco, 2), (self.consome, 1)])
        self.make_sale(today_session, [(self.coca, 10)], status=Sale.Status.CANCELLED)

    def make_session(self, day, session_status):
        return CashSession.objects.create(
            business_date=day,
            opening_amount='500.00',
            opened_by=self.cashier,
            status=session_status,
        )

    def make_sale(self, session, lines, status=Sale.Status.CLOSED):
        subtotal = sum(Decimal(product.price) * quantity for product, quantity in lines)
        tax = (subtotal * Decimal('0.08')).quantize(Decimal('0.01'))
        sale = Sale.objects.create(
            cash_session=session,
            cashier=self.cashier,
            status=status,
            tax_rate=Decimal('0.08'),
            exchange_rate=Decimal('19.50'),
            subtotal=subtotal,
            tax=tax,
            total=subtotal + tax,
        )
        for product, quantity in lines:
            SaleItem.objects.create(
                sale=sale,
                product=product,
                product_name=product.name,
                unit_price=product.price,
                quantity=quantity,
                line_total=Decimal(product.price) * quantity,
            )
        return sale

    def get(self, report, **params):
        return self.client.get(f'{REPORTS_URL}{report}/', params)

    def test_summary_of_all_sales(self):
        response = self.get('resumen')

        # Ayer 125 + 10 = 135.00; hoy 80 + 6.40 = 86.40.
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(response.data['total_sales']), Decimal('221.40'))
        self.assertEqual(Decimal(response.data['tax_total']), Decimal('16.40'))
        self.assertEqual(response.data['transactions'], 2)
        self.assertEqual(response.data['items'], 8)
        self.assertEqual(Decimal(response.data['average_sale']), Decimal('110.70'))

    def test_summary_filtered_by_date(self):
        response = self.get('resumen', desde=self.today.isoformat(), hasta=self.today.isoformat())

        self.assertEqual(Decimal(response.data['total_sales']), Decimal('86.40'))
        self.assertEqual(response.data['transactions'], 1)
        self.assertEqual(response.data['desde'], self.today.isoformat())

    def test_summary_without_sales_in_range(self):
        response = self.get('resumen', desde='2000-01-01', hasta='2000-01-31')

        self.assertEqual(response.data['transactions'], 0)
        self.assertEqual(Decimal(response.data['average_sale']), Decimal('0.00'))

    def test_sales_by_day_defaults_to_last_seven_days(self):
        response = self.get('ventas-por-dia')

        days = response.data['days']
        self.assertEqual(len(days), 7)
        self.assertEqual(days[-1]['date'], self.today.isoformat())
        by_date = {day['date']: day for day in days}
        self.assertEqual(Decimal(by_date[self.today.isoformat()]['total']), Decimal('86.40'))
        self.assertEqual(Decimal(by_date[self.yesterday.isoformat()]['total']), Decimal('135.00'))
        # Los días sin ventas aparecen en cero.
        self.assertEqual(days[0]['total'], '0.00')
        self.assertEqual(days[0]['transactions'], 0)

    def test_sales_by_day_rejects_invalid_ranges(self):
        too_long = self.get('ventas-por-dia', desde='2020-01-01', hasta='2026-01-01')
        backwards = self.get('ventas-por-dia', desde=self.today.isoformat(), hasta=self.yesterday.isoformat())
        bad_date = self.get('ventas-por-dia', desde='ayer')

        for response in (too_long, backwards, bad_date):
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_top_products_by_units(self):
        response = self.get('productos-top')

        self.assertEqual(
            [(row['product_name'], row['units']) for row in response.data],
            # Con las mismas piezas se desempata por total: Consomé ($30) antes que Coca ($25).
            [('Taco de Birria', 6), ('Consomé', 1), ('Coca Cola 600ml', 1)],
        )
        self.assertEqual(Decimal(response.data[0]['total']), Decimal('150.00'))

    def test_top_products_limit(self):
        response = self.get('productos-top', limite=1)
        invalid = self.get('productos-top', limite=0)

        self.assertEqual(len(response.data), 1)
        self.assertEqual(invalid.status_code, status.HTTP_400_BAD_REQUEST)

    def test_sales_by_category(self):
        response = self.get('por-categoria')

        rows = {row['category']: row for row in response.data}
        self.assertEqual(Decimal(rows['Tacos']['total']), Decimal('150.00'))
        self.assertEqual(rows['Tacos']['units'], 6)
        self.assertEqual(Decimal(rows['Bebidas']['total']), Decimal('25.00'))
        self.assertEqual(Decimal(rows['Sin categoría']['total']), Decimal('30.00'))
        # Ordenado de mayor a menor venta.
        self.assertEqual(response.data[0]['category'], 'Tacos')

    def test_deleted_product_keeps_its_sales_in_reports(self):
        self.consome.delete()

        products = [row['product_name'] for row in self.get('productos-top').data]
        categories = {row['category'] for row in self.get('por-categoria').data}

        self.assertIn('Consomé', products)
        self.assertIn('Sin categoría', categories)

    def test_reports_are_admin_only(self):
        self.client.force_authenticate(self.cashier)

        for report in ('resumen', 'ventas-por-dia', 'productos-top', 'por-categoria'):
            self.assertEqual(self.get(report).status_code, status.HTTP_403_FORBIDDEN, report)
