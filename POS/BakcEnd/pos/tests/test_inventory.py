"""
Pruebas de inventario: entradas, salidas y ajustes, stock que no puede quedar
negativo, insumos, la opción "Controlar en almacén" y permisos.
"""

import importlib

from django.apps import apps as django_apps
from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.test import APITestCase

from ..models import InventoryMovement, Product, Supply, UserProfile
from ..services import InsufficientStockError, apply_stock_movement

MOVEMENTS_URL = '/api/inventario/movimientos/'
SUPPLIES_URL = '/api/inventario/insumos/'


class InventoryMovementApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username='admin', password='x')
        UserProfile.objects.create(user=self.admin, role=UserProfile.Role.ADMIN)
        self.cashier = User.objects.create_user(username='cashier', password='x')
        UserProfile.objects.create(user=self.cashier, role=UserProfile.Role.CASHIER)
        self.product = Product.objects.create(
            name='Coca Cola 600ml', price='25.00', track_inventory=True,
        )
        self.client.force_authenticate(self.admin)

    def post_movement(self, type, quantity, reason=''):
        return self.client.post(MOVEMENTS_URL, {
            'product_id': self.product.id,
            'type': type,
            'quantity': quantity,
            'reason': reason,
        })

    def test_entry_on_unregistered_stock_starts_from_zero(self):
        response = self.post_movement('entrada', 10, 'Compra inicial')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['stock_before'], 0)
        self.assertEqual(response.data['stock_remaining'], 10)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 10)

    def test_exit_subtracts_stock(self):
        self.post_movement('entrada', 10)

        response = self.post_movement('salida', 3, 'Merma')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['stock_remaining'], 7)

    def test_adjustment_sets_exact_stock(self):
        self.post_movement('entrada', 10)

        response = self.post_movement('ajuste', 4, 'Conteo físico')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['stock_before'], 10)
        self.assertEqual(response.data['stock_remaining'], 4)

    def test_adjustment_to_zero_is_allowed(self):
        self.post_movement('entrada', 5)

        response = self.post_movement('ajuste', 0)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['stock_remaining'], 0)

    def test_entry_and_exit_require_positive_quantity(self):
        for movement_type in ('entrada', 'salida'):
            response = self.post_movement(movement_type, 0)
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_exit_cannot_leave_negative_stock(self):
        self.post_movement('entrada', 2)

        response = self.post_movement('salida', 5)

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 2)
        self.assertEqual(InventoryMovement.objects.count(), 1)

    def test_sale_type_cannot_be_registered_manually(self):
        response = self.post_movement('venta', 1)

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_movement_records_user(self):
        self.post_movement('entrada', 1)

        movement = InventoryMovement.objects.get()
        self.assertEqual(movement.user, self.admin)

    def test_admin_can_list_and_filter_movements(self):
        other = Product.objects.create(name='Consomé', price='30.00')
        self.post_movement('entrada', 3)
        apply_stock_movement(other.id, 'entrada', 1, self.admin)

        response = self.client.get(MOVEMENTS_URL, {'producto': self.product.id})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['item_name'], 'Coca Cola 600ml')
        self.assertEqual(response.data[0]['kind'], 'producto')

    def test_cashier_cannot_use_inventory_endpoints(self):
        self.client.force_authenticate(self.cashier)

        self.assertEqual(self.client.get(MOVEMENTS_URL).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(self.post_movement('entrada', 1).status_code, status.HTTP_403_FORBIDDEN)

    def test_movements_cannot_be_edited_or_deleted(self):
        movement_id = self.post_movement('entrada', 1).data['id']

        self.assertEqual(
            self.client.patch(f'{MOVEMENTS_URL}{movement_id}/', {'quantity': 9}).status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )
        self.assertEqual(
            self.client.delete(f'{MOVEMENTS_URL}{movement_id}/').status_code,
            status.HTTP_405_METHOD_NOT_ALLOWED,
        )


class ProductStockFieldTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username='admin', password='x')
        UserProfile.objects.create(user=self.admin, role=UserProfile.Role.ADMIN)
        self.client.force_authenticate(self.admin)

    def test_product_stock_is_read_only_through_catalog(self):
        response = self.client.post('/api/productos/', {
            'name': 'Agua Grande',
            'price': '25.00',
            'stock': 100,
            'minimum_stock': 8,
        })

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(response.data['stock'])
        self.assertEqual(response.data['minimum_stock'], 8)

    def test_service_raises_on_insufficient_stock(self):
        product = Product.objects.create(name='Coca Cola 600ml', price='25.00', stock=1)

        with self.assertRaises(InsufficientStockError):
            apply_stock_movement(product.id, 'salida', 2, self.admin)


