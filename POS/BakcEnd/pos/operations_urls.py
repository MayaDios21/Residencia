from django.urls import path
from rest_framework.routers import DefaultRouter

from .cashbox_views import CashBoxViewSet
from .sales_views import SaleViewSet
from .settings_views import SystemSettingsView

router = DefaultRouter()
router.register('caja', CashBoxViewSet, basename='cashbox')
router.register('ventas', SaleViewSet, basename='sale')

urlpatterns = [
    path('configuracion/', SystemSettingsView.as_view(), name='system-settings'),
    *router.urls,
]
