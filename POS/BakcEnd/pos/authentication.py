"""
Autenticación por token con caducidad.

El token de DRF no caduca nunca: si alguien olvida cerrar sesión en un equipo
compartido, la sesión seguiría abierta para siempre. Aquí el token deja de
valer TOKEN_TTL_HOURS horas después de crearse; el siguiente login crea uno nuevo.
"""

from datetime import timedelta

from django.conf import settings
from django.utils import timezone
from rest_framework.authentication import TokenAuthentication
from rest_framework.exceptions import AuthenticationFailed


def token_is_expired(token):
    """True si el token ya pasó su tiempo de vida."""
    return timezone.now() - token.created > timedelta(hours=settings.TOKEN_TTL_HOURS)


class ExpiringTokenAuthentication(TokenAuthentication):
    """TokenAuthentication que rechaza (y borra) los tokens caducados."""

    def authenticate_credentials(self, key):
        user, token = super().authenticate_credentials(key)
        if token_is_expired(token):
            token.delete()
            raise AuthenticationFailed('Tu sesión expiró. Inicia sesión de nuevo.')
        return user, token
