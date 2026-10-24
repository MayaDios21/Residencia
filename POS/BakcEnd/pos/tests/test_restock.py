"""
Pruebas del algoritmo de reabastecimiento y de las alertas de stock: fórmulas,
niveles, consumo por ventas y salidas, ventana de días y permisos.
"""

from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from ..models import InventoryMovement, Product, Supply
from ..services import apply_stock_movement, evaluate_restock
from .helpers import create_admin, create_cashier

ALERTS_URL = '/api/inventario/alertas/'


class RestockFormulaTests(APITestCase):
    """Fórmulas de evaluate_restock con 14 días de historial y 2 de reposición."""

    def evaluate(self, stock, minimum, consumed):
        return evaluate_restock(stock, minimum, consumed, window_days=14, lead_days=2)

    def test_runs_out_before_restock_arrives_is_critical(self):
        # 28 piezas en 14 días = 2 por día; 3 en stock alcanzan 1.5 días (< 2).
        result = self.evaluate(stock=3, minimum=5, consumed=28)

        self.assertEqual(result['daily_average'], 2.0)
        self.assertEqual(result['coverage_days'], 1.5)
        self.assertEqual(result['level'], 'critico')
        # 2 × 2 + 5 − 3 = 6 piezas.
        self.assertEqual(result['suggested_quantity'], 6)

    def test_no_stock_is_critical(self):
        self.assertEqual(self.evaluate(stock=0, minimum=5, consumed=0)['level'], 'critico')

    def test_at_minimum_without_consumption_is_low(self):
        result = self.evaluate(stock=4, minimum=5, consumed=0)

        self.assertEqual(result['level'], 'bajo')
        self.assertIsNone(result['coverage_days'])
        self.assertEqual(result['suggested_quantity'], 1)

    def test_enough_stock_is_ok(self):
        result = self.evaluate(stock=40, minimum=5, consumed=14)

        self.assertEqual(result['level'], 'ok')
        self.assertEqual(result['coverage_days'], 40.0)
        self.assertEqual(result['suggested_quantity'], 0)

    def test_never_counted_suggests_reaching_minimum(self):
        result = self.evaluate(stock=None, minimum=5, consumed=0)

        self.assertEqual(result['level'], 'sin_registrar')
        self.assertEqual(result['suggested_quantity'], 5)

    def test_suggestion_rounds_up_to_whole_pieces(self):
        # 3 piezas en 14 días ≈ 0.21 por día → 0.43 + 5 − 5 = 0.43 → 1 pieza.
        self.assertEqual(self.evaluate(stock=5, minimum=5, consumed=3)['suggested_quantity'], 1)


class RestockAlertsApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin()
        self.cashier = create_cashier()
        self.client.force_authenticate(self.admin)
        self.coca = Product.objects.create(name='Coca Cola 600ml', price='25.00', track_inventory=True)
        self.agua = Product.objects.create(name='Agua Grande', price='20.00', track_inventory=True)
        self.taco = Product.objects.create(name='Taco de Birria', price='25.00')  # no se controla
        self.vasos = Supply.objects.create(name='Vasos', minimum_stock=50)
        apply_stock_movement(self.coca.id, 'entrada', 10, self.admin)
        apply_stock_movement(self.agua.id, 'entrada', 100, self.admin)
        apply_stock_movement(None, 'entrada', 60, self.admin, supply_id=self.vasos.id)

    def items_by_name(self, response):
        return {row['name']: row for row in response.data['items']}

    def test_lists_only_items_that_need_attention(self):
        # Coca: quedan 2 piezas (10 − 8) y el consumo de la ventana se fija en 28,
        # o sea 2 por día: alcanza 1 día y el pedido tarda 2 → crítico.
        apply_stock_movement(self.coca.id, 'salida', 8, self.admin)
        InventoryMovement.objects.filter(product=self.coca, type='salida').update(quantity=28)
        # Vasos: 60 en stock con mínimo 50 y sin consumo → ok (no aparece).

        response = self.client.get(ALERTS_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['window_days'], 14)
        self.assertEqual(response.data['lead_days'], 2)
        items = self.items_by_name(response)
        self.assertEqual(set(items), {'Coca Cola 600ml'})
        self.assertEqual(items['Coca Cola 600ml']['level'], 'critico')
        self.assertEqual(items['Coca Cola 600ml']['kind'], 'producto')
        self.assertEqual(items['Coca Cola 600ml']['consumed'], 28)

    def test_todos_includes_ok_items_but_never_untracked_products(self):
        response = self.client.get(ALERTS_URL, {'todos': 'true'})

        names = set(self.items_by_name(response))
        self.assertEqual(names, {'Coca Cola 600ml', 'Agua Grande', 'Vasos'})
        self.assertEqual(self.items_by_name(response)['Vasos']['kind'], 'insumo')

    def test_supply_consumption_comes_from_exits(self):
        apply_stock_movement(None, 'salida', 28, self.admin, supply_id=self.vasos.id)

        row = self.items_by_name(self.client.get(ALERTS_URL, {'todos': 'true'}))['Vasos']

        self.assertEqual(row['consumed'], 28)
        self.assertEqual(row['daily_average'], 2.0)
        self.assertEqual(row['stock'], 32)
        self.assertEqual(row['level'], 'bajo')

    def test_cancellations_reduce_consumption(self):
        apply_stock_movement(self.agua.id, 'venta', 10, self.admin)
        apply_stock_movement(self.agua.id, 'cancelacion', 4, self.admin)

        row = self.items_by_name(self.client.get(ALERTS_URL, {'todos': 'true'}))['Agua Grande']

        self.assertEqual(row['consumed'], 6)

    def test_old_movements_fall_outside_the_window(self):
        movement = apply_stock_movement(self.agua.id, 'salida', 50, self.admin)
        InventoryMovement.objects.filter(pk=movement.pk).update(
            created_at=timezone.now() - timedelta(days=30),
        )

        row = self.items_by_name(self.client.get(ALERTS_URL, {'todos': 'true'}))['Agua Grande']
        wide = self.items_by_name(self.client.get(ALERTS_URL, {'todos': 'true', 'dias': 60}))

        self.assertEqual(row['consumed'], 0)
        self.assertEqual(wide['Agua Grande']['consumed'], 50)

    def test_inactive_items_are_left_out(self):
        self.coca.is_active = False
        self.coca.save()
        self.vasos.is_active = False
        self.vasos.save()

        names = set(self.items_by_name(self.client.get(ALERTS_URL, {'todos': 'true'})))

        self.assertEqual(names, {'Agua Grande'})

    def test_most_urgent_items_come_first(self):
        Supply.objects.create(name='Platos', minimum_stock=10)  # sin registrar
        apply_stock_movement(self.coca.id, 'salida', 10, self.admin)  # stock 0 → crítico
        apply_stock_movement(self.agua.id, 'salida', 97, self.admin)  # quedan 3: menos de 1 día → crítico

        levels = [row['level'] for row in self.client.get(ALERTS_URL).data['items']]

        self.assertEqual(levels, ['critico', 'critico', 'sin_registrar'])

    def test_custom_lead_days(self):
        response = self.client.get(ALERTS_URL, {'reposicion': 5, 'todos': 'true'})

        self.assertEqual(response.data['lead_days'], 5)

    def test_invalid_parameters_are_rejected(self):
        for params in ({'dias': 0}, {'dias': 'mucho'}, {'reposicion': -1}):
            response = self.client.get(ALERTS_URL, params)
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, params)

    def test_alerts_are_admin_only(self):
        self.client.force_authenticate(self.cashier)

        self.assertEqual(self.client.get(ALERTS_URL).status_code, status.HTTP_403_FORBIDDEN)
