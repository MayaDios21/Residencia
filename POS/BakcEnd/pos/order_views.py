"""
API de comandas (/api/comandas/): cuadrícula de mesas, abrir, agregar, quitar,
cobrar y cancelar. Las reglas viven en order_services.py; aquí solo se validan
los datos y se traducen los errores a códigos HTTP.

Mesero, cajero y administrador usan las comandas; solo cajero y administrador
cobran.
"""

from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from .models import Order
from .order_services import (
    OrderConflictError,
    OrderPermissionError,
    OrderValidationError,
    add_order_items,
    cancel_order,
    charge_order,
    get_tables_overview,
    open_order,
    remove_order_item,
)
from .permissions import IsOrderUser, IsPosUser
from .serializers import (
    OrderCancelSerializer,
    OrderCreateSerializer,
    OrderItemsSerializer,
    OrderRemoveItemSerializer,
    OrderSerializer,
    SaleSerializer,
)
from .services import CashSessionError, InsufficientStockError, SaleValidationError


def run_order_operation(operation):
    """Ejecuta una operación de comanda y traduce sus errores a respuestas HTTP.

    Devuelve (resultado, None) si salió bien, o (None, Response) con el error:
    409 regla de negocio, 400 dato inválido, 403 rol sin permiso.
    """
    try:
        return operation(), None
    except InsufficientStockError as error:
        return None, Response(
            {'detail': str(error), 'product_id': error.product.pk, 'available': error.available},
            status=status.HTTP_409_CONFLICT,
        )
    except (OrderConflictError, CashSessionError) as error:
        return None, Response({'detail': str(error)}, status=status.HTTP_409_CONFLICT)
    except (OrderValidationError, SaleValidationError) as error:
        return None, Response({'detail': str(error)}, status=status.HTTP_400_BAD_REQUEST)
    except OrderPermissionError as error:
        return None, Response({'detail': str(error)}, status=status.HTTP_403_FORBIDDEN)


class OrderViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Comandas por mesa. Lista con ?estado=abierta|cobrada|cancelada."""

    serializer_class = OrderSerializer

    def get_queryset(self):
        """Comandas con lo necesario para la respuesta, filtradas por ?estado."""
        queryset = (
            Order.objects
            .select_related('opened_by', 'cancelled_by', 'cash_session')
            .prefetch_related('items__product', 'events__user')
        )
        estado = self.request.query_params.get('estado')
        if estado:
            queryset = queryset.filter(status=estado)
        return queryset

    def get_permissions(self):
        """Cobrar es de caja (cajero y admin); todo lo demás también lo usa el mesero."""
        if self.action == 'charge':
            return [IsPosUser()]
        return [IsOrderUser()]

    def get_serializer_class(self):
        """Formulario de la API navegable según la acción."""
        return {
            'create': OrderCreateSerializer,
            'add_items': OrderItemsSerializer,
            'remove_item': OrderRemoveItemSerializer,
            'cancel': OrderCancelSerializer,
        }.get(self.action, OrderSerializer)

    def order_response(self, order_id, status_code=status.HTTP_200_OK):
        """Responde con la comanda recién modificada, leída de nuevo de la base."""
        order = self.get_queryset().get(pk=order_id)
        return Response(OrderSerializer(order).data, status=status_code)

    def create(self, request, *args, **kwargs):
        """Abre la comanda de una mesa libre con sus primeros productos."""
        serializer = OrderCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order, error = run_order_operation(lambda: open_order(
            serializer.validated_data['mesa'],
            serializer.validated_data['items'],
            request.user,
        ))
        return error or self.order_response(order.pk, status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='mesas', name='Mesas')
    def tables(self, request):
        """Cuadrícula: cada mesa libre u ocupada, con su comanda resumida."""
        overview = get_tables_overview()
        for table in overview['mesas']:
            if table['comanda']:
                # Montos como texto, igual que el resto de la API.
                table['comanda']['subtotal'] = str(table['comanda']['subtotal'])
        return Response(overview)

    @action(detail=True, methods=['post'], url_path='agregar', name='Agregar productos')
    def add_items(self, request, pk=None):
        """Agrega productos a la comanda; si ya estaban, suma la cantidad."""
        order = self.get_object()
        serializer = OrderItemsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        _, error = run_order_operation(lambda: add_order_items(
            order.pk, serializer.validated_data['items'], request.user,
        ))
        return error or self.order_response(order.pk)

    @action(detail=True, methods=['post'], url_path='quitar', name='Quitar producto')
    def remove_item(self, request, pk=None):
        """Resta cantidad a un producto; en cero lo quita de la comanda."""
        order = self.get_object()
        serializer = OrderRemoveItemSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        _, error = run_order_operation(lambda: remove_order_item(
            order.pk,
            serializer.validated_data['product_id'],
            serializer.validated_data['quantity'],
            request.user,
        ))
        return error or self.order_response(order.pk)

    @action(detail=True, methods=['post'], url_path='cobrar', name='Cobrar')
    def charge(self, request, pk=None):
        """Cobra la comanda y responde con la venta, igual que POST /api/ventas/."""
        order = self.get_object()
        sale, error = run_order_operation(lambda: charge_order(order.pk, request.user))
        return error or Response(SaleSerializer(sale).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='cancelar', name='Cancelar')
    def cancel(self, request, pk=None):
        """Cancela la comanda; con productos exige motivo y solo la hace caja."""
        order = self.get_object()
        serializer = OrderCancelSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        _, error = run_order_operation(lambda: cancel_order(
            order.pk, request.user, serializer.validated_data['motivo'],
        ))
        return error or self.order_response(order.pk)
