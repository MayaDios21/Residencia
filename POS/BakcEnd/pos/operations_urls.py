"""
Rutas de la operación diaria bajo /api/: /api/configuracion/, /api/caja/,
/api/ventas/ y /api/usuarios/.
"""

from django.urls import path
from rest_framework.routers import DefaultRouter

from .cashbox_views import CashBoxViewSet
from .sales_views import SaleViewSet
from .settings_views import SystemSettingsView
from .user_views import UserViewSet

router = DefaultRouter()
router.register('caja', CashBoxViewSet, basename='cashbox')
router.register('ventas', SaleViewSet, basename='sale')
router.register('usuarios', UserViewSet, basename='managed-user')

urlpatterns = [
    path('configuracion/', SystemSettingsView.as_view(), name='system-settings'),
    *router.urls,
]
