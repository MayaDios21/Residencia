"""
Configuración WSGI del proyecto.

Expone la aplicación WSGI en la variable ``application`` de este módulo.
Es la que usan los servidores de producción (por ejemplo, gunicorn).

Más información:
https://docs.djangoproject.com/en/5.2/howto/deployment/wsgi/
"""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

application = get_wsgi_application()
