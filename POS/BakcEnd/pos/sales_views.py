from rest_framework import mixins, status, viewsets
from rest_framework.response import Response

from .models import Sale
from .permissions import IsPosUser
from .serializers import SaleCreateSerializer, SaleSerializer
from .services import (
    CashSessionError,
    InsufficientStockError,
    SaleValidationError,
    create_sale,
)


class SaleViewSet(mixins.CreateModelMixin, viewsets.GenericViewSet):
    """Registro de ventas. La consulta del historial llega en la Fase 3."""

    permission_classes = (IsPosUser,)
    queryset = Sale.objects.select_related('cash_session', 'cashier')
    serializer_class = SaleSerializer
    name = 'Ventas'

    def get_serializer_class(self):
        # El formulario de la API navegable muestra los campos que se envían.
        if self.action == 'create':
            return SaleCreateSerializer
        return SaleSerializer

    def create(self, request, *args, **kwargs):
        serializer = SaleCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            sale = create_sale(
                serializer.validated_data['items'],
                request.user,
                payment_method=serializer.validated_data['payment'],
            )
        except CashSessionError as error:
            return Response({'detail': str(error)}, status=status.HTTP_409_CONFLICT)
        except InsufficientStockError as error:
            return Response(
                {
                    'detail': str(error),
                    'product_id': error.product.pk,
                    'available': error.available,
                },
                status=status.HTTP_409_CONFLICT,
            )
        except SaleValidationError as error:
            return Response({'detail': str(error)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(SaleSerializer(sale).data, status=status.HTTP_201_CREATED)
