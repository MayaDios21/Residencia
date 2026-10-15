from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.test import APITestCase

from ..models import InventoryMovement, Product, UserProfile
from ..services import InsufficientStockError, apply_stock_movement

MOVEMENTS_URL = '/api/inventario/movimientos/'


class InventoryMovementApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(username='admin', password='x')
        UserProfile.objects.create(user=self.admin, role=UserProfile.Role.ADMIN)
        self.cashier = User.objects.create_user(username='cashier', password='x')
        UserProfile.objects.create(user=self.cashier, role=UserProfile.Role.CASHIER)
        self.product = Product.objects.create(name='Quesabirria', price='45.00')
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
        self.assertEqual(response.data[0]['product_name'], 'Quesabirria')

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
