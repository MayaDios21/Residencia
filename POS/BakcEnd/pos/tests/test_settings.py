"""Pruebas de la configuración del sistema (IVA, tipo de cambio y número de mesas)."""

from decimal import Decimal

from django.utils import timezone

from rest_framework import status
from rest_framework.test import APITestCase

from ..models import CashSession, Order, SystemSettings
from .helpers import create_admin, create_cashier

SETTINGS_URL = '/api/configuracion/'


class SystemSettingsApiTests(APITestCase):
    def setUp(self):
        self.admin = create_admin()
        self.cashier = create_cashier()

    def test_defaults_are_created_on_first_read(self):
        self.client.force_authenticate(self.cashier)

        response = self.client.get(SETTINGS_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(Decimal(response.data['tax_rate']), Decimal('0.08'))
        self.assertEqual(Decimal(response.data['exchange_rate']), Decimal('19.50'))
        self.assertEqual(SystemSettings.objects.count(), 1)

    def test_admin_can_update_settings(self):
        self.client.force_authenticate(self.admin)

        response = self.client.patch(SETTINGS_URL, {'tax_rate': '0.16', 'exchange_rate': '18.75'})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        settings = SystemSettings.load()
        self.assertEqual(settings.tax_rate, Decimal('0.16'))
        self.assertEqual(settings.exchange_rate, Decimal('18.75'))
        self.assertEqual(settings.updated_by, self.admin)
        self.assertEqual(response.data['updated_by'], 'admin')

    def test_partial_update_keeps_other_value(self):
        self.client.force_authenticate(self.admin)

        self.client.patch(SETTINGS_URL, {'exchange_rate': '20.00'})

        self.assertEqual(SystemSettings.load().tax_rate, Decimal('0.08'))

    def test_settings_reject_out_of_range_values(self):
        self.client.force_authenticate(self.admin)

        for payload in ({'tax_rate': '1.5'}, {'tax_rate': '-0.01'}, {'exchange_rate': '0'}):
            response = self.client.patch(SETTINGS_URL, payload)
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, payload)

    def test_cashier_cannot_update_settings(self):
        self.client.force_authenticate(self.cashier)

        response = self.client.patch(SETTINGS_URL, {'tax_rate': '0.10'})

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_settings_require_authentication(self):
        self.assertEqual(self.client.get(SETTINGS_URL).status_code, status.HTTP_401_UNAUTHORIZED)

    def test_only_one_settings_row_exists(self):
        SystemSettings.load()
        SystemSettings(tax_rate=Decimal('0.10')).save()

        self.assertEqual(SystemSettings.objects.count(), 1)
        self.assertEqual(SystemSettings.load().tax_rate, Decimal('0.10'))

    def test_table_count_defaults_to_ten(self):
        """Sin configurar, el restaurante tiene 10 mesas."""
        self.client.force_authenticate(self.cashier)

        response = self.client.get(SETTINGS_URL)

        self.assertEqual(response.data['numero_mesas'], 10)

    def test_admin_can_change_table_count(self):
        """El administrador fija cuántas mesas muestra la cuadrícula."""
        self.client.force_authenticate(self.admin)

        response = self.client.patch(SETTINGS_URL, {'numero_mesas': 8})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(SystemSettings.load().table_count, 8)

    def test_table_count_limits(self):
        """El número de mesas va de 1 a 100."""
        self.client.force_authenticate(self.admin)

        for value in (0, 101):
            response = self.client.patch(SETTINGS_URL, {'numero_mesas': value})
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, value)
        self.assertEqual(SystemSettings.load().table_count, 10)

    def test_table_count_cannot_drop_below_open_table(self):
        """No se puede quitar una mesa que tiene una comanda abierta."""
        session = CashSession.objects.create(
            business_date=timezone.localdate(),
            opening_amount='500.00',
            opened_by=self.cashier,
        )
        Order.objects.create(table_number=8, opened_by=self.cashier, cash_session=session)
        self.client.force_authenticate(self.admin)

        rejected = self.client.patch(SETTINGS_URL, {'numero_mesas': 5})
        accepted = self.client.patch(SETTINGS_URL, {'numero_mesas': 8})

        self.assertEqual(rejected.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('8', str(rejected.data['numero_mesas']))
        self.assertEqual(accepted.status_code, status.HTTP_200_OK)
