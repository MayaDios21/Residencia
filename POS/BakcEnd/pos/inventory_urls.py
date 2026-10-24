"""
Rutas del inventario bajo /api/inventario/: movimientos/, insumos/ y alertas/.
"""

from django.urls import path
from rest_framework.routers import DefaultRouter

from .inventory_views import InventoryMovementViewSet, RestockAlertsView, SupplyViewSet

router = DefaultRouter()
router.register('movimientos', InventoryMovementViewSet, basename='inventory-movement')
router.register('insumos', SupplyViewSet, basename='supply')

urlpatterns = [
    path('alertas/', RestockAlertsView.as_view(), name='restock-alerts'),
    *router.urls,
]
