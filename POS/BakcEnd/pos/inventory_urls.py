from rest_framework.routers import DefaultRouter

from .inventory_views import InventoryMovementViewSet

router = DefaultRouter()
router.register('movimientos', InventoryMovementViewSet, basename='inventory-movement')

urlpatterns = router.urls
