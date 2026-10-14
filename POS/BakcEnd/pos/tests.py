from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory
from rest_framework.test import APITestCase

from .models import Category, Product, UserProfile
from .permissions import IsAdminRole, IsCashierRole


class AuthenticationTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='cashier',
            password='correct-password',
        )
        UserProfile.objects.create(
            user=self.user,
            role=UserProfile.Role.CASHIER,
        )

    def test_cashier_can_login_with_matching_role(self):
        response = self.client.post('/api/auth/login/', {
            'username': 'cashier',
            'password': 'correct-password',
            'role': UserProfile.Role.CASHIER,
        })

        self.assertEqual(response.status_code, 200)
        self.assertIn('token', response.data)
        self.assertEqual(response.data['user']['role'], UserProfile.Role.CASHIER)

    def test_login_rejects_wrong_role(self):
        response = self.client.post('/api/auth/login/', {
            'username': 'cashier',
            'password': 'correct-password',
            'role': UserProfile.Role.ADMIN,
        })

        self.assertEqual(response.status_code, 403)

    def test_login_rejects_invalid_password(self):
        response = self.client.post('/api/auth/login/', {
            'username': 'cashier',
            'password': 'wrong-password',
            'role': UserProfile.Role.CASHIER,
        })

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertNotIn('token', response.data)

    def test_login_rejects_user_without_profile(self):
        User.objects.create_user(
            username='without-profile',
            password='correct-password',
        )

        response = self.client.post('/api/auth/login/', {
            'username': 'without-profile',
            'password': 'correct-password',
            'role': UserProfile.Role.CASHIER,
        })

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_authenticated_user_can_read_me(self):
        token = self.client.post('/api/auth/login/', {
            'username': 'cashier',
            'password': 'correct-password',
            'role': UserProfile.Role.CASHIER,
        }).data['token']
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')

        response = self.client.get('/api/auth/me/')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['username'], 'cashier')
        self.assertEqual(response.data['role'], UserProfile.Role.CASHIER)

    def test_me_requires_authentication(self):
        response = self.client.get('/api/auth/me/')

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_revokes_token(self):
        token = self.client.post('/api/auth/login/', {
            'username': 'cashier',
            'password': 'correct-password',
            'role': UserProfile.Role.CASHIER,
        }).data['token']
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token}')

        logout_response = self.client.post('/api/auth/logout/')
        self.assertEqual(logout_response.status_code, status.HTTP_204_NO_CONTENT)

        me_response = self.client.get('/api/auth/me/')
        self.assertEqual(me_response.status_code, status.HTTP_401_UNAUTHORIZED)


class RolePermissionTests(APITestCase):
    def setUp(self):
        self.factory = APIRequestFactory()
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

    def test_admin_permission_rejects_cashier(self):
        request = Request(self.factory.get('/api/test/'))
        request.user = self.cashier

        self.assertFalse(IsAdminRole().has_permission(request, None))

    def test_admin_permission_accepts_admin(self):
        request = Request(self.factory.get('/api/test/'))
        request.user = self.admin

        self.assertTrue(IsAdminRole().has_permission(request, None))

    def test_cashier_permission_accepts_cashier_only(self):
        request = Request(self.factory.get('/api/test/'))
        request.user = self.cashier

        self.assertTrue(IsCashierRole().has_permission(request, None))


class CatalogApiTests(APITestCase):
    def setUp(self):
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
