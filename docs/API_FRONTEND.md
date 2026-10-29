<!-- Referencia de la API de Django para conectar el frontend (Fase 7, Proyecto 1). -->

# API del POS para el frontend

Guía para conectar `FronEnd/js/` con el backend en la Fase 7. Todo lo que aparece
aquí ya existe y tiene pruebas. Si al conectar algo falta un dato, un filtro o un
campo, avisa al equipo del backend en lugar de calcularlo en el navegador.

## 1. Lo básico

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

## 2. Sesión — `/api/auth/` (ya conectado)

| Método y ruta | Quién | Envía | Responde |
|---|---|---|---|
| `POST /api/auth/login/` | público | `{username, password}` | `{token, user: {id, username, first_name, last_name, role}}` |
| `POST /api/auth/logout/` | sesión | — | `204` |
| `GET /api/auth/me/` | sesión | — | `{id, username, first_name, last_name, role}` |

## 3. Catálogo — `products.js`, `categories.js`

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

## 4. Configuración — `settings.js`

| Método y ruta | Quién | Envía / responde |
|---|---|---|
| `GET /api/configuracion/` | ambos | `{tax_rate: "0.0800", exchange_rate: "19.5000", updated_by, updated_at}` |
| `PATCH /api/configuracion/` | admin | `{tax_rate}` y/o `{exchange_rate}` |

`tax_rate` es fracción: `0.08` = 8 %. El servidor calcula IVA y totales con estos valores.

## 5. Caja — `cashbox.js`

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

## 6. Ventas e historial — `cart.js`, `sales.js`

| Método y ruta | Quién | Notas |
|---|---|---|
| `POST /api/ventas/` | ambos | Registrar venta (ver abajo) |
| `GET /api/ventas/` | ambos | Historial. **El cajero solo ve la jornada de hoy** |
| `GET /api/ventas/{id}/` | ambos | Detalle |
| `GET /api/ventas/resumen/` | ambos | `{total_sales, transactions, items, average_sale}` sin canceladas |
| `GET /api/ventas/exportar/` | ambos | Descarga CSV con los mismos filtros |
| `GET /api/ventas/verificar/` | admin | Revisa que los montos cuadren |
| `POST /api/ventas/{id}/cancelar/` | admin | `{reason}` opcional. Regresa el stock. Solo ventas de la jornada abierta |

Filtros de `GET /api/ventas/`, `resumen/` y `exportar/` (para los filtros de la
pantalla Ventas, hoy sin conectar):
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

## 7. Panel — `dashboard.js` (solo admin)

Todos aceptan `?desde=` y `?hasta=` y no cuentan ventas canceladas.

| Ruta | Responde |
|---|---|
| `GET /api/reportes/resumen/` | `{desde, hasta, total_sales, tax_total, transactions, items, average_sale}` |
| `GET /api/reportes/ventas-por-dia/` | `{desde, hasta, days: [{date, total, transactions}]}`; sin rango = últimos 7 días; días sin ventas en `"0.00"` |
| `GET /api/reportes/productos-top/?limite=5` | `[{product_name, units, total}]` |
| `GET /api/reportes/por-categoria/` | `[{category, units, total}]` |
| `GET /api/inventario/alertas/` | Ver sección 8 |

## 8. Almacén — `warehouse.js` (solo admin)

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

> Insumos y alertas no estaban en el diseño original del Proyecto 1; queda por
> decidir si se conectan en esta fase.

## 9. Usuarios — `users.js` (ya conectado)

`/api/usuarios/` (admin): listar, crear `{username, first_name, last_name, role, password}`,
`PATCH` `{first_name, last_name, role, is_active}` y
`POST /api/usuarios/{id}/restablecer-contrasena/` `{password}`. Sin borrar: se desactiva.

## 10. Probar la API sin el frontend

Con Django en local y `DJANGO_DEBUG=True`, entra a `http://127.0.0.1:8000/admin/`
como admin y luego abre cualquier ruta (por ejemplo
`http://127.0.0.1:8000/api/productos/`): DRF muestra la respuesta y un formulario
para probar `POST`/`PATCH`. Más ejemplos en la sección 8 de `POS/GUIA_PRUEBAS_LOCAL.txt`.
