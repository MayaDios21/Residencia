"""
API de gestión de usuarios (/api/usuarios/), solo para el administrador: alta,
cambio de rol, activación y restablecimiento de contraseña.
"""

from django.contrib.auth.models import User
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from .models import UserProfile
from .permissions import IsAdminRole
from .serializers import (
    ManagedUserSerializer,
    PasswordResetSerializer,
    UserCreateSerializer,
    UserUpdateSerializer,
)
from .services import (
    UserManagementError,
    create_user_with_role,
    reset_user_password,
    update_user,
)


class UserViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    """Gestión de usuarios (solo administrador).

    Los usuarios no se borran: se desactivan, para conservar quién hizo cada
    venta, movimiento o cierre. Filtros: ?rol=admin|cashier, ?activo=true|false.
    """

    permission_classes = (IsAdminRole,)
    name = 'Usuarios'

    def get_queryset(self):
        queryset = (
            User.objects
            .filter(profile__isnull=False)
            .select_related('profile')
            .order_by('-is_active', 'username')
        )
        params = self.request.query_params
        role = params.get('rol')
        if role:
            if role not in UserProfile.Role.values:
                raise ValidationError({'rol': f'Usa uno de: {", ".join(UserProfile.Role.values)}.'})
            queryset = queryset.filter(profile__role=role)
        active = params.get('activo')
        if active in ('true', 'false'):
            queryset = queryset.filter(is_active=active == 'true')
        return queryset

    def get_serializer_class(self):
        # El formulario de la API navegable muestra los campos que se envían.
        if self.action == 'create':
            return UserCreateSerializer
        if self.action in ('update', 'partial_update'):
            return UserUpdateSerializer
        if self.action == 'reset_password':
            return PasswordResetSerializer
        return ManagedUserSerializer

    def create(self, request, *args, **kwargs):
        serializer = UserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = create_user_with_role(**serializer.validated_data)
        return Response(ManagedUserSerializer(user).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        user = self.get_object()
        serializer = UserUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            user = update_user(user, request.user, **serializer.validated_data)
        except UserManagementError as error:
            return Response({'detail': str(error)}, status=status.HTTP_409_CONFLICT)
        return Response(ManagedUserSerializer(user).data)

    @action(
        detail=True,
        methods=['post'],
        url_path='restablecer-contrasena',
        name='Restablecer contraseña',
    )
    def reset_password(self, request, pk=None):
        user = self.get_object()
        serializer = PasswordResetSerializer(data=request.data, context={'user': user})
        serializer.is_valid(raise_exception=True)
        reset_user_password(user, serializer.validated_data['password'])
        return Response({'detail': f'Contraseña de {user.username} actualizada.'})
