"""
Rutas principales del proyecto.

Cada módulo de la app ``pos`` define sus rutas en su propio archivo
``*_urls.py`` y aquí se incluyen bajo ``/api/``. El panel de Django queda en
``/admin/``.

Más información:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/
"""
from django.contrib import admin
from django.urls import include, path

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/', include('pos.auth_urls')),
    path('api/inventario/', include('pos.inventory_urls')),
    path('api/', include('pos.catalog_urls')),
    path('api/', include('pos.operations_urls')),
]
