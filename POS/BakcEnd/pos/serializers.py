from django.contrib.auth.models import User
from rest_framework import serializers

from .models import UserProfile


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
