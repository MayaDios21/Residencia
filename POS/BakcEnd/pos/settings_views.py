from rest_framework.response import Response
from rest_framework.views import APIView

from .models import SystemSettings
from .permissions import IsAdminRole, IsPosUser
from .serializers import SystemSettingsSerializer


class SystemSettingsView(APIView):
    """IVA y tipo de cambio: ambos roles los leen, solo el administrador los cambia."""

    name = 'Configuración'

    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsPosUser()]
        return [IsAdminRole()]

    def get(self, request):
        return Response(SystemSettingsSerializer(SystemSettings.load()).data)

    def patch(self, request):
        settings = SystemSettings.load()
        serializer = SystemSettingsSerializer(settings, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save(updated_by=request.user)
        return Response(serializer.data)
