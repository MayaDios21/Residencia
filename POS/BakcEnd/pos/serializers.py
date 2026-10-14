from django.contrib.auth.models import User
from rest_framework import serializers

from .models import Category, Product, UserProfile


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
        )

    def validate_price(self, value):
        if value < 0:
            raise serializers.ValidationError('El precio no puede ser negativo.')
        return value
