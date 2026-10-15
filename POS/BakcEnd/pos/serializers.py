from django.contrib.auth.models import User
from rest_framework import serializers

from .models import Category, InventoryMovement, Product, UserProfile


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
