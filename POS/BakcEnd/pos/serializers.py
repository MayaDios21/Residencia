"""
Serializers de la API: convierten los modelos a JSON y validan los datos que
llegan (inicio de sesión, usuarios, catálogo, inventario, configuración, caja,
ventas y comandas).
"""

from decimal import Decimal

from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .models import (
    CashSession,
    Category,
    InventoryMovement,
    Order,
    Product,
    Sale,
    SaleItem,
    Supply,
    SystemSettings,
    UserProfile,
)
from .order_services import summarize_order
from .services import to_money


class LoginSerializer(serializers.Serializer):
    """Credenciales de inicio de sesión. El rol no se pide: sale del perfil del usuario."""
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)


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
            'track_inventory',
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

    # Se envía uno de los dos: product_id (producto de venta) o supply_id (insumo).
    product_id = serializers.PrimaryKeyRelatedField(
        source='product',
        queryset=Product.objects.all(),
        required=False,
        allow_null=True,
    )
    supply_id = serializers.PrimaryKeyRelatedField(
        source='supply',
        queryset=Supply.objects.all(),
        required=False,
        allow_null=True,
    )
    kind = serializers.SerializerMethodField()
    item_name = serializers.SerializerMethodField()
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
            'kind',
            'product_id',
            'supply_id',
            'item_name',
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

    def get_kind(self, movement):
        return 'insumo' if movement.supply_id else 'producto'

    def get_item_name(self, movement):
        return movement.item.name

    def validate(self, attrs):
        product = attrs.get('product')
        supply = attrs.get('supply')
        if bool(product) == bool(supply):
            raise serializers.ValidationError(
                'Indica un producto (product_id) o un insumo (supply_id), solo uno.'
            )
        if product and not product.track_inventory:
            raise serializers.ValidationError(
                {'product_id': 'Este producto no se controla en almacén.'}
            )
        if attrs['type'] != InventoryMovement.Type.ADJUSTMENT and attrs['quantity'] == 0:
            raise serializers.ValidationError(
                {'quantity': 'La cantidad debe ser mayor que cero.'}
            )
        return attrs


class SupplySerializer(serializers.ModelSerializer):
    class Meta:
        model = Supply
        fields = ('id', 'name', 'stock', 'minimum_stock', 'is_active')
        # Igual que en productos: el stock solo cambia con movimientos de inventario.
        read_only_fields = ('stock',)

    def validate_name(self, value):
        value = value.strip()
        duplicate = Supply.objects.filter(name__iexact=value)
        if self.instance:
            duplicate = duplicate.exclude(pk=self.instance.pk)
        if duplicate.exists():
            raise serializers.ValidationError('Ya existe un insumo con ese nombre.')
        return value


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
    numero_mesas = serializers.IntegerField(
        source='table_count',
        min_value=1,
        max_value=100,
        required=False,
        help_text='Mesas que muestra la cuadrícula del mesero.',
    )
    updated_by = serializers.CharField(source='updated_by.username', read_only=True, default=None)

    class Meta:
        model = SystemSettings
        fields = ('tax_rate', 'exchange_rate', 'numero_mesas', 'updated_by', 'updated_at')
        read_only_fields = ('updated_at',)

    def validate_numero_mesas(self, value):
        """Rechaza quitar mesas que hoy tienen una comanda abierta."""
        occupied = list(
            Order.objects
            .filter(status=Order.Status.OPEN, table_number__gt=value)
            .order_by('table_number')
            .values_list('table_number', flat=True)
        )
        if occupied:
            tables = ', '.join(str(table) for table in occupied)
            raise serializers.ValidationError(
                f'No puedes quitar mesas con comandas abiertas: {tables}.'
            )
        return value


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


class ManagedUserSerializer(serializers.ModelSerializer):
    """Usuario visto desde la gestión de usuarios del administrador."""

    role = serializers.ChoiceField(source='profile.role', choices=UserProfile.Role.choices)
    role_display = serializers.CharField(source='profile.get_role_display', read_only=True)

    class Meta:
        model = User
        fields = (
            'id',
            'username',
            'first_name',
            'last_name',
            'role',
            'role_display',
            'is_active',
            'last_login',
            'date_joined',
        )
        read_only_fields = ('username', 'last_login', 'date_joined')


