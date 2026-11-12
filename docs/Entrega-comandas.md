<!-- Nota de entrega de las comandas (Proyecto 2) para quien conecta Supabase. -->

# Entrega: comandas y rol mesero

**Para:** Diego · **De:** csvela · **Actualizada:** 2026-11-12

Las comandas ya están programadas y probadas en local. Para publicarlas solo
falta que Supabase tenga las tablas nuevas. **Tu parte es solo esa: migrar
Supabase.** No hay ramas: todo está en `main`.

## Cómo va a quedar todo

1. **Ya está en `main`:** las dos migraciones (`0007` y `0008`) y el script
   `POS/migrar-comandas.ps1`. Sin el código de las comandas, el sistema
   publicado funciona exactamente igual que antes.
2. **Tú:** migras Supabase con el script (abajo, paso a paso).
3. **csvela:** cuando le avises, sube el código de las comandas a `main` y Vercel
   las publica.

Se probó que el sistema publicado funciona igual sobre una base ya migrada
(login, caja, ventas, cancelaciones, catálogo, usuarios, panel y cierre de
caja), así que la migración no rompe nada aunque pase tiempo antes del paso 3.

## Paso a paso

Calcula unos 15 minutos y hazlo **en un horario sin ventas**: en la parte A el
sistema publicado se queda sin base unos minutos.

### Parte A. Sacar la cadena de conexión de Supabase

La contraseña del usuario `django` de Supabase no está guardada en ningún lado
(sección 13 de `POS/GUIA_PRUEBAS_LOCAL.txt`), así que se pone una nueva. Haz
los tres pasos seguidos: entre el A1 y el A3 el sistema publicado no puede
entrar a la base.

1. **Supabase** ▸ proyecto `pos-el-compita` ▸ **SQL Editor**. Ejecuta esto con
   una contraseña nueva, **solo letras y números**:

   ```sql
   alter role django with password 'PonUnaNueva2026';
   ```

2. **Arma la cadena** cambiando solo la contraseña. Guárdala en un lugar seguro
   mientras terminas; no la subas al repositorio ni la mandes por chat:

   ```text
   postgresql://django.gerfgmsigjpgxwokblrh:PonUnaNueva2026@aws-0-us-west-1.pooler.supabase.com:6543/postgres?sslmode=require
   ```

3. **Vercel** ▸ proyecto `pos-el-compita` ▸ **Settings** ▸ **Environment
   Variables** ▸ `DATABASE_URL` ▸ **Edit**. Pega la cadena y guarda. Luego
   **Deployments** ▸ el último ▸ **⋯** ▸ **Redeploy**. Espera a que diga
   **Ready** y entra a `https://pos-el-compita.vercel.app`: si el login
   funciona, la cadena es correcta.

### Parte B. Correr el script

1. Abre **PowerShell** y entra a la carpeta del repositorio (la que tiene `POS`
   y `docs`):

   ```powershell
   cd C:\Users\dmaya\Residencia
   ```

2. Corre el script (él mismo hace el `git pull` de `main`):

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\POS\migrar-comandas.ps1
   ```

   Va a hacer esto, y **se detiene si algo falla**:

   | Lo que verás | Qué hacer |
   |---|---|
   | `==> 1/3 Traer lo último de main` | Nada, es automático |
   | `==> 2/3 Pruebas...` y al final `OK` | Esperar unos 2 minutos |
   | `==> 3/3 Migrar Supabase` y `DATABASE_URL:` | Pegar la cadena de la parte A (no se ve al pegarla) y Enter |
   | `[X] 0007_waiter_role` y `[X] 0008_orders_and_tables` | Confirmar que las dos tienen `[X]` |
   | `Listo: Supabase migrado` | Pasar a la parte C |

   Si antes quieres revisar que todo está bien sin tocar Supabase, agrega
   `-SoloProbar` al final del comando.

### Parte C. Avisar

Avísale a csvela: *"ya migré Supabase"*. Ella sube el código de las comandas y
en 2 minutos están publicadas. Luego, en `https://pos-el-compita.vercel.app`:

