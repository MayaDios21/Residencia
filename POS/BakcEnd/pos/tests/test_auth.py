"""
Pruebas de autenticación: inicio y cierre de sesión, mensaje genérico de error,
límite de intentos fallidos y permisos por rol.
"""

from django.contrib.auth.models import User
from django.core.cache import cache
from django.test import override_settings
from rest_framework import status
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory
from rest_framework.test import APITestCase

from ..models import UserProfile
from ..permissions import IsAdminRole, IsCashierRole
from ..views import INVALID_LOGIN_MESSAGE


class AuthenticationTests(APITestCase):
    def setUp(self):
        cache.clear()  # Reinicia el contador de intentos fallidos de inicio de sesión.
        self.user = User.objects.create_user(
            username='cashier',
            password='correct-password',
        )
        UserProfile.objects.create(
            user=self.user,
            role=UserProfile.Role.CASHIER,
        )

    def test_cashier_login_returns_role_from_profile(self):
        """El cajero entra solo con usuario y contraseña; el rol sale de su perfil."""
        response = self.client.post('/api/auth/login/', {
            'username': 'cashier',
            'password': 'correct-password',
        })

        self.assertEqual(response.status_code, 200)
        self.assertIn('token', response.data)
        self.assertEqual(response.data['user']['role'], UserProfile.Role.CASHIER)

    def test_admin_login_returns_role_from_profile(self):
        """El administrador entra sin elegir rol y recibe el de administrador."""
        admin = User.objects.create_user(username='admin', password='correct-password')
        UserProfile.objects.create(user=admin, role=UserProfile.Role.ADMIN)

        response = self.client.post('/api/auth/login/', {
            'username': 'admin',
            'password': 'correct-password',
        })

        self.assertEqual(response.status_code, 200)
        self.assertIn('token', response.data)
        self.assertEqual(response.data['user']['role'], UserProfile.Role.ADMIN)

    def test_login_ignores_role_sent_by_client(self):
        """Mandar role=admin no sube los permisos de un cajero: manda el perfil."""
        response = self.client.post('/api/auth/login/', {
            'username': 'cashier',
            'password': 'correct-password',
            'role': UserProfile.Role.ADMIN,
        })

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['user']['role'], UserProfile.Role.CASHIER)

    def test_login_rejects_invalid_password(self):
        response = self.client.post('/api/auth/login/', {
            'username': 'cashier',
            'password': 'wrong-password',
        })

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], INVALID_LOGIN_MESSAGE)
        self.assertNotIn('token', response.data)

    def test_login_rejects_user_without_profile(self):
        User.objects.create_user(
            username='without-profile',
            password='correct-password',
        )

        response = self.client.post('/api/auth/login/', {
            'username': 'without-profile',
            'password': 'correct-password',
        })

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['detail'], INVALID_LOGIN_MESSAGE)

    def failed_login(self):
        return self.client.post('/api/auth/login/', {
            'username': 'cashier',
            'password': 'wrong-password',
        })

    @override_settings(LOGIN_MAX_FAILED_ATTEMPTS=3)
    def test_login_is_blocked_after_too_many_failures(self):
        for _ in range(3):
            self.assertEqual(self.failed_login().status_code, status.HTTP_400_BAD_REQUEST)

        blocked = self.failed_login()
        # Ni siquiera la contraseña correcta entra mientras dura el bloqueo.
        correct = self.client.post('/api/auth/login/', {
            'username': 'cashier',
            'password': 'correct-password',
        })

        self.assertEqual(blocked.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual(correct.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    @override_settings(LOGIN_MAX_FAILED_ATTEMPTS=3)
    def test_successful_logins_do_not_count_as_failures(self):
        for _ in range(5):
            response = self.client.post('/api/auth/login/', {
                'username': 'cashier',
                'password': 'correct-password',
            })
            self.assertEqual(response.status_code, status.HTTP_200_OK)

    @override_settings(LOGIN_MAX_FAILED_ATTEMPTS=3)
    def test_block_expires_after_window(self):
        for _ in range(3):
            self.failed_login()
        cache.clear()  # Equivale a que pase la ventana de un minuto.

        self.assertEqual(self.failed_login().status_code, status.HTTP_400_BAD_REQUEST)

    def test_authenticated_user_can_read_me(self):
        token = self.client.post('/api/auth/login/', {
            'username': 'cashier',
            'password': 'correct-password',
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