class UserCreateSerializer(serializers.Serializer):
    username = serializers.RegexField(
        r'^[\w.@+-]+$',
        max_length=150,
        error_messages={'invalid': 'Usa solo letras, números y los símbolos . @ + - _'},
    )
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True, default='')
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True, default='')
    role = serializers.ChoiceField(choices=UserProfile.Role.choices)
    password = serializers.CharField(write_only=True, style={'input_type': 'password'})

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError('Ya existe un usuario con ese nombre.')
        return value

    def validate(self, attrs):
        candidate = User(
            username=attrs['username'],
            first_name=attrs.get('first_name', ''),
            last_name=attrs.get('last_name', ''),
        )
        try:
            validate_password(attrs['password'], user=candidate)
        except DjangoValidationError as error:
            raise serializers.ValidationError({'password': list(error.messages)}) from error
        return attrs


class UserUpdateSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    role = serializers.ChoiceField(choices=UserProfile.Role.choices, required=False)
    is_active = serializers.BooleanField(required=False)


class PasswordResetSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True, style={'input_type': 'password'})

    def validate_password(self, value):
        try:
            validate_password(value, user=self.context.get('user'))
        except DjangoValidationError as error:
            raise serializers.ValidationError(list(error.messages)) from error
        return value


# ---------------------------------------------------------------------------
# Comandas
# ---------------------------------------------------------------------------

class OrderCreateSerializer(serializers.Serializer):
    """Abrir la comanda de una mesa con sus primeros productos."""
    mesa = serializers.IntegerField(min_value=1)
    items = SaleItemInputSerializer(many=True, allow_empty=False)


class OrderItemsSerializer(serializers.Serializer):
    """Productos que se agregan a una comanda abierta."""
    items = SaleItemInputSerializer(many=True, allow_empty=False)


class OrderRemoveItemSerializer(serializers.Serializer):
    """Producto y cantidad que se quitan de una comanda abierta."""
    product_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1)


class OrderCancelSerializer(serializers.Serializer):
    """Motivo de la cancelación; solo es obligatorio si la comanda tiene productos."""
    motivo = serializers.CharField(max_length=255, required=False, allow_blank=True, default='')


class OrderEventSerializer(serializers.Serializer):
    """Un renglón de la bitácora: quién agregó o quitó qué y cuándo."""
    action = serializers.CharField()
    product_name = serializers.CharField()
    quantity = serializers.IntegerField()
    user = serializers.CharField(source='user.username')
    created_at = serializers.DateTimeField()


class OrderSerializer(serializers.ModelSerializer):
    """Comanda con sus productos al precio vigente, totales del servidor y bitácora."""
    mesa = serializers.IntegerField(source='table_number', read_only=True)
    business_date = serializers.DateField(source='cash_session.business_date', read_only=True)
    opened_by = serializers.CharField(source='opened_by.username', read_only=True)
    cancelled_by = serializers.CharField(source='cancelled_by.username', read_only=True, default=None)
    items = serializers.SerializerMethodField()
    subtotal = serializers.SerializerMethodField()
    tax = serializers.SerializerMethodField()
    total = serializers.SerializerMethodField()
    events = OrderEventSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = (
            'id',
            'mesa',
            'status',
            'business_date',
            'opened_by',
            'opened_at',
            'closed_at',
            'cancelled_by',
            'cancel_reason',
            'items',
            'subtotal',
            'tax',
            'total',
            'events',
        )
        read_only_fields = fields

    def _summary(self, order):
        """Calcula una sola vez los totales de la comanda por respuesta."""
        cache = getattr(self, '_summaries', None)
        if cache is None:
            cache = self._summaries = {}
        if order.pk not in cache:
            cache[order.pk] = summarize_order(order)
        return cache[order.pk]

    def get_items(self, order):
        """Partidas con el precio vigente del producto (aún no es venta)."""
        return [
            {
                'product_id': item.product_id,
                'product_name': item.product.name,
                'unit_price': str(item.product.price),
                'quantity': item.quantity,
                'line_total': str(to_money(item.product.price * item.quantity)),
            }
            for item in order.items.all()
        ]

    def get_subtotal(self, order):
        """Subtotal con precios vigentes, como texto para no perder decimales."""
        return str(self._summary(order)['subtotal'])

    def get_tax(self, order):
        """IVA con la tasa vigente."""
        return str(self._summary(order)['tax'])

    def get_total(self, order):
        """Lo que se cobraría hoy."""
        return str(self._summary(order)['total'])