1. **Admin:** Configuración ▸ **Mesas**: pon cuántas mesas hay.
2. **Admin:** Usuarios ▸ crea un usuario con rol **Mesero**.
3. **Cajero:** abre caja; debe aparecer la pestaña **Mesas**.
4. **Mesero** (en un celular): abre una mesa, toca productos y "Mandar".
5. **Cajero:** abre esa mesa y "Cobrar". La venta sale en Ventas.
6. **Con dos celulares**, abran la misma mesa libre al mismo tiempo: el segundo
   debe recibir el aviso de mesa ocupada. Esto solo se puede probar aquí: en
   local se usa SQLite, que ignora los bloqueos.

### Si algo falla

| Dónde falla | Qué pasó | Qué hacer |
|---|---|---|
| Parte A, el login ya no funciona | Vercel no tiene la cadena nueva o falta el Redeploy | Revisar `DATABASE_URL` en Vercel, guardar y hacer Redeploy |
| Paso 1/3 "cambios sin guardar" | Tienes archivos modificados en tu copia | `git stash` y volver a correr el script |
| Paso 1/3 "No llegó la migración" | El pull no trajo los archivos | Correr `git pull origin main` y revisar el mensaje |
| Paso 2/3, pruebas en rojo | Algo distinto en tu entorno | Mandar captura; Supabase no se tocó |
| Paso 3/3, error al migrar | La cadena está mal o Supabase está pausado | Revisar la cadena; si Supabase está pausado, reactivarlo desde su panel |

En cualquier error el script se puede volver a correr. La migración tampoco se
duplica si se corre dos veces.

## ⚠️ Mientras tanto: no correr `makemigrations`

Hasta que csvela suba el código, `main` tiene las migraciones pero todavía no
los modelos de las comandas. Si alguien corre `manage.py makemigrations` en ese
rato, Django crearía una migración que **borra** las tablas nuevas. Hay que
esperar a que esté el código completo.

## Qué cambia en el backend con las comandas

| Archivo | Cambio |
|---|---|
| `pos/migrations/0007_waiter_role.py` | Rol `waiter` (Mesero) en `UserProfile` |
| `pos/migrations/0008_orders_and_tables.py` | `SystemSettings.table_count` (default 10) y tablas `Order`, `OrderItem`, `OrderEvent`, con restricción única parcial: una comanda abierta por mesa |
| `pos/permissions.py` | **`IsPosUser` ya no acepta cualquier rol**: solo cajero y admin. Nuevo `IsOrderUser` (mesero, cajero, admin). Antes `IsPosUser = IsCatalogUser` le habría abierto caja y ventas al mesero |
| `pos/services.py` | `create_sale(..., session=None)`: con `session`, la venta va a esa jornada (cobro de comandas abiertas antes de medianoche). `close_cash_session` rechaza con 409 si hay comandas abiertas |
| `pos/order_services.py`, `pos/order_views.py` | Lógica y API de `/api/comandas/` |
| `pos/serializers.py` | `numero_mesas` en configuración y serializers de comandas |

Con el código completo pasan **218 pruebas** (159 anteriores + 59 nuevas).

- Diseño: `docs/superpowers/specs/2026-10-28-comandas-mesero-design.md`
- Plan: `docs/superpowers/plans/2026-11-02-comandas-mesero.md`
- Cambios de pantallas y API: `docs/Cambios.md`, Parte 3
- Cómo probar en local: `POS/GUIA_PRUEBAS_LOCAL.txt`, sección 15

## Pendientes menores (no bloquean)

- `GET /api/comandas/` sin `?estado` no está paginado; el frontend no lo usa.
- La cuadrícula llama `SystemSettings.load()` una vez por mesa ocupada.
- Al pedir no se aparta stock: si dos mesas piden el último refresco, la segunda
  falla al cobrar (así está en el diseño).
