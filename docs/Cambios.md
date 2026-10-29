<!-- Cambios del frontend en la Fase 7 y referencia de la API (Proyecto 1). -->

# Cambios del frontend

Resumen de lo que cambió en `FronEnd/` durante la **Fase 7** (2026-10-29), cuando
todas las pantallas se conectaron al servidor. Desde entonces los datos viven en
la base de datos y se ven igual en la computadora y en el celular.

- **Parte 1:** lo que cambió a la vista, pantalla por pantalla.
- **Parte 2:** la referencia de la API, para seguir modificando el frontend.

> Antes de editar `FronEnd/` haz `git pull`: cambiaron `index.html`,
> `css/styles.css` y casi todos los archivos de `js/`.

## Parte 1. Cambios visuales

### Reglas generales

- **Ya no hay datos en el navegador.** Productos, categorías, ventas, caja,
  configuración e insumos se piden al servidor al entrar. `localStorage` solo
  guarda el token, la sesión, la pestaña abierta y el carrito.
- **Errores en avisos (toasts).** Si algo falla aparece un aviso abajo con el
  mensaje del servidor, por ejemplo `No se pudo agregar el producto: ...`.
- **Ventana propia para pedir datos.** Ya no sale el `prompt()` del navegador.
  Se usa un modal con el mismo estilo que los de confirmar y guardar
  (`#input-modal` en `index.html`, `openInputModal()` en `js/ui.js`). Tiene
  título, campo, mensaje de error en rojo, **Cancelar** y **Guardar**, y se
  cierra con Esc o al hacer clic fuera. Se usa en: Nueva categoría, Renombrar
  categoría, Cambiar stock mínimo y Cancelar venta (este con el botón en rojo).
- **Nada se borra si tiene historial.** Si un producto o insumo ya tiene
  movimientos, al darle **Eliminar** sale un modal que ofrece **desactivarlo**.

### Login

- El texto bajo la contraseña ahora dice: *"Entra con el usuario y la contraseña
  que te dio el administrador."* (antes: "Acceso seguro mediante el servidor
  local de Django").

### Venta y carrito

- Los productos **desactivados** no aparecen para vender, y los contadores de
  las pestañas de categoría ya no los cuentan.
- Si un producto del carrito guardado ya no existe o se desactivó, se quita solo
  y sale el aviso *"Se quitaron del carrito productos que ya no están
  disponibles."*
- Al cobrar sale *"Venta #N registrada por $X MXN"* con el número que da el
  servidor. Sin internet sale *"Sin conexión con el servidor: la venta NO se
  registró. Intenta de nuevo."* y el carrito se queda como estaba.

### Productos y categorías (administrador)

- En la lista de productos, uno desactivado muestra la etiqueta
  **"Desactivado"** y su botón cambia de **Eliminar** a **Activar**.
- Nueva categoría (desde la pestaña **+ Nueva categoría** de Venta) y Editar
  categoría usan el modal propio en lugar del `prompt()`.

### Ventas

- **"Borrar historial" se quitó.** Las ventas ya no se borran.
- Cada venta de la jornada abierta tiene un botón rojo **Cancelar** (solo el
  administrador). Pide el motivo en el modal propio.
- Una venta cancelada muestra el estado **Cancelada** (rojo, clase
  `.sale-status.cancelled`), su total **tachado** (`.sale-item.is-cancelled`) y
  la línea *"Cancelada por usuario: motivo"*.
- Cada venta muestra también **quién la cobró**, junto a la fecha y hora.
- El botón **Verificar** (`#verify-sales-btn`) solo lo ve el administrador.
- El buscador responde al escribir, pegar o borrar (`oninput` en lugar de
  `onkeyup`).

### Caja

- El cajero abre y cierra caja. El administrador solo ve el **Historial de
  cierres** (`#cashbox-history`), que el cajero ya no ve.
- **"Limpiar historial" se quitó.** Los cierres no se borran.
- La última columna de la tabla de cierres ahora se llama **"Cerró"** y dice
  quién cerró la caja (antes era una columna de acciones sin título).
- Si quedó abierta la caja de un día anterior, el subtítulo avisa que hay que
  cerrarla antes de abrir la de hoy.

### Panel (administrador)

- **Alertas de reabastecimiento:** debajo de cada nombre sale el nivel
  (**Crítico** en rojo, **Bajo** en naranja, Sin registrar, Bien) y cuánto pedir,
  por ejemplo *"Crítico · pedir 6"* (clases `.dashboard-stock-detail.level-*`).
  A la derecha queda `stock / mínimo`.
