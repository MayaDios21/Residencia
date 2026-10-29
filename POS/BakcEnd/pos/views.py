"""
API de autenticación (/api/auth/): inicio de sesión por rol con límite de
intentos fallidos, cierre de sesión y datos del usuario actual.
"""

from django.conf import settings
from django.contrib.auth import authenticate
from django.core.cache import cache
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.authtoken.views import ObtainAuthToken
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import LoginSerializer, UserSerializer


# Un mismo mensaje para todos los fallos, para no revelar si el usuario existe
# o si la contraseña era correcta.
INVALID_LOGIN_MESSAGE = 'Usuario o contraseña incorrectos.'


def get_client_ip(request):
    """IP del cliente. En Vercel se toma de X-Forwarded-For (ver settings)."""
    if settings.TRUST_X_FORWARDED_FOR:
        forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR', '')
        if forwarded_for:
            return forwarded_for.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR', '')


def get_failed_login_key(request):
    return f'login-failures:{get_client_ip(request)}'


def register_failed_login(request):
    key = get_failed_login_key(request)
    # La ventana empieza con el primer fallo y no se reinicia con los siguientes.
    cache.add(key, 0, timeout=settings.LOGIN_FAILURE_WINDOW_SECONDS)
    try:
        cache.incr(key)
    except ValueError:
        cache.set(key, 1, timeout=settings.LOGIN_FAILURE_WINDOW_SECONDS)


class LoginView(ObtainAuthToken):
    """Inicio de sesión con usuario y contraseña, con límite de intentos fallidos
    por dirección IP. El rol (cajero o administrador) se toma del perfil.
    """

    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        """Valida las credenciales y devuelve el token y los datos del usuario,
        incluido su rol. Rechaza a usuarios sin perfil y bloquea temporalmente
        la IP tras demasiados intentos fallidos.
        """
        if cache.get(get_failed_login_key(request), 0) >= settings.LOGIN_MAX_FAILED_ATTEMPTS:
            return Response(
                {'detail': 'Demasiados intentos fallidos. Espera un minuto e intenta de nuevo.'},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        user = authenticate(
            username=serializer.validated_data['username'],
            password=serializer.validated_data['password'],
        )
        # Sin perfil no hay rol con el cual entrar: se trata como credenciales inválidas.
        profile = getattr(user, 'profile', None) if user else None
        if profile is None:
            register_failed_login(request)
            return Response(
                {'detail': INVALID_LOGIN_MESSAGE},
                status=status.HTTP_400_BAD_REQUEST,
            )

        token, _ = Token.objects.get_or_create(user=user)
        return Response({
            'token': token.key,
            'user': UserSerializer(user).data,
        })


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        Token.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)
