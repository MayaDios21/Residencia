"""
API de inventario (solo administrador).

- Movimientos: entradas, salidas y ajustes de productos controlados en almacén
  o de insumos. Cada movimiento actualiza el stock con
  services.apply_stock_movement.
- Insumos: artículos del almacén que no se venden (vasos, platos…).
- Alertas: algoritmo de reabastecimiento (services.build_restock_report).
"""

from django.db.models import ProtectedError
from rest_framework import mixins, status, viewsets
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import InventoryMovement, Supply
from .permissions import IsAdminRole
from .serializers import InventoryMovementSerializer, SupplySerializer
from .services import InsufficientStockError, apply_stock_movement, build_restock_report


class InventoryMovementViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    viewsets.GenericViewSet,
):
    """Movimientos de inventario: se registran y consultan, nunca se editan.

    Filtros: ?producto=<id>, ?insumo=<id>.
    """

    permission_classes = (IsAdminRole,)
    serializer_class = InventoryMovementSerializer

    def get_queryset(self):
        queryset = InventoryMovement.objects.select_related('product', 'supply', 'user')
        product_id = self.request.query_params.get('producto')
        if product_id:
            queryset = queryset.filter(product_id=product_id)
        supply_id = self.request.query_params.get('insumo')
        if supply_id:
            queryset = queryset.filter(supply_id=supply_id)
        return queryset

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        product = data.get('product')
        supply = data.get('supply')

        try:
            movement = apply_stock_movement(
                product_id=product.pk if product else None,
                supply_id=supply.pk if supply else None,
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


class SupplyViewSet(viewsets.ModelViewSet):
    """Insumos del almacén. El stock cambia con movimientos, no al editar.

    Un insumo con movimientos no se borra (responde 409): se desactiva.
    """

    permission_classes = (IsAdminRole,)
    serializer_class = SupplySerializer
    queryset = Supply.objects.all()

    def destroy(self, request, *args, **kwargs):
        supply = self.get_object()
        try:
            supply.delete()
        except ProtectedError:
            return Response(
                {'detail': (
                    'Este insumo tiene historial de inventario; '
                    'desactívalo en lugar de borrarlo.'
                )},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)


def parse_positive_int(params, name, default, minimum, maximum):
    value = params.get(name)
    if value in (None, ''):
        return default
    try:
        number = int(value)
    except ValueError as error:
        raise ValidationError({name: 'Debe ser un número entero.'}) from error
    if not minimum <= number <= maximum:
        raise ValidationError({name: f'Debe estar entre {minimum} y {maximum}.'})
    return number


class RestockAlertsView(APIView):
    """Alertas de stock con el algoritmo de reabastecimiento.

    Parámetros opcionales: ?dias=<historial a promediar, 14 por defecto>,
    ?reposicion=<días que tarda un pedido, 2 por defecto>,
    ?todos=true para incluir también los artículos sin problema.
    """

    permission_classes = (IsAdminRole,)
    name = 'Alertas de stock'

    def get(self, request):
        params = request.query_params
        report = build_restock_report(
            window_days=parse_positive_int(params, 'dias', None, 1, 365),
            lead_days=parse_positive_int(params, 'reposicion', None, 0, 60),
            include_ok=params.get('todos') == 'true',
        )
        return Response(report)