- **Ventas recientes:** muestra las 5 más recientes de los últimos 30 días; las
  canceladas lo indican junto a los artículos.

### Almacén (administrador)

- Aparecen los **insumos** (vasos, servilletas, etc.) junto a los productos con
  inventario.
- Botón nuevo **Mínimo** en cada fila para cambiar el stock mínimo con el modal
  propio.
- Los insumos desactivados muestran **Activar** en lugar de **Eliminar**.
- Los botones de cada fila se **apilan** (`.warehouse-actions`) para que
  **Eliminar** no se corte en pantallas angostas.

### Configuración (administrador)

- **El panel "Mantenimiento" (Reiniciar sistema) se quitó.** Ya no hay datos
  locales que reiniciar.
- IVA y tipo de cambio se guardan en el servidor y aplican en todos los
  dispositivos.

### CSS nuevo en `styles.css`

| Clase | Para qué |
|---|---|
| `.warehouse-actions` | Apilar los botones de la tabla del almacén |
| `.sale-status.cancelled` | Etiqueta roja de venta cancelada |
| `.sale-item.is-cancelled .sale-total` | Total tachado y gris |
| `.dashboard-stock-detail` (`.level-critico`, `.level-bajo`) | Nivel y cuánto pedir en las alertas |
| `.input-modal-field`, `.input-modal-error` | Campo y error del modal propio |

## Parte 2. Referencia de la API

Todo lo que aparece aquí ya existe y tiene pruebas. Si al cambiar algo falta un
dato, un filtro o un campo, avisa al equipo del backend en lugar de calcularlo en
el navegador.

### 1. Lo básico

- **Dirección:** `API_URL` en `js/api.js`. En local apunta a
  `http://<host>:8000/api`; publicado, a `/api` (mismo dominio).
- **Llamadas:** usa `apiRequest(path, options)` de `api.js`. Ya manda el token
  (`Authorization: Token <token>`) y el `Content-Type: application/json`.
- **Errores:** `apiRequest` lanza un `Error` con el mensaje del servidor y la
  propiedad `status`. Los mensajes ya vienen en español y se pueden mostrar tal cual.
  - `400`: datos inválidos. Formato `{"campo": ["mensaje"]}` → usa `getFirstFieldError()`.
  - `401`: sin sesión o el token ya no vale → regresar al login.
  - `403`: el rol no tiene permiso.
  - `409`: regla del negocio (sin caja abierta, sin stock, etc.) → `{"detail": "mensaje"}`.
  - `429`: demasiados intentos de login.
- **Dinero:** los montos llegan como **texto** (`"30.00"`) para no perder
  decimales. Conviértelos con `Number(...)` solo para mostrarlos.
- **Fechas:** los filtros usan `AAAA-MM-DD` y se refieren a la **jornada de caja**
  (`business_date`), no a la hora exacta de la venta.
- **IDs:** usa siempre los del servidor; ya no se generan IDs en el navegador
  (`nextProductId`, `nextCategoryId`, etc. desaparecen).
- **Roles:** `admin` y `cashier` (en la Fase 8 se agrega `waiter`).

### 2. Sesión — `/api/auth/` (ya conectado)

| Método y ruta | Quién | Envía | Responde |
|---|---|---|---|
| `POST /api/auth/login/` | público | `{username, password}` | `{token, user: {id, username, first_name, last_name, role}}` |
| `POST /api/auth/logout/` | sesión | — | `204` |
| `GET /api/auth/me/` | sesión | — | `{id, username, first_name, last_name, role}` |

### 3. Catálogo — `products.js`, `categories.js`

| Método y ruta | Quién | Notas |
|---|---|---|
| `GET /api/categorias/` | ambos | Lista ordenada por nombre |
| `POST /api/categorias/` | admin | `{name, color}`; `color` en `#rrggbb` |
| `PATCH /api/categorias/{id}/` | admin | Cualquier campo, incluido `is_active` |
| `DELETE /api/categorias/{id}/` | admin | Sus productos quedan sin categoría |
| `GET /api/productos/` | ambos | Lista ordenada por nombre |
| `POST /api/productos/` | admin | Ver campos abajo |
| `PATCH /api/productos/{id}/` | admin | `stock` no se puede cambiar aquí |
| `DELETE /api/productos/{id}/` | admin | `409` si tiene historial de inventario: desactivarlo (`is_active: false`) |

