from rest_framework.permissions import BasePermission

from .models import UserProfile


class HasRole(BasePermission):
    required_role = None

    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        try:
            profile = request.user.profile
        except UserProfile.DoesNotExist:
            return False

        return profile.role == self.required_role


class IsAdminRole(HasRole):
    required_role = UserProfile.Role.ADMIN


class IsCashierRole(HasRole):
    required_role = UserProfile.Role.CASHIER


class IsCatalogUser(BasePermission):
    def has_permission(self, request, view):
        if not request.user or not request.user.is_authenticated:
            return False

        try:
            return request.user.profile.role in UserProfile.Role.values
        except UserProfile.DoesNotExist:
            return False


# Ventas y caja las pueden operar ambos roles, igual que la lectura del catálogo.
IsPosUser = IsCatalogUser
