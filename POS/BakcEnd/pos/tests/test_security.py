"""
Pruebas de la revisión de seguridad: caducidad del token, límite de intentos en
el login de /admin/, validación de imágenes de producto y CSV sin fórmulas.
"""

from datetime import timedelta

from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from ..exports import csv_safe, safe_row
from ..models import Category, UserProfile
from .helpers import create_admin

PRODUCTS_URL = '/api/productos/'


class TokenExpirationTests(APITestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(username='cashier', password='correct-password')
        UserProfile.objects.create(user=self.user, role=UserProfile.Role.CASHIER)

    def age_token(self, token, hours):
        """Hace que el token parezca creado hace cierto número de horas."""
        Token.objects.filter(pk=token.pk).update(created=timezone.now() - timedelta(hours=hours))

    @override_settings(TOKEN_TTL_HOURS=16)
    def test_recent_token_is_accepted(self):
        token = Token.objects.create(user=self.user)
        self.age_token(token, 15)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

        self.assertEqual(self.client.get('/api/auth/me/').status_code, 200)

    @override_settings(TOKEN_TTL_HOURS=16)
    def test_expired_token_is_rejected_and_deleted(self):
        """Pasado el plazo, la API responde 401 y el token se borra."""
        token = Token.objects.create(user=self.user)
        self.age_token(token, 17)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')

        response = self.client.get('/api/auth/me/')

        self.assertEqual(response.status_code, 401)
        self.assertFalse(Token.objects.filter(pk=token.pk).exists())

    @override_settings(TOKEN_TTL_HOURS=16)
    def test_login_replaces_expired_token(self):
        """Si quedó un token caducado, el login entrega uno nuevo que sí funciona."""
        old = Token.objects.create(user=self.user)
        self.age_token(old, 17)

        response = self.client.post('/api/auth/login/', {
            'username': 'cashier',
            'password': 'correct-password',
        })

        self.assertEqual(response.status_code, 200)
        self.assertNotEqual(response.data['token'], old.key)
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {response.data['token']}")
        self.assertEqual(self.client.get('/api/auth/me/').status_code, 200)


class AdminLoginRateLimitTests(TestCase):
    def setUp(self):
        cache.clear()
        User.objects.create_superuser(username='root', password='correct-password')

    def post_login(self, password):
        return self.client.post('/admin/login/', {
            'username': 'root',
            'password': password,
            'next': '/admin/',
        })

    @override_settings(LOGIN_MAX_FAILED_ATTEMPTS=3)
    def test_admin_login_is_blocked_after_too_many_failures(self):
        for _ in range(3):
            self.assertEqual(self.post_login('wrong').status_code, 200)

        # Bloqueado incluso con la contraseña correcta, igual que la API.
        self.assertEqual(self.post_login('correct-password').status_code, 429)

    def test_admin_login_still_works(self):
        response = self.post_login('correct-password')

        self.assertEqual(response.status_code, 302)
        self.assertEqual(response['Location'], '/admin/')


class ProductImageValidationTests(APITestCase):
    def setUp(self):
        cache.clear()
        admin = create_admin()
        token = Token.objects.create(user=admin)
        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        self.category = Category.objects.create(name='Tacos', color='#d35400')

    def create_product(self, image):
        return self.client.post(PRODUCTS_URL, {
            'name': 'Taco',
            'category': self.category.pk,
            'price': '30.00',
            'image': image,
        }, format='json')

    def test_accepts_menu_paths_photos_and_https(self):
        for index, image in enumerate((
            '',
            '../Public/assets/imagenes/Taco Birria.jpg',
            'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ==',
            'https://ejemplo.com/taco.png',
        )):
            response = self.client.post(PRODUCTS_URL, {
                'name': f'Taco {index}',
                'category': self.category.pk,
                'price': '30.00',
                'image': image,
            }, format='json')
            self.assertEqual(response.status_code, 201, (image, response.data))

    def test_rejects_scripts_svg_and_html(self):
        for image in (
            'javascript:alert(1)',
            'data:image/svg+xml;base64,PHN2Zz4=',
            'data:text/html;base64,PHNjcmlwdD4=',
            'x.jpg" onerror="alert(1)',
            'http://ejemplo.com/taco.png',
        ):
            response = self.create_product(image)
            self.assertEqual(response.status_code, 400, image)
            self.assertIn('image', response.data)

    def test_rejects_huge_images(self):
        response = self.create_product('data:image/jpeg;base64,' + 'A' * 600_000)

        self.assertEqual(response.status_code, 400)


class CsvSafeTests(TestCase):
    def test_formula_like_text_is_neutralized(self):
        for value in ('=HYPERLINK("http://x")', '+1', '-2+3', '@SUM(A1)'):
            self.assertEqual(csv_safe(value), f"'{value}")

    def test_normal_values_are_unchanged(self):
        self.assertEqual(safe_row(['Taco', 30, None, '']), ['Taco', 30, None, ''])
