"""
API de movimientos de inventario (solo administrador): entradas, salidas y
ajustes. Cada movimiento actualiza el stock con services.apply_stock_movement.
"""

from rest_framework import mixins, status, viewsets
from rest_framework.response import Response

from .models import InventoryMovement
from .permissions import IsAdminRole
from .serializers import InventoryMovementSerializer
from .services import InsufficientStockError, apply_stock_movement


class InventoryMovementViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """Movimientos de inventario: se registran y consultan, nunca se editan."""

    permission_classes = (IsAdminRole,)
    serializer_class = InventoryMovementSerializer

    def get_queryset(self):
        queryset = InventoryMovement.objects.select_related('product', 'user')
        product_id = self.request.query_params.get('producto')
        if product_id:
            queryset = queryset.filter(product_id=product_id)
        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            movement = apply_stock_movement(
                product_id=data['product'].pk,
                movement_type=data['type'],
                quantity=data['quantity'],
                user=request.user,
                reason=data.get('reason', ''),
            )
        except InsufficientStockError as error:
            return Response(
                {'detail': 'El movimiento no puede dejar el stock en negativo.',
                 'available': error.available},
                status=status.HTTP_409_CONFLICT,
            )

        return Response(
            self.get_serializer(movement).data,
            status=status.HTTP_201_CREATED,
        )
