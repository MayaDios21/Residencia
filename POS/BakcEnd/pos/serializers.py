from decimal import Decimal

from django.contrib.auth.models import User
from rest_framework import serializers

from .models import (
    CashSession,
    Category,
    InventoryMovement,
    Product,
    Sale,
    SaleItem,
    SystemSettings,
    UserProfile,
)


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)
    role = serializers.ChoiceField(choices=UserProfile.Role.choices)


class UserSerializer(serializers.ModelSerializer):
    role = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ('id', 'username', 'first_name', 'last_name', 'role')

    def get_role(self, user):
        try:
            return user.profile.role
        except UserProfile.DoesNotExist:
            return None


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ('id', 'name', 'color', 'is_active')

    def validate_color(self, value):
        if len(value) != 7 or not value.startswith('#'):
            raise serializers.ValidationError(
                'El color debe tener el formato hexadecimal #RRGGBB.'
            )
        try:
            int(value[1:], 16)
        except ValueError as error:
            raise serializers.ValidationError(
                'El color debe tener el formato hexadecimal #RRGGBB.'
            ) from error
        return value.lower()


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)

    class Meta:
        model = Product
        fields = (
            'id',
            'name',
            'category',
            'category_name',
            'price',
            'image',
            'is_active',
            'stock',
            'minimum_stock',
        )
        # El stock solo cambia mediante movimientos de inventario o ventas.
        read_only_fields = ('stock',)

    def validate_price(self, value):
        if value < 0:
            raise serializers.ValidationError('El precio no puede ser negativo.')
        return value


class InventoryMovementSerializer(serializers.ModelSerializer):
    MANUAL_TYPES = (
        InventoryMovement.Type.ENTRY,
        InventoryMovement.Type.EXIT,
        InventoryMovement.Type.ADJUSTMENT,
    )

    product_id = serializers.PrimaryKeyRelatedField(
        source='product',
        queryset=Product.objects.all(),
    )
    product_name = serializers.CharField(source='product.name', read_only=True)
    type = serializers.ChoiceField(
        choices=[(value, InventoryMovement.Type(value).label) for value in MANUAL_TYPES],
    )
    quantity = serializers.IntegerField(min_value=0)
    username = serializers.CharField(source='user.username', read_only=True)
    stock_remaining = serializers.IntegerField(source='stock_after', read_only=True)

    class Meta:
        model = InventoryMovement
        fields = (
            'id',
            'product_id',
            'product_name',
            'type',
            'quantity',
            'reason',
            'stock_before',
            'stock_after',
            'stock_remaining',
            'username',
            'created_at',
        )
        read_only_fields = ('stock_before', 'stock_after', 'created_at')

    def to_representation(self, instance):
        # Los movimientos generados por ventas también se listan con su tipo real.
        data = super().to_representation(instance)
        data['type'] = instance.type
        return data

    def validate(self, attrs):
        if attrs['type'] != InventoryMovement.Type.ADJUSTMENT and attrs['quantity'] == 0:
            raise serializers.ValidationError(
                {'quantity': 'La cantidad debe ser mayor que cero.'}
            )
        return attrs


class SystemSettingsSerializer(serializers.ModelSerializer):
    tax_rate = serializers.DecimalField(
        max_digits=5,
        decimal_places=4,
        min_value=Decimal('0'),
        max_value=Decimal('1'),
        help_text='Fracción: 0.08 equivale a 8 %.',
    )
    exchange_rate = serializers.DecimalField(
        max_digits=10,
        decimal_places=4,
        min_value=Decimal('0.0001'),
    )
    updated_by = serializers.CharField(source='updated_by.username', read_only=True, default=None)

    class Meta:
        model = SystemSettings
        fields = ('tax_rate', 'exchange_rate', 'updated_by', 'updated_at')
        read_only_fields = ('updated_at',)


class CashSessionSerializer(serializers.ModelSerializer):
    opened_by = serializers.CharField(source='opened_by.username', read_only=True)
    closed_by = serializers.CharField(source='closed_by.username', read_only=True, default=None)

    class Meta:
        model = CashSession
        fields = (
            'id',
            'business_date',
            'status',
            'opening_amount',
            'opened_by',
            'opened_at',
            'sales_count',
            'sales_total',
            'minor_expenses',
            'expected_cash',
            'counted_cash',
            'difference',
            'retained_fund',
            'closed_by',
            'closed_at',
        )
        read_only_fields = fields


class OpenCashSessionSerializer(serializers.Serializer):
    opening_amount = serializers.DecimalField(max_digits=10, decimal_places=2)

    def validate_opening_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError('El fondo inicial debe ser mayor que cero.')
        return value


class CloseCashSessionSerializer(serializers.Serializer):
    counted_cash = serializers.DecimalField(
        max_digits=12, decimal_places=2, min_value=Decimal('0'), required=False, allow_null=True,
    )
    minor_expenses = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=Decimal('0'), required=False, default=Decimal('0'),
    )
    retained_fund = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=Decimal('0'), required=False, allow_null=True,
    )


class SaleItemInputSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1)


class SaleCreateSerializer(serializers.Serializer):
    items = SaleItemInputSerializer(many=True, allow_empty=False)
    payment = serializers.ChoiceField(
        choices=Sale.PaymentMethod.choices,
        default=Sale.PaymentMethod.CASH,
    )


class SaleItemSerializer(serializers.ModelSerializer):
    product_id = serializers.IntegerField(read_only=True)
    stock_remaining = serializers.SerializerMethodField()

    class Meta:
        model = SaleItem
        fields = (
            'product_id',
            'product_name',
            'unit_price',
            'quantity',
            'line_total',
            'stock_remaining',
        )

    def get_stock_remaining(self, item):
        # Solo tiene sentido en la respuesta de una venta recién registrada.
        return getattr(item, 'stock_remaining', None)


class SaleSerializer(serializers.ModelSerializer):
    cashier = serializers.CharField(source='cashier.username', read_only=True)
    business_date = serializers.DateField(source='cash_session.business_date', read_only=True)
    payment = serializers.CharField(source='payment_method', read_only=True)
    items_count = serializers.SerializerMethodField()
    items = serializers.SerializerMethodField()
    cancelled_by = serializers.CharField(source='cancelled_by.username', read_only=True, default=None)

    class Meta:
        model = Sale
        fields = (
            'id',
            'created_at',
            'business_date',
            'cashier',
            'status',
            'payment',
            'tax_rate',
            'exchange_rate',
            'subtotal',
            'tax',
            'total',
            'items_count',
            'items',
            'cancelled_by',
            'cancelled_at',
            'cancel_reason',
        )

    def _items(self, sale):
        items = getattr(sale, 'created_items', None)
        return items if items is not None else list(sale.items.all())

    def get_items_count(self, sale):
        return sum(item.quantity for item in self._items(sale))

    def get_items(self, sale):
        return SaleItemSerializer(self._items(sale), many=True).data


class CancelSaleSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')
