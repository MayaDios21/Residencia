"""
Configuración ASGI del proyecto.

Expone la aplicación ASGI en la variable ``application`` de este módulo.

Más información:
https://docs.djangoproject.com/en/5.2/howto/deployment/asgi/
"""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

application = get_asgi_application()
