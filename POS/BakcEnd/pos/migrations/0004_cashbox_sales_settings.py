# Generado por Django 5.2.18 el 2026-10-19 23:31

import django.core.validators
import django.db.models.deletion
from decimal import Decimal
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pos', '0003_inventory'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='CashSession',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('business_date', models.DateField(unique=True)),
                ('status', models.CharField(choices=[('abierta', 'Abierta'), ('cerrada', 'Cerrada')], default='abierta', max_length=10)),
                ('opening_amount', models.DecimalField(decimal_places=2, max_digits=10)),
                ('opened_at', models.DateTimeField(auto_now_add=True)),
                ('sales_count', models.PositiveIntegerField(default=0)),
                ('sales_total', models.DecimalField(decimal_places=2, default=Decimal('0'), max_digits=12)),
                ('minor_expenses', models.DecimalField(decimal_places=2, default=Decimal('0'), max_digits=10)),
                ('expected_cash', models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ('counted_cash', models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ('difference', models.DecimalField(blank=True, decimal_places=2, max_digits=12, null=True)),
                ('retained_fund', models.DecimalField(blank=True, decimal_places=2, max_digits=10, null=True)),
                ('closed_at', models.DateTimeField(blank=True, null=True)),
                ('closed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='+', to=settings.AUTH_USER_MODEL)),
                ('opened_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'jornada de caja',
                'verbose_name_plural': 'jornadas de caja',
                'ordering': ('-business_date',),
            },
        ),
        migrations.CreateModel(
            name='Sale',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('status', models.CharField(choices=[('abierta', 'Abierta'), ('cerrada', 'Cerrada'), ('cancelada', 'Cancelada')], default='abierta', max_length=10)),
                ('payment_method', models.CharField(choices=[('Efectivo', 'Efectivo')], default='Efectivo', max_length=20)),
                ('tax_rate', models.DecimalField(decimal_places=4, max_digits=5)),
                ('exchange_rate', models.DecimalField(decimal_places=4, max_digits=10)),
                ('subtotal', models.DecimalField(decimal_places=2, max_digits=12)),
                ('tax', models.DecimalField(decimal_places=2, max_digits=12)),
                ('total', models.DecimalField(decimal_places=2, max_digits=12)),
                ('cash_session', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='sales', to='pos.cashsession')),
                ('cashier', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='sales', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'venta',
                'verbose_name_plural': 'ventas',
                'ordering': ('-created_at', '-id'),
            },
        ),
        migrations.AddField(
            model_name='inventorymovement',
            name='sale',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name='inventory_movements', to='pos.sale'),
        ),
        migrations.CreateModel(
            name='SaleItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('product_name', models.CharField(max_length=150)),
                ('unit_price', models.DecimalField(decimal_places=2, max_digits=10)),
                ('quantity', models.PositiveIntegerField()),
                ('line_total', models.DecimalField(decimal_places=2, max_digits=12)),
                ('product', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='sale_items', to='pos.product')),
                ('sale', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='items', to='pos.sale')),
            ],
            options={
                'verbose_name': 'partida de venta',
                'verbose_name_plural': 'partidas de venta',
                'ordering': ('id',),
            },
        ),
        migrations.CreateModel(
            name='SystemSettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('tax_rate', models.DecimalField(decimal_places=4, default=Decimal('0.08'), max_digits=5, validators=[django.core.validators.MinValueValidator(Decimal('0')), django.core.validators.MaxValueValidator(Decimal('1'))])),
                ('exchange_rate', models.DecimalField(decimal_places=4, default=Decimal('19.50'), max_digits=10, validators=[django.core.validators.MinValueValidator(Decimal('0.0001'))])),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'configuración',
                'verbose_name_plural': 'configuración',
            },
        ),
    ]
