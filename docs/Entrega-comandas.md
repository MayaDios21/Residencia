<!-- Nota de entrega de las comandas (Proyecto 2) para quien conecta Supabase. -->

# Entrega: comandas y rol mesero

**Para:** Diego · **De:** csvela · **Actualizada:** 2026-11-12

Las comandas ya están programadas y probadas en local. Para publicarlas falta
migrar Supabase y subir el código a `main`. **Esas dos cosas te tocan a ti**,
porque solo tú tienes acceso a Supabase. No hay ramas: el trabajo te llega en un
archivo.

## Cómo va a quedar todo

1. **csvela te manda** el archivo `comandas-para-diego.bundle` (un paquete de
   git con tres commits: migraciones, script y código de las comandas).
2. **Tú lo cargas** en tu `main` local con un comando (parte B).
3. **Tú migras Supabase** con el script `POS/migrar-comandas.ps1`.
4. **Tú publicas** con `git push origin main`. Como la base ya está migrada,
   Vercel publica las comandas sin romper nada.

**Importante: no hagas el push antes de migrar.** Vercel publica solo cada push
a `main`, y el código nuevo necesita las tablas nuevas; sin ellas se rompen las
ventas del sistema real.

Se probó que el sistema publicado hoy funciona igual sobre una base ya migrada
(159 pruebas del código actual pasan con las migraciones), así que migrar no
rompe nada aunque pase tiempo entre la parte C y la D.

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

### Parte B. Cargar el paquete

1. Guarda `comandas-para-diego.bundle` en tu computadora, por ejemplo en
   `C:\Users\dmaya\Downloads`.

2. Abre **PowerShell** y entra a la carpeta del repositorio (la que tiene `POS`
   y `docs`):

   ```powershell
   cd C:\Users\dmaya\Residencia
   ```

3. Ponte en `main` al día y carga el paquete:

   ```powershell
   git switch main
   git pull origin main
   git pull C:\Users\dmaya\Downloads\comandas-para-diego.bundle main
   ```

4. Revisa que llegaron los tres commits:

   ```powershell
   git log --oneline -4
   ```

   Deben verse, de arriba hacia abajo: *Instrucciones de entrega por archivo*,
   *Comandas por mesa y rol mesero*, *Migraciones de comandas y script para
   migrar Supabase* y *Doc de cambios*.

### Parte C. Migrar Supabase con el script

1. En la misma carpeta, corre el script:

   ```powershell
   powershell -ExecutionPolicy Bypass -File .\POS\migrar-comandas.ps1
   ```

   Va a hacer esto, y **se detiene si algo falla**:

   | Lo que verás | Qué hacer |
   |---|---|
   | `==> 1/3 Traer lo último de main` | Nada, es automático |
   | `==> 2/3 Pruebas...` y al final `Ran 218 tests` y `OK` | Esperar unos 2 minutos |
   | `==> 3/3 Migrar Supabase` y `DATABASE_URL:` | Pegar la cadena de la parte A (no se ve al pegarla) y Enter |
   | `[X] 0007_waiter_role` y `[X] 0008_orders_and_tables` | Confirmar que las dos tienen `[X]` |
   | `Listo: Supabase migrado` | Pasar a la parte D |

   Si antes quieres revisar que todo está bien sin tocar Supabase, agrega
   `-SoloProbar` al final del comando.

### Parte D. Publicar

Solo después de ver `Listo: Supabase migrado`:

```powershell
git push origin main
```

Vercel publica en 1 o 2 minutos. Luego, en `https://pos-el-compita.vercel.app`:

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
| Parte B, error al cargar el paquete | La ruta del archivo está mal o no estás en `main` | Revisar la ruta y correr `git switch main` |
| Paso 1/3 "No llegó la migración" | El paquete no se cargó | Repetir la parte B y revisar el `git log` |
| Paso 2/3, pruebas en rojo | Algo distinto en tu entorno | Mandar captura; Supabase no se tocó |
| Paso 3/3, error al migrar | La cadena está mal o Supabase está pausado | Revisar la cadena; si Supabase está pausado, reactivarlo desde su panel |

En cualquier error el script se puede volver a correr. La migración tampoco se
duplica si se corre dos veces.

## Si algo sale mal después de publicar

Si después del push algo falla en el sistema publicado, se puede regresar a la
versión anterior desde Vercel ▸ **Deployments** ▸ el despliegue anterior ▸
**⋯** ▸ **Promote to Production**. La base migrada no estorba: el código
anterior funciona con ella (probado).

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
