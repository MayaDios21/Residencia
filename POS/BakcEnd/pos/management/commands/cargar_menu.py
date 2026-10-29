"""
Comando ``python manage.py cargar_menu``: crea el menú inicial del restaurante
(categorías y productos) en la base de datos.

Los datos son los mismos que trae el frontend en ``FronEnd/js/state.js``
(``defaultCategories`` y ``defaultProducts``), con las mismas rutas de imagen.
Se puede correr las veces que sea: solo crea lo que falta y no modifica lo que
ya existe, para no pisar precios o colores que el administrador haya cambiado.
"""

from decimal import Decimal

from django.core.management.base import BaseCommand
from django.db import transaction

from ...models import Category, Product

IMAGES = '../Public/assets/imagenes/'

CATEGORIES = [
    {'name': 'Tacos', 'color': '#d35400'},
    {'name': 'Quesadillas', 'color': '#8e44ad'},
    {'name': 'Bebidas', 'color': '#3498db'},
    {'name': 'Extras', 'color': '#27ae60'},
]

PRODUCTS = [
    {'name': 'Taco de Birria', 'price': '30.00', 'category': 'Tacos', 'image': 'Taco Birria.jpg'},
    {'name': 'Taco de Birria Harina', 'price': '35.00', 'category': 'Tacos', 'image': 'Taco Birria Harina.jpg'},
    {'name': 'Quesabirria', 'price': '55.00', 'category': 'Quesadillas', 'image': 'Quesabirria.jpg'},
    {'name': 'Quesabirria Harina', 'price': '60.00', 'category': 'Quesadillas', 'image': 'Quesabirria Harina.jpg'},
    {'name': 'Consomé', 'price': '25.00', 'category': 'Extras', 'image': 'Consome.jpg'},
    {'name': 'Consomé con Carne', 'price': '35.00', 'category': 'Extras', 'image': 'Consome Con Carne.jpg'},
    {'name': 'Agua Grande', 'price': '20.00', 'category': 'Bebidas', 'image': 'Agua Grande.jpg', 'track_inventory': True},
    {'name': 'Coca Cola 600ml', 'price': '25.00', 'category': 'Bebidas', 'image': 'Cocacola-lata.png', 'track_inventory': True},
]


class Command(BaseCommand):
    help = 'Crea las categorías y productos del menú inicial (no duplica ni modifica los existentes).'

    @transaction.atomic
    def handle(self, *args, **options):
        categories = {}
        created_categories = 0
        for data in CATEGORIES:
            category, created = Category.objects.get_or_create(
                name=data['name'],
                defaults={'color': data['color']},
            )
            categories[category.name] = category
            created_categories += created

        created_products = 0
        for data in PRODUCTS:
            _, created = Product.objects.get_or_create(
                name=data['name'],
                category=categories[data['category']],
                defaults={
                    'price': Decimal(data['price']),
                    'image': IMAGES + data['image'],
                    'track_inventory': data.get('track_inventory', False),
                },
            )
            created_products += created

        self.stdout.write(self.style.SUCCESS(
            f'Menú cargado: {created_categories} categorías y {created_products} productos nuevos '
            f'(ya existían {len(CATEGORIES) - created_categories} y {len(PRODUCTS) - created_products}).'
        ))
