from django.db.models import ProtectedError
from rest_framework import status, viewsets
from rest_framework.response import Response

from .models import Category, Product
from .permissions import IsAdminRole, IsCatalogUser
from .serializers import CategorySerializer, ProductSerializer


class CatalogViewSet(viewsets.ModelViewSet):
    permission_classes = (IsCatalogUser,)

    def get_permissions(self):
        if self.action in ('list', 'retrieve'):
            permission_classes = (IsCatalogUser,)
        else:
            permission_classes = (IsAdminRole,)
        return [permission() for permission in permission_classes]


class CategoryViewSet(CatalogViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer


class ProductViewSet(CatalogViewSet):
    queryset = Product.objects.select_related('category').all()
    serializer_class = ProductSerializer

    def destroy(self, request, *args, **kwargs):
        product = self.get_object()
        try:
            product.delete()
        except ProtectedError:
            # Sus movimientos de inventario se conservan como historial.
            return Response(
                {'detail': (
                    'Este producto tiene historial de inventario; '
                    'desactívalo en lugar de borrarlo.'
                )},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)
