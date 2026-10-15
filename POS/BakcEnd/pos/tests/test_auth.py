from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory
from rest_framework.test import APITestCase

from ..models import UserProfile
from ..permissions import IsAdminRole, IsCashierRole


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
