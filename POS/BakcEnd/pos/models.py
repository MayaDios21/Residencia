from decimal import Decimal

from django.contrib.auth.models import User
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class UserProfile(models.Model):
    class Role(models.TextChoices):
        CASHIER = 'cashier', 'Cajero'
        ADMIN = 'admin', 'Administrador'

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='profile',
    )
    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.CASHIER,
    )

    def __str__(self):
        return f'{self.user.username} ({self.get_role_display()})'


class Category(models.Model):
    name = models.CharField(max_length=100, unique=True)
    color = models.CharField(max_length=7, default='#95a5a6')
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ('name',)
        verbose_name = 'categoría'
        verbose_name_plural = 'categorías'

    def __str__(self):
        return self.name


class Product(models.Model):
    category = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL,
        related_name='products',
        null=True,
        blank=True,
    )
    name = models.CharField(max_length=150)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    image = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=True)
    # null significa "sin registrar": el producto no controla existencias.
    stock = models.IntegerField(null=True, blank=True)
    minimum_stock = models.PositiveIntegerField(default=5)

    class Meta:
        ordering = ('name',)
        constraints = [
            models.UniqueConstraint(
                fields=('name', 'category'),
                name='unique_product_name_per_category',
            ),
            models.CheckConstraint(
                condition=models.Q(stock__isnull=True) | models.Q(stock__gte=0),
                name='product_stock_not_negative',
            ),
        ]
        verbose_name = 'producto'
        verbose_name_plural = 'productos'

    def __str__(self):
        return self.name


class InventoryMovement(models.Model):
    class Type(models.TextChoices):
        ENTRY = 'entrada', 'Entrada de mercancía'
        EXIT = 'salida', 'Salida o pérdida'
        ADJUSTMENT = 'ajuste', 'Ajuste de inventario'
        SALE = 'venta', 'Venta'
        CANCELLATION = 'cancelacion', 'Cancelación de venta'

    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        related_name='inventory_movements',
    )
    type = models.CharField(max_length=20, choices=Type.choices)
    quantity = models.PositiveIntegerField()
    reason = models.CharField(max_length=255, blank=True, default='')
    stock_before = models.IntegerField()
    stock_after = models.IntegerField()
    user = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name='inventory_movements',
    )
    # Solo se llena cuando el movimiento lo generó una venta.
    sale = models.ForeignKey(
        'Sale',
        on_delete=models.PROTECT,
        related_name='inventory_movements',
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ('-created_at', '-id')
        verbose_name = 'movimiento de inventario'
        verbose_name_plural = 'movimientos de inventario'

    def __str__(self):
        return f'{self.get_type_display()} {self.product} ({self.stock_before} → {self.stock_after})'


class SystemSettings(models.Model):
    """Configuración general del sistema. Siempre existe una sola fila (pk=1)."""

    tax_rate = models.DecimalField(
        max_digits=5,
        decimal_places=4,
        default=Decimal('0.08'),
        validators=[MinValueValidator(Decimal('0')), MaxValueValidator(Decimal('1'))],
    )
    exchange_rate = models.DecimalField(
        max_digits=10,
        decimal_places=4,
        default=Decimal('19.50'),
        validators=[MinValueValidator(Decimal('0.0001'))],
    )
    updated_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        related_name='+',
        null=True,
        blank=True,
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'configuración'
        verbose_name_plural = 'configuración'

    def __str__(self):
        return f'IVA {self.tax_rate * 100:.2f}% · USD ${self.exchange_rate}'

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        settings, _ = cls.objects.get_or_create(pk=1)
        return settings


class CashSession(models.Model):
    """Jornada de caja: una por día, se abre con un fondo y se cierra una vez."""

    class Status(models.TextChoices):
        OPEN = 'abierta', 'Abierta'
        CLOSED = 'cerrada', 'Cerrada'

    business_date = models.DateField(unique=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    opening_amount = models.DecimalField(max_digits=10, decimal_places=2)
    opened_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='+')
    opened_at = models.DateTimeField(auto_now_add=True)

    # Datos del cierre: se llenan al cerrar la jornada.
    sales_count = models.PositiveIntegerField(default=0)
    sales_total = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    minor_expenses = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0'))
    expected_cash = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    counted_cash = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    difference = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    retained_fund = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    closed_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name='+',
        null=True,
        blank=True,
    )
    closed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ('-business_date',)
        verbose_name = 'jornada de caja'
        verbose_name_plural = 'jornadas de caja'

    def __str__(self):
        return f'Caja {self.business_date} ({self.get_status_display()})'


class Sale(models.Model):
    class Status(models.TextChoices):
        OPEN = 'abierta', 'Abierta'
        CLOSED = 'cerrada', 'Cerrada'
        CANCELLED = 'cancelada', 'Cancelada'

    class PaymentMethod(models.TextChoices):
        # Por ahora el negocio solo cobra en efectivo (es lo único que ofrece el frontend).
        CASH = 'Efectivo', 'Efectivo'

    cash_session = models.ForeignKey(CashSession, on_delete=models.PROTECT, related_name='sales')
    cashier = models.ForeignKey(User, on_delete=models.PROTECT, related_name='sales')
    created_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN)
    payment_method = models.CharField(
        max_length=20,
        choices=PaymentMethod.choices,
        default=PaymentMethod.CASH,
    )
    # Copias de la configuración vigente al momento de la venta.
    tax_rate = models.DecimalField(max_digits=5, decimal_places=4)
    exchange_rate = models.DecimalField(max_digits=10, decimal_places=4)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)
    tax = models.DecimalField(max_digits=12, decimal_places=2)
    total = models.DecimalField(max_digits=12, decimal_places=2)
    # Datos de la cancelación: las ventas no se borran, se cancelan.
    cancelled_by = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        related_name='+',
        null=True,
        blank=True,
    )
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancel_reason = models.CharField(max_length=255, blank=True, default='')

    class Meta:
        ordering = ('-created_at', '-id')
        verbose_name = 'venta'
        verbose_name_plural = 'ventas'

    def __str__(self):
        return f'Venta #{self.pk} ${self.total}'


class SaleItem(models.Model):
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(
        Product,
        on_delete=models.SET_NULL,
        related_name='sale_items',
        null=True,
        blank=True,
    )
    # Copias del producto al momento de vender; no cambian si se edita el catálogo.
    product_name = models.CharField(max_length=150)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    quantity = models.PositiveIntegerField()
    line_total = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        ordering = ('id',)
        verbose_name = 'partida de venta'
        verbose_name_plural = 'partidas de venta'

    def __str__(self):
        return f'{self.quantity} × {self.product_name}'
