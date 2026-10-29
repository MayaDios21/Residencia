"""Pruebas del comando ``cargar_menu`` (menú inicial del restaurante)."""

from decimal import Decimal
from io import StringIO

from django.core.management import call_command
from django.test import TestCase

from ..management.commands.cargar_menu import CATEGORIES, PRODUCTS
from ..models import Category, Product


def run_command():
    output = StringIO()
    call_command('cargar_menu', stdout=output)
    return output.getvalue()


class CargarMenuTests(TestCase):
    def test_creates_categories_and_products(self):
        output = run_command()

        self.assertEqual(Category.objects.count(), len(CATEGORIES))
        self.assertEqual(Product.objects.count(), len(PRODUCTS))
        self.assertIn('4 categorías y 8 productos nuevos', output)

        taco = Product.objects.get(name='Taco de Birria')
        self.assertEqual(taco.category.name, 'Tacos')
        self.assertEqual(taco.price, Decimal('30.00'))
        self.assertEqual(taco.image, '../Public/assets/imagenes/Taco Birria.jpg')
        self.assertFalse(taco.track_inventory)
        self.assertIsNone(taco.stock)

    def test_only_drinks_are_tracked_in_inventory(self):
        run_command()

        tracked = set(Product.objects.filter(track_inventory=True).values_list('name', flat=True))
        self.assertEqual(tracked, {'Agua Grande', 'Coca Cola 600ml'})

    def test_running_twice_does_not_duplicate(self):
        run_command()
        output = run_command()

        self.assertEqual(Category.objects.count(), len(CATEGORIES))
        self.assertEqual(Product.objects.count(), len(PRODUCTS))
        self.assertIn('0 categorías y 0 productos nuevos', output)

    def test_does_not_overwrite_admin_changes(self):
        """Si el admin ya cambió un precio o un color, volver a correrlo no lo pisa."""
        run_command()
        Product.objects.filter(name='Quesabirria').update(price=Decimal('65.00'))
        Category.objects.filter(name='Bebidas').update(color='#000000')

        run_command()

        self.assertEqual(Product.objects.get(name='Quesabirria').price, Decimal('65.00'))
        self.assertEqual(Category.objects.get(name='Bebidas').color, '#000000')

    def test_creates_only_missing_items(self):
        Category.objects.create(name='Tacos', color='#111111')

        output = run_command()

        self.assertIn('3 categorías y 8 productos nuevos', output)
        self.assertEqual(Category.objects.get(name='Tacos').color, '#111111')