Categoría:
```json
{ "id": 1, "name": "Tacos", "color": "#d35400", "is_active": true }
```

Producto:
```json
{
  "id": 1, "name": "Taco de Birria", "category": 1, "category_name": "Tacos",
  "price": "30.00", "image": "../Public/assets/imagenes/Taco Birria.jpg",
  "is_active": true, "track_inventory": false, "stock": null, "minimum_stock": 5
}
```
- Se envía `category` (el id), no el nombre. `category_name` es solo de lectura.
- `image` es texto: una ruta como las de `state.js` o un `data:image/...;base64`.
- `stock: null` = "sin registrar" (nunca se ha contado).
- El nombre no se puede repetir dentro de la misma categoría.

**Menú inicial:** `python manage.py cargar_menu` crea en la base las categorías y
productos de `defaultCategories`/`defaultProducts` con las mismas imágenes. No
duplica ni pisa cambios si se corre otra vez. Después de esto ya no hacen falta
los datos por defecto de `state.js`.

### 4. Configuración — `settings.js`

| Método y ruta | Quién | Envía / responde |
|---|---|---|
| `GET /api/configuracion/` | ambos | `{tax_rate: "0.0800", exchange_rate: "19.5000", updated_by, updated_at}` |
| `PATCH /api/configuracion/` | admin | `{tax_rate}` y/o `{exchange_rate}` |

`tax_rate` es fracción: `0.08` = 8 %. El servidor calcula IVA y totales con estos valores.

### 5. Caja — `cashbox.js`

| Método y ruta | Quién | Notas |
|---|---|---|
| `GET /api/caja/actual/` | ambos | Estado de hoy (ver abajo). Sustituye a `shouldOpenCashBoxForToday()` |
| `POST /api/caja/abrir/` | ambos | `{opening_amount: 500}` (mayor que 0). `409` si ya hay caja hoy o quedó abierta una de otro día |
| `POST /api/caja/cerrar/` | ambos | `{counted_cash, minor_expenses, retained_fund}` (todos opcionales). El servidor calcula el cierre y cierra las ventas del día |
| `GET /api/caja/cierres/` | admin | Lista de cierres |
| `GET /api/caja/cierres/exportar/` | admin | Descarga CSV |

`GET /api/caja/actual/`:
```json
{
  "status": "sin_abrir | abierta | cerrada",
  "session": { ...jornada o null },
  "sales_today": { "count": 3, "total": "180.00" },
  "pending_session": { ...jornada de un día anterior que quedó abierta, o null }
}
```
Si `pending_session` no es `null`, hay que cerrarla antes de abrir la de hoy.

Jornada (`session`, respuesta de abrir/cerrar):
```json
{
  "id": 1, "business_date": "2026-10-28", "status": "abierta",
  "opening_amount": "500.00", "opened_by": "cajero", "opened_at": "...",
  "sales_count": 3, "sales_total": "180.00", "minor_expenses": "0.00",
  "expected_cash": null, "counted_cash": null, "difference": null,
  "retained_fund": null, "closed_by": null, "closed_at": null
}
```
Esperado al cerrar = fondo inicial + ventas del día − gastos menores.

### 6. Ventas e historial — `cart.js`, `sales.js`

| Método y ruta | Quién | Notas |
|---|---|---|
| `POST /api/ventas/` | ambos | Registrar venta (ver abajo) |
| `GET /api/ventas/` | ambos | Historial. **El cajero solo ve la jornada de hoy** |
| `GET /api/ventas/{id}/` | ambos | Detalle |
| `GET /api/ventas/resumen/` | ambos | `{total_sales, transactions, items, average_sale}` sin canceladas |
| `GET /api/ventas/exportar/` | ambos | Descarga CSV con los mismos filtros |
| `GET /api/ventas/verificar/` | admin | Revisa que los montos cuadren |
| `POST /api/ventas/{id}/cancelar/` | admin | `{reason}` opcional. Regresa el stock. Solo ventas de la jornada abierta |

Filtros de `GET /api/ventas/`, `resumen/` y `exportar/` (los usa la
pantalla Ventas):
- `?desde=AAAA-MM-DD&hasta=AAAA-MM-DD`
- `?q=` número de venta (acepta `#12`) o nombre de producto
- `?estado=abierta|cerrada|cancelada`

