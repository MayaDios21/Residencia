from decimal import Decimal

from rest_framework import status
from rest_framework.test import APITestCase

from ..models import SystemSettings
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
