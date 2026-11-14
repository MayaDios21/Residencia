<!-- Revisión de seguridad del POS publicado (Proyecto 1 y comandas). -->

# Revisión de seguridad

**Fecha:** 2026-11-13 · **Sitio:** https://pos-el-compita.vercel.app

Revisión general del sistema publicado (frontend en Vercel, API Django y base
PostgreSQL en Supabase). Primero se lista lo que ya estaba bien y después lo que
se corrigió en esta revisión.

## 1. Lo que ya estaba bien

| Área | Estado |
|---|---|
| HTTPS | Todo el tráfico va por HTTPS; http redirige (308) y se manda HSTS |
| Modo debug | Apagado en producción; los errores no muestran código ni datos |
| Secretos | `DJANGO_SECRET_KEY` y `DATABASE_URL` solo viven en Vercel (marcados como sensibles); el repositorio no tiene contraseñas |
| Archivos sensibles | `.env`, `.git`, `vercel.json`, guías y contexto no se pueden descargar (404) |
| Inicio de sesión | Mensaje genérico ("Usuario o contraseña incorrectos"), máximo 5 intentos fallidos por IP por minuto, IP real tomada del proxy de Vercel |
| Contraseñas | Guardadas con hash de Django (PBKDF2); al crear o cambiar una se exigen los validadores de Django (longitud, comunes, solo números, parecida al usuario) |
| Permisos por rol | Cada ruta de la API revisa el rol en el servidor: el administrador gestiona; el cajero vende y hace caja; el mesero solo usa comandas. El rol sale del perfil, no de lo que mande el navegador |
| Reglas del negocio | Precios, IVA y totales los calcula el servidor; el navegador solo manda productos y cantidades |
| Historial | Ventas, cierres y movimientos no se borran (se cancelan o desactivan) |
| CORS | La API no acepta peticiones de otros dominios |
| API | Cabeceras `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy` y cookies `Secure` |
| Base de datos | El rol `django` es propio; sus tablas no quedan expuestas en la API pública de Supabase |
| Usuarios | No se borran: se desactivan y se cierran sus sesiones; siempre queda un administrador activo |

## 2. Lo que se corrigió

| # | Riesgo encontrado | Corrección |
|---|---|---|
| 1 | **La sesión no caducaba nunca.** El token de la API valía para siempre: en un equipo compartido la sesión quedaba abierta indefinidamente | El token caduca a las **16 horas** (`pos/authentication.py`). Al caducar, la API responde 401 y la página regresa al inicio de sesión con el aviso "Tu sesión expiró" |
| 2 | **`/admin/login/` sin límite de intentos.** Se podían probar contraseñas sin parar en el panel de Django, saltándose el límite del login de la API | El panel usa el mismo límite: 5 intentos fallidos por IP por minuto (`admin_login` en `pos/views.py`). La sesión del panel dura máximo 8 horas y se cierra al cerrar el navegador |
| 3 | **Inyección de HTML con comillas (XSS).** `escapeHtml()` no escapaba comillas; un nombre de producto como `Taco" onfocus="..."` podía ejecutar código dentro de atributos (`aria-label`) | `escapeHtml()` ahora escapa `"` y `'` (`js/ui.js`). Probado con ese nombre en todas las pantallas: no se ejecuta nada |
| 4 | **La página principal sin cabeceras de seguridad.** Se podía meter dentro de un iframe de otro sitio (clickjacking) y no tenía política de contenido | `vercel.json` agrega `Content-Security-Policy` (solo scripts, estilos y conexiones del mismo sitio; sin plugins; sin iframes), `X-Frame-Options`, `nosniff`, `Referrer-Policy` y `Permissions-Policy` (sin cámara, micrófono ni ubicación) |
| 5 | **Imagen de producto sin validar.** Se aceptaba cualquier texto, de cualquier tamaño (por ejemplo `javascript:...`, SVG con código o varios MB) | El servidor solo acepta rutas a imágenes del menú, fotos PNG/JPG/GIF/WEBP en base64 de máximo 500 KB, o direcciones `https://` |
| 6 | **Fórmulas en los CSV (CSV injection).** Un nombre que empiece con `=`, `+`, `-` o `@` se ejecutaba como fórmula al abrir el CSV en Excel | Esos textos se exportan con un apóstrofo al inicio para que Excel los trate como texto (`pos/exports.py`) |
| 7 | HSTS de la API sin subdominios | `SECURE_HSTS_INCLUDE_SUBDOMAINS` y `SECURE_HSTS_PRELOAD`; `manage.py check --deploy` queda sin advertencias |

Pruebas: 10 nuevas en `pos/tests/test_security.py` (228 en total, todas pasan) y
una prueba en navegador con la misma política de contenido de producción.

## 3. Pendientes y recomendaciones

- **Contraseñas fuertes y distintas** para cada usuario (el cajero y el
  administrador no deben compartir contraseña). Cada quien debe tener su propio
  usuario, incluida csvela.
- **Copias de seguridad:** el plan gratis de Supabase tiene respaldos muy
  limitados; conviene sacar una copia propia de la base cada semana con
  `pg_dump` y guardarla fuera del proyecto.
- **Supabase ▸ Advisors ▸ Security Advisor:** revisarlo de vez en cuando; debe
  salir sin alertas.
- **`unsafe-inline` en la política de contenido:** el HTML usa `onclick="..."`
  en muchos botones, por eso la política todavía permite scripts en línea. Para
  quitarlo habría que mover esos eventos a `addEventListener` en los archivos JS.
- **El token se guarda en `localStorage`.** Con las correcciones 3 y 4 el riesgo
  es bajo; moverlo a una cookie `HttpOnly` sería un cambio grande del frontend.
- **Dependencias:** mantener Django en la última versión 5.2.x (Vercel la instala
  sola en cada publicación por el rango de `requirements.txt`).
