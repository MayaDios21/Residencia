"""
Configuración de Django del proyecto.

Los valores sensibles o que cambian entre equipos (clave secreta, modo de
depuración, hosts permitidos, base de datos y CORS) se leen de variables de
entorno; ver ``.env.example``.

Más información:
https://docs.djangoproject.com/en/5.2/topics/settings/

Lista completa de opciones:
https://docs.djangoproject.com/en/5.2/ref/settings/
"""

import os
from pathlib import Path

import dj_database_url

# Las rutas dentro del proyecto se arman así: BASE_DIR / 'subcarpeta'.
BASE_DIR = Path(__file__).resolve().parent.parent


# Antes de publicar en producción, revisar la lista de verificación:
# https://docs.djangoproject.com/en/5.2/howto/deployment/checklist/

# ADVERTENCIA DE SEGURIDAD: la clave secreta de producción nunca se comparte.
SECRET_KEY = os.environ['DJANGO_SECRET_KEY']

# ADVERTENCIA DE SEGURIDAD: no usar el modo de depuración en producción.
# Apagado por defecto: en desarrollo se enciende con DJANGO_DEBUG=True.
DEBUG = os.getenv('DJANGO_DEBUG', 'False').lower() == 'true'

ALLOWED_HOSTS = [
    host.strip()
    for host in os.getenv('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1').split(',')
    if host.strip()
]


# Aplicaciones instaladas

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'corsheaders',
    'rest_framework',
    'rest_framework.authtoken',
    'pos',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'


# Base de datos
# Si existe DATABASE_URL se usa PostgreSQL (Supabase en producción); si no,
# SQLite local como respaldo para desarrollo y pruebas.
database_url = os.getenv('DATABASE_URL', '').strip()

if database_url:
    DATABASES = {
        'default': dj_database_url.parse(
            database_url,
            conn_max_age=600,
            conn_health_checks=True,
        ),
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'


# Validación de contraseñas
# https://docs.djangoproject.com/en/5.2/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Idioma y zona horaria
# https://docs.djangoproject.com/en/5.2/topics/i18n/

LANGUAGE_CODE = 'es-mx'

TIME_ZONE = 'America/Tijuana'

USE_I18N = True

USE_TZ = True


# Archivos estáticos (CSS, JavaScript e imágenes)
# https://docs.djangoproject.com/en/5.2/howto/static-files/

STATIC_URL = 'static/'


# Correo electrónico
# https://docs.djangoproject.com/en/5.2/topics/email/

MAILERS = {
    'default': {
        'BACKEND': 'django.core.mail.backends.console.EmailBackend',
    },
}

# Inicio de sesión: intentos fallidos permitidos por dirección IP en la ventana.
LOGIN_MAX_FAILED_ATTEMPTS = 5
LOGIN_FAILURE_WINDOW_SECONDS = 60

# Algoritmo de reabastecimiento: días de historial que se promedian y días que
# tarda en llegar un pedido (dato del negocio: 2 días).
RESTOCK_WINDOW_DAYS = 14
RESTOCK_LEAD_DAYS = 2

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.TokenAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
}

configured_cors_origins = [
    origin.strip()
    for origin in os.getenv(
        'CORS_ALLOWED_ORIGINS',
        'http://localhost:8080,http://127.0.0.1:8080',
    ).split(',')
    if origin.strip()
]

if DEBUG:
    configured_cors_origins.extend([
        'http://localhost:5500',
        'http://127.0.0.1:5500',
        'http://localhost:3000',
        'http://127.0.0.1:3000',
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'null',
    ])

CORS_ALLOWED_ORIGINS = list(dict.fromkeys(configured_cors_origins))

if DEBUG:
    # Permite probar la API desde el navegador (API navegable de DRF) usando la
    # sesión de /admin/. El frontend sigue usando tokens; solo aplica en desarrollo.
    REST_FRAMEWORK['DEFAULT_AUTHENTICATION_CLASSES'].append(
        'rest_framework.authentication.SessionAuthentication',
    )
