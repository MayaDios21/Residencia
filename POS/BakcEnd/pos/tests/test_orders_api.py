"""
Pruebas de la API de comandas (/api/comandas/): códigos de respuesta, permisos
por rol, forma de las respuestas y el cobro que devuelve la venta.
"""

from decimal import Decimal

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from ..models import CashSession, Order, Product, Sale
from .helpers import create_admin, create_cashier, create_waiter

ORDERS_URL = '/api/comandas/'
TABLES_URL = '/api/comandas/mesas/'


class OrderApiTests(APITestCase):
    def setUp(self):
        """Caja de hoy abierta, usuarios de cada rol y dos productos."""
        self.admin = create_admin()
        self.cashier = create_cashier()
        self.waiter = create_waiter()
        CashSession.objects.create(
            business_date=timezone.localdate(),
            opening_amount='500.00',
            opened_by=self.cashier,
        )
        self.taco = Product.objects.create(name='Taco de Birria', price='25.00')
        self.coke = Product.objects.create(
            name='Coca Cola', price='20.00', stock=3, track_inventory=True,
        )

    def as_user(self, user):
        """Hace las siguientes peticiones como el usuario indicado."""
        self.client.force_authenticate(user)

    def open(self, table=3, items=None):
        """Abre una comanda por la API con 2 tacos si no se indican productos."""
        items = items if items is not None else [{'product_id': self.taco.id, 'quantity': 2}]
        return self.client.post(ORDERS_URL, {'mesa': table, 'items': items}, format='json')

    def test_waiter_opens_adds_and_removes(self):
        """El mesero abre, agrega y quita; la respuesta trae la comanda actualizada."""
        self.as_user(self.waiter)

        opened = self.open()
        order_id = opened.data['id']
        added = self.client.post(f'{ORDERS_URL}{order_id}/agregar/', {
            'items': [{'product_id': self.coke.id, 'quantity': 1}],
        }, format='json')
        removed = self.client.post(f'{ORDERS_URL}{order_id}/quitar/', {
            'product_id': self.taco.id, 'quantity': 1,
        }, format='json')

        self.assertEqual(opened.status_code, status.HTTP_201_CREATED)
        self.assertEqual(opened.data['mesa'], 3)
        self.assertEqual(added.status_code, status.HTTP_200_OK)
        self.assertEqual(removed.status_code, status.HTTP_200_OK)
        quantities = {item['product_name']: item['quantity'] for item in removed.data['items']}
        self.assertEqual(quantities, {'Taco de Birria': 1, 'Coca Cola': 1})

    def test_second_open_on_same_table_conflicts(self):
        """Dos meseros abriendo la misma mesa: el segundo recibe 409 con el motivo."""
        self.as_user(self.waiter)
        self.open()

        response = self.open()

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn('mesa 3', response.data['detail'])

    def test_open_without_cash_session_conflicts(self):
        """Sin caja abierta no se toman comandas."""
        CashSession.objects.all().delete()
        self.as_user(self.waiter)

        self.assertEqual(self.open().status_code, status.HTTP_409_CONFLICT)

    def test_open_table_out_of_range_is_400(self):
        """Una mesa que no existe es un dato inválido."""
        self.as_user(self.waiter)

        self.assertEqual(self.open(table=11).status_code, status.HTTP_400_BAD_REQUEST)

    def test_open_with_empty_items_is_400(self):
        """Abrir una mesa sin productos no tiene sentido."""
        self.as_user(self.waiter)

        self.assertEqual(self.open(items=[]).status_code, status.HTTP_400_BAD_REQUEST)

    def test_quantity_below_one_is_400(self):
        """Las cantidades empiezan en 1."""
        self.as_user(self.waiter)

        response = self.open(items=[{'product_id': self.taco.id, 'quantity': 0}])

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_waiter_cannot_charge(self):
        """Cobrar es de caja: el mesero recibe 403 y la comanda sigue abierta."""
        self.as_user(self.waiter)
        order_id = self.open().data['id']

        response = self.client.post(f'{ORDERS_URL}{order_id}/cobrar/')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(Order.objects.get(pk=order_id).status, Order.Status.OPEN)

    def test_cashier_charges_and_gets_sale(self):
        """El cobro responde como POST /ventas/ y libera la mesa en la cuadrícula."""
        self.as_user(self.waiter)
        order_id = self.open().data['id']
        self.as_user(self.cashier)

        response = self.client.post(f'{ORDERS_URL}{order_id}/cobrar/')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Decimal(response.data['total']), Decimal('54.00'))
        self.assertEqual(response.data['cashier'], 'cashier')
        self.assertEqual(Sale.objects.count(), 1)
        tables = self.client.get(TABLES_URL).data['mesas']
        self.assertIsNone(tables[2]['comanda'])

    def test_charge_without_stock_is_409_with_product(self):
        """Sin existencias al cobrar: 409 con el producto y lo disponible, como en ventas."""
        self.as_user(self.waiter)
        order_id = self.open(items=[{'product_id': self.coke.id, 'quantity': 3}]).data['id']
        Product.objects.filter(pk=self.coke.pk).update(stock=1)
        self.as_user(self.cashier)

        response = self.client.post(f'{ORDERS_URL}{order_id}/cobrar/')

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['product_id'], self.coke.id)
        self.assertEqual(response.data['available'], 1)

    def test_waiter_cancel_with_items_is_403(self):
        """El mesero no cancela una comanda con productos."""
        self.as_user(self.waiter)
        order_id = self.open().data['id']

        response = self.client.post(f'{ORDERS_URL}{order_id}/cancelar/', {'motivo': 'x'})

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_waiter_cancel_empty_is_200(self):
        """Si la vació, el mesero libera la mesa."""
        self.as_user(self.waiter)
        order_id = self.open().data['id']
        self.client.post(f'{ORDERS_URL}{order_id}/quitar/', {
            'product_id': self.taco.id, 'quantity': 2,
        }, format='json')

        response = self.client.post(f'{ORDERS_URL}{order_id}/cancelar/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'cancelada')

    def test_cashier_cancel_without_reason_is_400(self):
        """Caja cancela con motivo; sin motivo es un dato faltante."""
        self.as_user(self.waiter)
        order_id = self.open().data['id']
        self.as_user(self.cashier)

        missing = self.client.post(f'{ORDERS_URL}{order_id}/cancelar/', {'motivo': ''})
        given = self.client.post(f'{ORDERS_URL}{order_id}/cancelar/', {'motivo': 'Se fueron'})

        self.assertEqual(missing.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(given.status_code, status.HTTP_200_OK)
        self.assertEqual(given.data['cancel_reason'], 'Se fueron')
        self.assertEqual(given.data['cancelled_by'], 'cashier')

    def test_detail_includes_totals_and_events(self):
        """El detalle trae los totales del servidor y la bitácora con quién hizo cada cambio."""
        self.as_user(self.waiter)
        order_id = self.open().data['id']
        self.as_user(self.cashier)

        response = self.client.get(f'{ORDERS_URL}{order_id}/')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(response.data['subtotal']), Decimal('50.00'))
        self.assertEqual(Decimal(response.data['tax']), Decimal('4.00'))
        self.assertEqual(Decimal(response.data['total']), Decimal('54.00'))
        self.assertEqual(response.data['opened_by'], 'waiter')
        self.assertEqual(response.data['business_date'], str(timezone.localdate()))
        item = response.data['items'][0]
        self.assertEqual(item['product_id'], self.taco.id)
        self.assertEqual(Decimal(item['unit_price']), Decimal('25.00'))
        self.assertEqual(Decimal(item['line_total']), Decimal('50.00'))
        event = response.data['events'][0]
        self.assertEqual(
            (event['action'], event['product_name'], event['quantity'], event['user']),
            ('agregar', 'Taco de Birria', 2, 'waiter'),
        )

    def test_tables_overview_shape(self):
        """La cuadrícula trae numero_mesas y una entrada por mesa, con montos como texto."""
        self.as_user(self.waiter)
        self.open(table=2)

        response = self.client.get(TABLES_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['numero_mesas'], 10)
        self.assertEqual(len(response.data['mesas']), 10)
        occupied = response.data['mesas'][1]
        self.assertEqual(occupied['mesa'], 2)
        self.assertEqual(occupied['comanda']['items_count'], 2)
        self.assertEqual(occupied['comanda']['subtotal'], '50.00')
        self.assertEqual(occupied['comanda']['opened_by'], 'waiter')

    def test_filter_by_estado(self):
        """?estado=abierta deja fuera las cobradas."""
        self.as_user(self.waiter)
        charged_id = self.open(table=1).data['id']
        open_id = self.open(table=2).data['id']
        self.as_user(self.cashier)
        self.client.post(f'{ORDERS_URL}{charged_id}/cobrar/')

        response = self.client.get(ORDERS_URL, {'estado': 'abierta'})

        self.assertEqual([order['id'] for order in response.data], [open_id])

    def test_requires_authentication(self):
        """Sin sesión no se ven las mesas."""
        self.assertEqual(self.client.get(TABLES_URL).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_unknown_order_is_404(self):
        """Una comanda que no existe responde 404."""
        self.as_user(self.waiter)

        response = self.client.post(f'{ORDERS_URL}9999/agregar/', {
            'items': [{'product_id': self.taco.id, 'quantity': 1}],
        }, format='json')

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_close_cash_with_open_order_is_409(self):
        """El cierre de caja avisa qué mesa falta por cobrar."""
        self.as_user(self.waiter)
        self.open(table=4)
        self.as_user(self.cashier)

        response = self.client.post('/api/caja/cerrar/', {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn('4', response.data['detail'])