Registrar venta — envía solo productos y cantidades; **precios, IVA y total los
calcula el servidor**:
```json
{ "items": [ { "product_id": 1, "quantity": 2 }, { "product_id": 7, "quantity": 1 } ],
  "payment": "Efectivo" }
```
Responde `201` con la venta:
```json
{
  "id": 12, "created_at": "...", "business_date": "2026-10-28", "cashier": "cajero",
  "status": "abierta", "payment": "Efectivo", "tax_rate": "0.0800",
  "exchange_rate": "19.5000", "subtotal": "80.00", "tax": "6.40", "total": "86.40",
  "items_count": 3,
  "items": [
    { "product_id": 1, "product_name": "Taco de Birria", "unit_price": "30.00",
      "quantity": 2, "line_total": "60.00", "stock_remaining": null },
    { "product_id": 7, "product_name": "Agua Grande", "unit_price": "20.00",
      "quantity": 1, "line_total": "20.00", "stock_remaining": 11 }
  ],
  "cancelled_by": null, "cancelled_at": null, "cancel_reason": ""
}
```
- `stock_remaining` solo viene al registrar la venta; sirve para actualizar el
  stock en pantalla sin volver a pedir los productos.
- Errores: `409` sin caja abierta; `409` sin stock →
  `{detail, product_id, available}`; `400` producto inexistente o inactivo.
- El único método de pago es `"Efectivo"`.

### 7. Panel — `dashboard.js` (solo admin)

Todos aceptan `?desde=` y `?hasta=` y no cuentan ventas canceladas.

| Ruta | Responde |
|---|---|
| `GET /api/reportes/resumen/` | `{desde, hasta, total_sales, tax_total, transactions, items, average_sale}` |
| `GET /api/reportes/ventas-por-dia/` | `{desde, hasta, days: [{date, total, transactions}]}`; sin rango = últimos 7 días; días sin ventas en `"0.00"` |
| `GET /api/reportes/productos-top/?limite=5` | `[{product_name, units, total}]` |
| `GET /api/reportes/por-categoria/` | `[{category, units, total}]` |
| `GET /api/inventario/alertas/` | Ver sección 8 |

### 8. Almacén — `warehouse.js` (solo admin)

| Método y ruta | Notas |
|---|---|
| `GET /api/inventario/movimientos/` | Historial; filtros `?producto=<id>` o `?insumo=<id>` |
| `POST /api/inventario/movimientos/` | `{product_id \| supply_id, type, quantity, reason}` |
| `/api/inventario/insumos/` | CRUD de insumos `{id, name, stock, minimum_stock, is_active}`; `DELETE` da `409` si tiene historial |
| `GET /api/inventario/alertas/` | Alertas de reabastecimiento |

Movimientos:
- `type`: `entrada` (suma), `salida` (resta), `ajuste` (**fija** el stock al valor; acepta 0).
- Se manda `product_id` **o** `supply_id`, no los dos. El producto debe tener
  `track_inventory: true`.
- Responde el movimiento con `stock_remaining`. `409` si el stock quedaría negativo.
- Las ventas y cancelaciones generan sus propios movimientos (`venta`, `cancelacion`); no se registran a mano.

Alertas (`?todos=true` incluye también los que están bien):
```json
{
  "window_days": 14, "lead_days": 2, "since": "2026-10-15",
  "items": [
    { "kind": "producto", "id": 7, "name": "Agua Grande", "stock": 3,
      "minimum_stock": 5, "consumed": 28, "daily_average": 2.0,
      "coverage_days": 1.5, "suggested_quantity": 6, "level": "critico" }
  ]
}
```
`level`: `critico`, `bajo`, `sin_registrar` u `ok`. Vienen ordenados por urgencia.

> Insumos y alertas no estaban en el diseño original del Proyecto 1; el autor
> decidió incluirlos (2026-10-29) y ya están conectados en `warehouse.js` y
> `dashboard.js`.

### 9. Usuarios — `users.js` (ya conectado)

`/api/usuarios/` (admin): listar, crear `{username, first_name, last_name, role, password}`,
`PATCH` `{first_name, last_name, role, is_active}` y
`POST /api/usuarios/{id}/restablecer-contrasena/` `{password}`. Sin borrar: se desactiva.

### 10. Probar la API sin el frontend

Con Django en local y `DJANGO_DEBUG=True`, entra a `http://127.0.0.1:8000/admin/`
como admin y luego abre cualquier ruta (por ejemplo
`http://127.0.0.1:8000/api/productos/`): DRF muestra la respuesta y un formulario
para probar `POST`/`PATCH`. Más ejemplos en la sección 8 de `POS/GUIA_PRUEBAS_LOCAL.txt`.
