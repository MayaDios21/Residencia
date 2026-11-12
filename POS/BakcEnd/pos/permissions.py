"""
Permisos por rol para la API.

- IsAdminRole: solo administrador.
- IsCashierRole: solo cajero.
- IsCatalogUser: cualquier usuario con un rol válido (leer el menú).
- IsPosUser: cajero y administrador (caja, ventas, configuración).
- IsOrderUser: mesero, cajero y administrador (comandas).
"""

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


class HasAnyRole(BasePermission):
    """Permite el acceso a usuarios autenticados cuyo rol esté en allowed_roles."""
    allowed_roles = ()

    def has_permission(self, request, view):
        """True si el usuario inició sesión y su perfil tiene uno de los roles permitidos."""
        if not request.user or not request.user.is_authenticated:
            return False

        try:
            return request.user.profile.role in self.allowed_roles
        except UserProfile.DoesNotExist:
            return False


class IsPosUser(HasAnyRole):
    """Caja, ventas y configuración: cajero y administrador. El mesero no entra."""
    allowed_roles = (UserProfile.Role.CASHIER, UserProfile.Role.ADMIN)


class IsOrderUser(HasAnyRole):
    """Comandas: mesero, cajero y administrador."""
    allowed_roles = (UserProfile.Role.WAITER, UserProfile.Role.CASHIER, UserProfile.Role.ADMIN)
