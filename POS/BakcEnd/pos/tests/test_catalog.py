"""
Pruebas del catálogo: lectura por ambos roles, altas y cambios solo del
administrador, validaciones y borrado de categorías y productos.
"""

from django.contrib.auth.models import User
from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APITestCase

from ..models import Category, Product, UserProfile
from ..services import apply_stock_movement


class CatalogApiTests(APITestCase):
    def setUp(self):
        cache.clear()  # Reinicia el contador de intentos fallidos de inicio de sesión.
        self.admin = User.objects.create_user(
            username='admin',
            password='correct-password',
        )
        UserProfile.objects.create(
            user=self.admin,
            role=UserProfile.Role.ADMIN,
        )
        self.cashier = User.objects.create_user(
            username='cashier',
            password='correct-password',
        )
        UserProfile.objects.create(
            user=self.cashier,
            role=UserProfile.Role.CASHIER,
        )
        self.category = Category.objects.create(
            name='Tacos',
            color='#8b2e35',
        )

    def authenticate_as(self, user, role):
        response = self.client.post('/api/auth/login/', {
            'username': user.username,
            'password': 'correct-password',
            'role': role,
        })
        self.client.credentials(
            HTTP_AUTHORIZATION=f"Token {response.data['token']}",
        )

    def test_catalog_requires_authentication(self):
        response = self.client.get('/api/categorias/')

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_cashier_can_list_categories_and_products(self):
        self.authenticate_as(self.cashier, UserProfile.Role.CASHIER)

        categories_response = self.client.get('/api/categorias/')
        products_response = self.client.get('/api/productos/')

        self.assertEqual(categories_response.status_code, status.HTTP_200_OK)
        self.assertEqual(products_response.status_code, status.HTTP_200_OK)
        self.assertEqual(categories_response.data[0]['name'], 'Tacos')

    def test_cashier_cannot_modify_catalog(self):
        self.authenticate_as(self.cashier, UserProfile.Role.CASHIER)

        response = self.client.post('/api/categorias/', {
            'name': 'Bebidas',
            'color': '#123456',
        })

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_create_category_and_product(self):
        self.authenticate_as(self.admin, UserProfile.Role.ADMIN)

        category_response = self.client.post('/api/categorias/', {
            'name': 'Bebidas',
            'color': '#123456',
        })
        product_response = self.client.post('/api/productos/', {
            'name': 'Taco especial',
            'category': self.category.id,
            'price': '85.50',
            'image': 'Taco especial.jpg',
        })

        self.assertEqual(category_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(product_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(product_response.data['category_name'], 'Tacos')
        self.assertEqual(
            str(Product.objects.get(name='Taco especial').price),
            '85.50',
        )

    def test_product_rejects_negative_price(self):
        self.authenticate_as(self.admin, UserProfile.Role.ADMIN)

        response = self.client.post('/api/productos/', {
            'name': 'Producto inválido',
            'category': self.category.id,
            'price': '-1.00',
        })

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('price', response.data)

    def test_category_name_must_be_unique(self):
        self.authenticate_as(self.admin, UserProfile.Role.ADMIN)

        response = self.client.post('/api/categorias/', {
            'name': 'Tacos',
            'color': '#123456',
        })

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('name', response.data)

    def test_admin_can_update_and_deactivate_product(self):
        product = Product.objects.create(
            name='Quesadilla',
            category=self.category,
            price='70.00',
        )
        self.authenticate_as(self.admin, UserProfile.Role.ADMIN)

        response = self.client.patch(
            f'/api/productos/{product.id}/',
            {'price': '75.00', 'is_active': False},
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        product.refresh_from_db()
        self.assertEqual(str(product.price), '75.00')
        self.assertFalse(product.is_active)

    def test_admin_can_delete_category_without_deleting_products(self):
        product = Product.objects.create(
            name='Producto sin categoría',
            category=self.category,
            price='25.00',
        )
        self.authenticate_as(self.admin, UserProfile.Role.ADMIN)

        response = self.client.delete(f'/api/categorias/{self.category.id}/')

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        product.refresh_from_db()
        self.assertIsNone(product.category)

    def test_admin_can_delete_product_without_history(self):
        product = Product.objects.create(name='Producto nuevo', price='10.00')
        self.authenticate_as(self.admin, UserProfile.Role.ADMIN)

        response = self.client.delete(f'/api/productos/{product.id}/')

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Product.objects.filter(pk=product.pk).exists())

    def test_product_with_inventory_history_cannot_be_deleted(self):
        product = Product.objects.create(name='Quesabirria', price='45.00')
        apply_stock_movement(product.id, 'entrada', 5, self.admin)
        self.authenticate_as(self.admin, UserProfile.Role.ADMIN)

        response = self.client.delete(f'/api/productos/{product.id}/')

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertIn('desactívalo', response.data['detail'])
        self.assertTrue(Product.objects.filter(pk=product.pk).exists())
