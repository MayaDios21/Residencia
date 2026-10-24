# Generado por Django 5.2.18 el 2026-10-24 02:28
# Insumos del almacén (Supply), campo "Controlar en almacén" (track_inventory) en
# productos y movimientos de inventario de un producto o de un insumo.

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def mark_products_with_stock_as_tracked(apps, schema_editor):
    """Los productos que ya tenían stock registrado siguen controlándose en almacén."""
    Product = apps.get_model('pos', 'Product')
    Product.objects.filter(stock__isnull=False).update(track_inventory=True)


class Migration(migrations.Migration):

    dependencies = [
        ('pos', '0005_sale_cancellation'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='product',
            name='track_inventory',
            field=models.BooleanField(default=False, verbose_name='controlar en almacén'),
        ),
        migrations.RunPython(mark_products_with_stock_as_tracked, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='inventorymovement',
            name='product',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='inventory_movements', to='pos.product'),
        ),
        migrations.CreateModel(
            name='Supply',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=80, unique=True)),
                ('stock', models.IntegerField(blank=True, null=True)),
                ('minimum_stock', models.PositiveIntegerField(default=5)),
                ('is_active', models.BooleanField(default=True)),
            ],
            options={
                'verbose_name': 'insumo',
                'verbose_name_plural': 'insumos',
                'ordering': ('name',),
                'constraints': [models.CheckConstraint(condition=models.Q(('stock__isnull', True), ('stock__gte', 0), _connector='OR'), name='supply_stock_not_negative')],
            },
        ),
        migrations.AddField(
            model_name='inventorymovement',
            name='supply',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='inventory_movements', to='pos.supply'),
        ),
        migrations.AddConstraint(
            model_name='inventorymovement',
            constraint=models.CheckConstraint(condition=models.Q(models.Q(('product__isnull', False), ('supply__isnull', True)), models.Q(('product__isnull', True), ('supply__isnull', False)), _connector='OR'), name='movement_has_product_or_supply'),
        ),
    ]
