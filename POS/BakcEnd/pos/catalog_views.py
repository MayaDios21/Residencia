from rest_framework import viewsets

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
