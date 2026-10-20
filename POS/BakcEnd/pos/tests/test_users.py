from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.test import APITestCase

from ..models import UserProfile
from ..services import UserManagementError, update_user
from .helpers import create_admin, create_cashier

USERS_URL = '/api/usuarios/'
STRONG_PASSWORD = 'Birria-Compita-2026'


class UserManagementTests(APITestCase):
    def setUp(self):
        self.admin = create_admin()
        self.cashier = create_cashier()
        self.client.force_authenticate(self.admin)

    def create_payload(self, **overrides):
        payload = {
            'username': 'nuevo',
            'first_name': 'Juan',
            'last_name': 'Pérez',
            'role': 'cashier',
            'password': STRONG_PASSWORD,
        }
        payload.update(overrides)
        return payload

    def test_admin_lists_users_with_roles(self):
        response = self.client.get(USERS_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        roles = {user['username']: user['role'] for user in response.data}
        self.assertEqual(roles, {'admin': 'admin', 'cashier': 'cashier'})
        self.assertNotIn('password', response.data[0])

    def test_users_without_profile_are_not_listed(self):
        User.objects.create_user(username='sin-perfil', password='x')

        usernames = [user['username'] for user in self.client.get(USERS_URL).data]

        self.assertNotIn('sin-perfil', usernames)

    def test_filters_by_role_and_active(self):
        self.cashier.is_active = False
        self.cashier.save()

        cashiers = self.client.get(USERS_URL, {'rol': 'cashier'}).data
        active = self.client.get(USERS_URL, {'activo': 'true'}).data

        self.assertEqual([user['username'] for user in cashiers], ['cashier'])
        self.assertEqual([user['username'] for user in active], ['admin'])

    def test_admin_creates_user_that_can_login(self):
        response = self.client.post(USERS_URL, self.create_payload())

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['role'], 'cashier')
        self.assertEqual(response.data['first_name'], 'Juan')
        self.client.force_authenticate(None)
        login = self.client.post('/api/auth/login/', {
            'username': 'nuevo',
            'password': STRONG_PASSWORD,
            'role': 'cashier',
        })
        self.assertEqual(login.status_code, status.HTTP_200_OK)

    def test_create_rejects_weak_password(self):
        for password in ('1234', 'password', '12345678'):
            response = self.client.post(USERS_URL, self.create_payload(password=password))
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, password)
            self.assertIn('password', response.data)
        self.assertFalse(User.objects.filter(username='nuevo').exists())

    def test_create_rejects_duplicate_username_ignoring_case(self):
        response = self.client.post(USERS_URL, self.create_payload(username='CASHIER'))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('username', response.data)

    def test_create_rejects_invalid_role(self):
        response = self.client.post(USERS_URL, self.create_payload(role='gerente'))

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_admin_changes_role_and_revokes_session(self):
        Token.objects.create(user=self.cashier)

        response = self.client.patch(f'{USERS_URL}{self.cashier.id}/', {'role': 'admin'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['role'], 'admin')
        self.assertFalse(Token.objects.filter(user=self.cashier).exists())

    def test_admin_updates_names(self):
        response = self.client.patch(f'{USERS_URL}{self.cashier.id}/', {'first_name': 'Ana'})

        self.assertEqual(response.data['first_name'], 'Ana')
        self.assertEqual(response.data['role'], 'cashier')

    def test_deactivated_user_cannot_login_and_loses_session(self):
        self.cashier.set_password(STRONG_PASSWORD)
        self.cashier.save()
        Token.objects.create(user=self.cashier)

        response = self.client.patch(f'{USERS_URL}{self.cashier.id}/', {'is_active': False})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(Token.objects.filter(user=self.cashier).exists())
        self.client.force_authenticate(None)
        login = self.client.post('/api/auth/login/', {
            'username': 'cashier',
            'password': STRONG_PASSWORD,
            'role': 'cashier',
        })
        self.assertEqual(login.status_code, status.HTTP_400_BAD_REQUEST)

    def test_user_can_be_reactivated(self):
        self.client.patch(f'{USERS_URL}{self.cashier.id}/', {'is_active': False})

        response = self.client.patch(f'{USERS_URL}{self.cashier.id}/', {'is_active': True})

        self.assertTrue(response.data['is_active'])

    def test_admin_cannot_deactivate_or_demote_self(self):
        create_admin('admin2')

        for payload in ({'is_active': False}, {'role': 'cashier'}):
            response = self.client.patch(f'{USERS_URL}{self.admin.id}/', payload)
            self.assertEqual(response.status_code, status.HTTP_409_CONFLICT, payload)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.is_active)
        self.assertEqual(self.admin.profile.role, UserProfile.Role.ADMIN)

    def test_last_active_admin_cannot_be_removed(self):
        # Por la API siempre hay otro admin activo (quien hace el cambio), así que
        # esta regla de respaldo se prueba directo en el servicio.
        inactive_admin = create_admin('admin2')
        inactive_admin.is_active = False
        inactive_admin.save()

        for changes in ({'is_active': False}, {'role': UserProfile.Role.CASHIER}):
            with self.assertRaises(UserManagementError):
                update_user(self.admin, self.cashier, **changes)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.is_active)

    def test_another_admin_can_be_demoted_if_one_remains(self):
        other_admin = create_admin('admin2')

        response = self.client.patch(f'{USERS_URL}{other_admin.id}/', {'role': 'cashier'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_reset_password(self):
        Token.objects.create(user=self.cashier)
        url = f'{USERS_URL}{self.cashier.id}/restablecer-contrasena/'

        weak = self.client.post(url, {'password': '1234'})
        response = self.client.post(url, {'password': STRONG_PASSWORD})

        self.assertEqual(weak.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.cashier.refresh_from_db()
        self.assertTrue(self.cashier.check_password(STRONG_PASSWORD))
        self.assertFalse(Token.objects.filter(user=self.cashier).exists())

    def test_users_cannot_be_deleted(self):
        response = self.client.delete(f'{USERS_URL}{self.cashier.id}/')

        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)
        self.assertTrue(User.objects.filter(pk=self.cashier.pk).exists())

    def test_username_cannot_be_changed(self):
        self.client.patch(f'{USERS_URL}{self.cashier.id}/', {'username': 'otro'})

        self.cashier.refresh_from_db()
        self.assertEqual(self.cashier.username, 'cashier')

    def test_cashier_cannot_manage_users(self):
        self.client.force_authenticate(self.cashier)

        self.assertEqual(self.client.get(USERS_URL).status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            self.client.post(USERS_URL, self.create_payload()).status_code,
            status.HTTP_403_FORBIDDEN,
        )
