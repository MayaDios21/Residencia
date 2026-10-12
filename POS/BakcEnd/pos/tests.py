from django.contrib.auth.models import User
from rest_framework.test import APITestCase

from .models import UserProfile


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
