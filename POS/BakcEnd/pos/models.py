from django.db import models

from django.contrib.auth.models import User


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
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ('-created_at', '-id')
        verbose_name = 'movimiento de inventario'
        verbose_name_plural = 'movimientos de inventario'

    def __str__(self):
        return f'{self.get_type_display()} {self.product} ({self.stock_before} → {self.stock_after})'