class SupplyAndTrackingTests(APITestCase):
    """Insumos del almacén y la opción "Controlar en almacén" de los productos."""

    def setUp(self):
        self.admin = User.objects.create_user(username='admin', password='x')
        UserProfile.objects.create(user=self.admin, role=UserProfile.Role.ADMIN)
        self.cashier = User.objects.create_user(username='cashier', password='x')
        UserProfile.objects.create(user=self.cashier, role=UserProfile.Role.CASHIER)
        self.client.force_authenticate(self.admin)
        self.taco = Product.objects.create(name='Taco de Birria', price='25.00')
        self.vasos = Supply.objects.create(name='Vasos desechables', minimum_stock=50)

    def move_supply(self, type, quantity):
        return self.client.post(MOVEMENTS_URL, {
            'supply_id': self.vasos.id, 'type': type, 'quantity': quantity,
        })

    def test_untracked_product_rejects_movements(self):
        response = self.client.post(MOVEMENTS_URL, {
            'product_id': self.taco.id, 'type': 'entrada', 'quantity': 5,
        })

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('product_id', response.data)

    def test_movement_needs_exactly_one_item(self):
        tracked = Product.objects.create(name='Agua', price='20.00', track_inventory=True)

        neither = self.client.post(MOVEMENTS_URL, {'type': 'entrada', 'quantity': 1})
        both = self.client.post(MOVEMENTS_URL, {
            'product_id': tracked.id, 'supply_id': self.vasos.id, 'type': 'entrada', 'quantity': 1,
        })

        self.assertEqual(neither.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(both.status_code, status.HTTP_400_BAD_REQUEST)

    def test_supply_movements_update_its_stock(self):
        self.move_supply('entrada', 100)
        response = self.move_supply('salida', 30)

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['kind'], 'insumo')
        self.assertEqual(response.data['item_name'], 'Vasos desechables')
        self.assertIsNone(response.data['product_id'])
        self.assertEqual(response.data['stock_remaining'], 70)
        self.vasos.refresh_from_db()
        self.assertEqual(self.vasos.stock, 70)

    def test_supply_cannot_go_negative(self):
        self.move_supply('entrada', 5)

        response = self.move_supply('salida', 6)

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    def test_filter_movements_by_supply(self):
        self.move_supply('entrada', 10)
        tracked = Product.objects.create(name='Agua', price='20.00', track_inventory=True)
        apply_stock_movement(tracked.id, 'entrada', 3, self.admin)

        response = self.client.get(MOVEMENTS_URL, {'insumo': self.vasos.id})

        self.assertEqual([row['item_name'] for row in response.data], ['Vasos desechables'])

    def test_admin_manages_supplies(self):
        created = self.client.post(SUPPLIES_URL, {'name': 'Platos', 'minimum_stock': 20, 'stock': 999})
        duplicate = self.client.post(SUPPLIES_URL, {'name': 'vasos DESECHABLES'})
        updated = self.client.patch(f"{SUPPLIES_URL}{created.data['id']}/", {'minimum_stock': 30})

        self.assertEqual(created.status_code, status.HTTP_201_CREATED)
        self.assertIsNone(created.data['stock'])  # el stock solo cambia con movimientos
        self.assertEqual(duplicate.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(updated.data['minimum_stock'], 30)

    def test_supply_with_history_cannot_be_deleted(self):
        unused = Supply.objects.create(name='Servilletas')
        self.move_supply('entrada', 1)

        self.assertEqual(
            self.client.delete(f'{SUPPLIES_URL}{self.vasos.id}/').status_code,
            status.HTTP_409_CONFLICT,
        )
        self.assertEqual(
            self.client.delete(f'{SUPPLIES_URL}{unused.id}/').status_code,
            status.HTTP_204_NO_CONTENT,
        )

    def test_cashier_cannot_manage_supplies(self):
        self.client.force_authenticate(self.cashier)

        self.assertEqual(self.client.get(SUPPLIES_URL).status_code, status.HTTP_403_FORBIDDEN)

    def test_track_inventory_is_editable_in_catalog(self):
        response = self.client.patch(f'/api/productos/{self.taco.id}/', {'track_inventory': True})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['track_inventory'])

    def test_migration_marks_products_with_stock_as_tracked(self):
        migration = importlib.import_module('pos.migrations.0006_supplies_and_tracking')
        counted = Product.objects.create(name='Refresco', price='20.00', stock=4)

        migration.mark_products_with_stock_as_tracked(django_apps, None)

        counted.refresh_from_db()
        self.taco.refresh_from_db()
        self.assertTrue(counted.track_inventory)
        self.assertFalse(self.taco.track_inventory)
