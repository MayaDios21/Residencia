from rest_framework.routers import DefaultRouter

from .catalog_views import CategoryViewSet, ProductViewSet

router = DefaultRouter()
router.register('categorias', CategoryViewSet, basename='category')
router.register('productos', ProductViewSet, basename='product')

urlpatterns = router.urls
