"""
Pruebas del rol mesero: solo puede leer el menú y usar comandas; caja, ventas,
inventario, reportes, usuarios y configuración le quedan prohibidos.
"""

from django.core.cache import cache
from rest_framework import status
from rest_framework.test import APITestCase

from ..models import UserProfile
from .helpers import create_admin, create_cashier, create_waiter

STRONG_PASSWORD = 'Birria-Compita-2026'

# Pantallas que no son del mesero: deben responder 403 aunque haya iniciado sesión.
FORBIDDEN = [
    ('get', '/api/caja/actual/'),
    ('post', '/api/caja/abrir/'),
    ('get', '/api/ventas/'),
    ('post', '/api/ventas/'),
    ('get', '/api/configuracion/'),
    ('patch', '/api/configuracion/'),
    ('get', '/api/inventario/movimientos/'),
    ('get', '/api/inventario/alertas/'),
    ('get', '/api/reportes/resumen/'),
    ('get', '/api/usuarios/'),
    ('post', '/api/productos/'),
]


class WaiterPermissionTests(APITestCase):
    def setUp(self):
        """Crea un mesero, un cajero y un administrador."""
        self.waiter = create_waiter()
        self.cashier = create_cashier()
        self.admin = create_admin()

    def test_waiter_is_forbidden_outside_orders(self):
        """El mesero recibe 403 en todo lo que no son comandas ni el menú."""
        self.client.force_authenticate(self.waiter)
        for method, url in FORBIDDEN:
            response = getattr(self.client, method)(url, {}, format='json')
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN, f'{method} {url}')

    def test_waiter_can_read_menu(self):
        """El mesero necesita ver productos y categorías para tomar pedidos."""
        self.client.force_authenticate(self.waiter)
        self.assertEqual(self.client.get('/api/productos/').status_code, status.HTTP_200_OK)
        self.assertEqual(self.client.get('/api/categorias/').status_code, status.HTTP_200_OK)

    def test_cashier_keeps_cash_access(self):
        """Cerrar el paso al mesero no le quita la caja al cajero."""
        self.client.force_authenticate(self.cashier)
        self.assertEqual(self.client.get('/api/caja/actual/').status_code, status.HTTP_200_OK)

    def test_waiter_login_returns_role(self):
        """El mesero entra solo con usuario y contraseña y el servidor devuelve su rol."""
        cache.clear()
        self.waiter.set_password(STRONG_PASSWORD)
        self.waiter.save()

        response = self.client.post('/api/auth/login/', {
            'username': 'waiter',
            'password': STRONG_PASSWORD,
        })

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['user']['role'], UserProfile.Role.WAITER)

    def test_admin_can_create_waiter(self):
        """El administrador da de alta meseros desde Usuarios."""
        self.client.force_authenticate(self.admin)

        response = self.client.post('/api/usuarios/', {
            'username': 'mesero1',
            'password': STRONG_PASSWORD,
            'role': 'waiter',
        })

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['role'], 'waiter')
