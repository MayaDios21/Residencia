# Comandas y rol mesero: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un mesero levante comandas por mesa desde su celular, sin cerrar la venta, y que el cajero las cobre desde la caja.

**Architecture:** Modelos nuevos `Order`, `OrderItem` y `OrderEvent`, con la lógica en `pos/order_services.py` y la API en `pos/order_views.py` bajo `/api/comandas/`. Cobrar reusa `create_sale()` dentro de una transacción. El frontend agrega `js/orders.js` con una sola cuadrícula y vista de comanda para mesero y cajero.

**Tech Stack:** Django 5.2, Django REST Framework 3.16, SQLite en local, PostgreSQL (Supabase) publicado, JavaScript sin framework.

**Spec:** `docs/superpowers/specs/2026-10-28-comandas-mesero-design.md`

## Global Constraints

- **Sin commits ni push salvo que csvela lo pida en ese momento.** Cada tarea termina en un punto de control con los cambios en disco. Nunca agregar `Co-Authored-By`.
- Todo se prueba en local. No definir `DATABASE_URL` en ninguna terminal de este plan: apunta a la base real.
- Toda función nueva o modificada lleva documentación en español: JSDoc con `@param` y `@returns` en JS, docstring en Python. Las secciones nuevas de HTML llevan comentario.
- Rutas, campos de entrada y acciones de la API en español: `mesa`, `motivo`, `estado`, `numero_mesas`, `agregar/`, `quitar/`, `cobrar/`, `cancelar/`, `mesas/`. `items`, `product_id` y `quantity` igual que en `/ventas/`.
- `table_count`: por defecto 10, mínimo 1, máximo 100.
- Códigos: 409 regla de negocio con `{"detail": ...}`, 400 datos inválidos, 403 rol sin permiso.
- Controles táctiles de al menos `var(--tap)` y hover solo dentro de `@media (hover: hover) and (pointer: fine)`, como dice el encabezado de `styles.css`.
- Texto del usuario o del catálogo siempre con `escapeHtml()` antes de `innerHTML`.
- Comando de pruebas, desde `POS/BakcEnd` en bash:
  `DJANGO_SECRET_KEY=x DJANGO_DEBUG=True ../.venv/Scripts/python.exe manage.py test pos`

## Review Focus

1. **Doble toque en "Mandar"** con mala señal: la cocina no debe recibir el pedido duplicado. Tarea 6, verificación 3.
2. **Dos meseros en la misma mesa libre:** el segundo recibe 409 y no pierde lo que tenía en "Por mandar"; se manda con `agregar/`. Tarea 4 (`test_second_open_on_same_table_conflicts`) y tarea 6, verificación 4.
3. **La cuadrícula se actualiza mientras se arma un pedido:** "Por mandar" no se pierde ni se redibuja. Tarea 6, verificación 5.
4. **La comanda se cobra o cancela en otro dispositivo con la vista abierta:** el siguiente intento avisa con el mensaje del servidor y regresa a la cuadrícula. Tarea 3 (`test_add_to_charged_order_conflicts`) y tarea 6, verificación 6.
5. **Producto desactivado entre pedir y cobrar:** el cobro falla nombrando el producto, la comanda sigue abierta y al quitarlo ya se cobra. Tarea 3 (`test_charge_with_inactive_product_rolls_back`) y tarea 7, verificación 4.

---

## Archivos

| Archivo | Responsabilidad |
|---|---|
| `pos/models.py` (mod) | Rol `WAITER`, `SystemSettings.table_count`, `Order`, `OrderItem`, `OrderEvent` |
| `pos/permissions.py` (mod) | `HasAnyRole`, `IsPosUser`, `IsOrderUser` |
| `pos/services.py` (mod) | `create_sale(session=)`, regla de cierre de caja |
| `pos/order_services.py` (nuevo) | Abrir, agregar, quitar, cobrar, cancelar, resumen de mesas |
| `pos/order_views.py` (nuevo) | `OrderViewSet` |
| `pos/serializers.py`, `pos/operations_urls.py`, `pos/admin.py`, `pos/catalog_views.py` (mod) | Serializers, ruta, panel de Django, mensaje al borrar producto |
| `pos/tests/test_waiter_permissions.py`, `test_order_models.py`, `test_order_services.py`, `test_orders_api.py` (nuevos) | Pruebas |
| `FronEnd/js/orders.js` (nuevo) | Cuadrícula, comanda, "Por mandar", cobrar, cancelar |
| `FronEnd/js/api.js`, `navigation.js`, `session.js`, `users.js`, `settings.js`, `index.html`, `css/styles.css` (mod) | Conexión, navegación por rol y pantallas |
| `POS/GUIA_PRUEBAS_LOCAL.txt`, `docs/Cambios.md` (mod) | Documentación |

---

### Tarea 1: Rol mesero y corrección de permisos

**Files:**
- Modify: `POS/BakcEnd/pos/models.py`, `pos/permissions.py`, `pos/tests/helpers.py`
- Create: `POS/BakcEnd/pos/migrations/0007_waiter_role.py` (con `makemigrations`), `pos/tests/test_waiter_permissions.py`

**Interfaces:**
- Produces: `UserProfile.Role.WAITER = 'waiter'`; `IsPosUser` (cajero y admin); `IsOrderUser` (mesero, cajero y admin); `create_waiter(username='waiter')` en helpers.

- [ ] **Step 1: Escribir las pruebas que fallan** en `test_waiter_permissions.py`

```python
FORBIDDEN = [
    ('get', '/api/caja/actual/'), ('post', '/api/caja/abrir/'),
    ('get', '/api/ventas/'), ('post', '/api/ventas/'),
    ('get', '/api/configuracion/'), ('patch', '/api/configuracion/'),
    ('get', '/api/inventario/movimientos/'), ('get', '/api/inventario/alertas/'),
    ('get', '/api/reportes/resumen/'), ('get', '/api/usuarios/'),
    ('post', '/api/productos/'),
]

def test_waiter_is_forbidden_outside_orders(self):
    self.client.force_authenticate(self.waiter)
    for method, url in FORBIDDEN:
        response = getattr(self.client, method)(url, {}, format='json')
        self.assertEqual(response.status_code, 403, f'{method} {url}')

def test_waiter_can_read_menu(self):        # GET /api/productos/ y /api/categorias/ → 200
def test_cashier_keeps_cash_access(self):   # cajero, GET /api/caja/actual/ → 200
def test_waiter_login_returns_role(self):   # login sin rol → user.role == 'waiter'
def test_admin_can_create_waiter(self):     # POST /api/usuarios/ con role 'waiter' → 201
```

- [ ] **Step 2: Correr y confirmar el fallo:** `... manage.py test pos.tests.test_waiter_permissions`. Espera: `ImportError` de `create_waiter`.

- [ ] **Step 3: Implementar.** Agregar `WAITER` a `Role`. En `permissions.py`, crear `HasAnyRole(BasePermission)` con `allowed_roles = ()`; `IsPosUser` e `IsOrderUser` heredan de ella. `IsCatalogUser` no cambia. Quitar `IsPosUser = IsCatalogUser` y su comentario, y corregir el docstring del módulo. Correr `makemigrations pos -n waiter_role`.

- [ ] **Step 4: Correr todas las pruebas.** Espera: `OK`.

- [ ] **Step 5: Punto de control.** Sin commit.

---

### Tarea 2: Modelos y número de mesas

**Files:**
- Modify: `pos/models.py`, `pos/serializers.py` (`SystemSettingsSerializer`), `pos/admin.py`, `pos/catalog_views.py:37-49`, `pos/tests/test_settings.py`
- Create: `pos/migrations/0008_orders_and_tables.py`, `pos/tests/test_order_models.py`

**Interfaces:**
- Produces:
  - `SystemSettings.table_count`: `PositiveSmallIntegerField(default=10)` con validadores 1 a 100.
  - `Order`: `Status` con `OPEN='abierta'`, `CHARGED='cobrada'`, `CANCELLED='cancelada'`; `table_number`, `status`, `opened_by` (FK `PROTECT`, `related_name='+'`), `opened_at`, `cash_session` (FK `PROTECT`, `related_name='orders'`), `sale` (`OneToOneField(Sale, PROTECT, null=True, blank=True, related_name='order')`), `closed_at`, `cancelled_by`, `cancel_reason`. Restricción `unique_open_order_per_table`.
  - `OrderItem`: `order` (`CASCADE`, `related_name='items'`), `product` (`PROTECT`, `related_name='order_items'`), `quantity`. Restricción única `(order, product)`.
  - `OrderEvent`: `Action` con `ADD='agregar'`, `REMOVE='quitar'`; `order` (`CASCADE`, `related_name='events'`), `user` (`PROTECT`), `action`, `product` (`SET_NULL`, null), `product_name`, `quantity`, `created_at`.
  - API de configuración: campo `numero_mesas` (`source='table_count'`).

- [ ] **Step 1: Escribir las pruebas que fallan**

```python
# test_order_models.py
def test_two_open_orders_on_same_table_are_rejected(self):   # IntegrityError dentro de atomic()
def test_table_can_reopen_after_charged_or_cancelled(self):  # cambiar status y crear otra: funciona

# test_settings.py
def test_table_count_defaults_to_ten(self):        # GET → numero_mesas == 10
def test_admin_can_change_table_count(self):       # PATCH 8 → 200 y table_count == 8
def test_table_count_limits(self):                 # PATCH 0 y 101 → 400
def test_table_count_cannot_drop_below_open_table(self):
    # comanda abierta en mesa 8; PATCH 5 → 400; PATCH 8 → 200

# test_catalog.py
def test_product_in_order_cannot_be_deleted(self):
    # OrderItem con el producto; DELETE → 409 y 'desactívalo' en detail
```

- [ ] **Step 2: Correr y confirmar el fallo.** Espera: `ImportError` de `Order`.

- [ ] **Step 3: Implementar.** Los modelos, `numero_mesas` con `validate_numero_mesas` (rechaza si existe una comanda abierta con `table_number` mayor) y las clases de admin en solo lectura para `Order`, con sus partidas y eventos en línea. Cambiar el mensaje de `ProductViewSet.destroy` a `'Este producto tiene historial; desactívalo en lugar de borrarlo.'`. Actualizar el docstring de `models.py`. Correr `makemigrations pos -n orders_and_tables`.

- [ ] **Step 4: Correr todas las pruebas.** Espera: `OK`.

- [ ] **Step 5: Punto de control.** Sin commit.

---

### Tarea 3: Lógica de comandas y cobro

**Files:**
- Create: `pos/order_services.py`, `pos/tests/test_order_services.py`
- Modify: `pos/services.py` (`create_sale`, `close_cash_session`), `pos/tests/test_cashbox.py`, `pos/tests/test_sales.py`

**Interfaces:**
- Consumes: modelos de la tarea 2; `to_money`, `_merge_quantities`, `create_sale`, `InsufficientStockError(product, available, requested)`, `CashSessionError`, `SaleValidationError`.
- Produces, en `order_services.py`:
  - Excepciones `OrderConflictError` (409), `OrderValidationError` (400), `OrderPermissionError` (403).
  - `open_order(table_number, items, user) -> Order`
  - `add_order_items(order_id, items, user) -> Order`
  - `remove_order_item(order_id, product_id, quantity, user) -> Order`
  - `charge_order(order_id, user) -> Sale`
  - `cancel_order(order_id, user, reason='') -> Order`
  - `summarize_order(order) -> {'subtotal', 'tax', 'total'}` en `Decimal`, con precios e IVA vigentes
  - `get_tables_overview() -> {'numero_mesas': int, 'mesas': [{'mesa': int, 'comanda': dict | None}]}`, donde `comanda` trae `id`, `items_count`, `subtotal`, `opened_by` y `opened_at`
- Produces, en `services.py`: `create_sale(items, user, payment_method=..., session=None)`.

- [ ] **Step 1: Escribir las pruebas que fallan** en `test_order_services.py`. Ejemplos de las más importantes:

```python
def test_charge_creates_sale_and_frees_table(self):
    order = open_order(3, [{'product_id': self.taco.id, 'quantity': 2}], self.waiter)
    sale = charge_order(order.id, self.cashier)
    order.refresh_from_db()
    self.assertEqual(order.status, Order.Status.CHARGED)
    self.assertEqual(order.sale, sale)
    self.assertEqual(sale.cashier, self.cashier)
    self.assertIsNotNone(order.closed_at)
    open_order(3, [{'product_id': self.taco.id, 'quantity': 1}], self.waiter)  # mesa libre

def test_charge_without_stock_rolls_back(self):
    # taco con stock 2 y comanda de 2; bajar stock a 1 con update()
    with self.assertRaises(InsufficientStockError):
        charge_order(order.id, self.cashier)
    order.refresh_from_db()
    self.assertEqual(order.status, Order.Status.OPEN)
    self.assertEqual(Sale.objects.count(), 0)

def test_order_from_yesterday_charges_into_its_own_session(self):
    # jornada abierta con business_date de ayer y comanda ligada a ella
    sale = charge_order(order.id, self.cashier)
    self.assertEqual(sale.cash_session, yesterday_session)
    close_cash_session(self.cashier)           # ya no hay mesas abiertas
    open_cash_session(Decimal('500'), self.cashier)  # ya se puede abrir la de hoy
```

Además, cada una con su aserción evidente:

```text
test_open_requires_today_cash_session            sin caja o solo con la de ayer → CashSessionError
test_open_rejects_table_out_of_range             mesa 0 y 11 con 10 mesas → OrderValidationError
test_open_on_occupied_table_conflicts            OrderConflictError
test_open_links_today_session_and_opened_by      cash_session y opened_by correctos
test_add_merges_quantities_and_logs_event        2 + 1 = un renglón con 3; un OrderEvent ADD por producto, con el usuario que agregó
test_any_waiter_can_add_to_any_table             otro mesero agrega; el evento lo nombra a él
test_duplicate_lines_in_one_request_are_merged   mismo producto dos veces en items → un renglón sumado
test_add_rejects_inactive_and_missing_product    OrderValidationError con el nombre o el id
test_add_over_stock_conflicts                    total en comanda > stock → InsufficientStockError; sin stock registrado (None) no valida
test_remove_decrements_then_deletes              llega a 0 → borra el renglón; OrderEvent REMOVE con producto y usuario
test_remove_more_than_present_rejected           OrderValidationError y sin cambios
test_add_to_charged_order_conflicts              agregar, quitar, cobrar y cancelar sobre una no abierta → OrderConflictError
test_charge_empty_order_conflicts                OrderConflictError
test_charge_twice_conflicts                      la segunda → OrderConflictError; una sola venta
test_charge_with_inactive_product_rolls_back     SaleValidationError nombra el producto; sigue abierta; al quitarlo se cobra
test_stock_is_not_touched_until_charge           stock igual tras abrir y agregar; baja al cobrar
test_cancel_requires_reason_when_it_has_items    sin motivo → OrderValidationError
test_waiter_cannot_cancel_with_items             OrderPermissionError
test_waiter_can_cancel_empty_order_without_reason cancelada y mesa libre
test_cancel_records_who_and_when                 cancelled_by, cancel_reason, closed_at
test_summary_uses_current_price_and_tax          2 × $25 con 8 % → 50.00, 4.00, 54.00
test_tables_overview_marks_free_and_occupied     numero_mesas entradas; comanda solo en las abiertas
```

En `test_cashbox.py`: `test_close_is_blocked_by_open_orders` (`CashSessionError` que menciona el número de cada mesa; la caja sigue abierta). En `test_sales.py`: `test_api_sale_still_requires_today_session` (con solo una jornada de ayer abierta, `POST /api/ventas/` responde 409).

- [ ] **Step 2: Correr y confirmar el fallo.** Espera: `ModuleNotFoundError: pos.order_services`.

- [ ] **Step 3: Cambiar `create_sale`.** Con `session`, bloquear esa jornada por `pk` y exigir `status == OPEN`, o lanzar `CashSessionError`. Sin `session`, el comportamiento de hoy no cambia.

- [ ] **Step 4: Cambiar `close_cash_session`.** Justo después de obtener la jornada, si tiene comandas abiertas lanzar `CashSessionError(f'Faltan por cobrar o cancelar las mesas: {lista}.')`. No bloquear las filas de las comandas: el cobro bloquea comanda y luego jornada, y así se evita un interbloqueo.

- [ ] **Step 5: Implementar `order_services.py`.** Todas las escrituras con `@transaction.atomic`. `open_order` bloquea la jornada de hoy, y luego crea la comanda dentro de un `transaction.atomic()` anidado que convierte `IntegrityError` en `OrderConflictError` (dos meseros a la vez). Agregar, quitar, cobrar y cancelar empiezan con `select_for_update` sobre la comanda y validan que siga abierta. Para el stock, se valida solo si `product.stock is not None`, igual que `create_sale`.

- [ ] **Step 6: Correr todas las pruebas.** Espera: `OK`.

- [ ] **Step 7: Punto de control.** Sin commit.

---

### Tarea 4: API de comandas

**Files:**
- Create: `pos/order_views.py`, `pos/tests/test_orders_api.py`
- Modify: `pos/serializers.py`, `pos/operations_urls.py`

**Interfaces:**
- Consumes: todo lo de `order_services.py`; `SaleItemInputSerializer`, `SaleSerializer`.
- Produces, para el frontend:
  - `GET /api/comandas/mesas/` → `{numero_mesas, mesas: [{mesa, comanda}]}`
  - `GET /api/comandas/?estado=abierta` → lista; sin `estado`, todas, de la más reciente a la más antigua
  - `GET /api/comandas/{id}/` y las respuestas de `POST /`, `agregar/`, `quitar/` y `cancelar/` → `{id, mesa, status, business_date, opened_by, opened_at, closed_at, cancelled_by, cancel_reason, items: [{product_id, product_name, unit_price, quantity, line_total}], subtotal, tax, total, events: [{action, product_name, quantity, user, created_at}]}`
  - `POST /api/comandas/` → 201; `agregar/`, `quitar/` y `cancelar/` → 200; `cobrar/` → 201 con `SaleSerializer`
- Errores: `OrderConflictError`, `CashSessionError` e `InsufficientStockError` → 409 (el último con `product_id` y `available`, como `/ventas/`); `OrderValidationError` y `SaleValidationError` → 400; `OrderPermissionError` → 403.

- [ ] **Step 1: Escribir las pruebas que fallan**

```python
def test_waiter_opens_adds_and_removes(self):        # 201, 200, 200 y cantidades finales
def test_second_open_on_same_table_conflicts(self):  # 409 con detail
def test_open_without_cash_session_conflicts(self):  # 409
def test_open_table_out_of_range_is_400(self):
def test_open_with_empty_items_is_400(self):
def test_quantity_below_one_is_400(self):
def test_waiter_cannot_charge(self):                 # 403 y sigue abierta
def test_cashier_charges_and_gets_sale(self):        # 201, Decimal(total) correcto, mesa libre en mesas/
def test_charge_without_stock_is_409_with_product(self):  # product_id y available
def test_waiter_cancel_with_items_is_403(self):
def test_waiter_cancel_empty_is_200(self):
def test_cashier_cancel_without_reason_is_400(self):
def test_detail_includes_totals_and_events(self):    # subtotal, tax, total, events
def test_tables_overview_shape(self):                # numero_mesas y una entrada por mesa
def test_filter_by_estado(self):                     # ?estado=abierta excluye cobradas
def test_requires_authentication(self):              # sin token → 401
def test_close_cash_with_open_order_is_409(self):    # POST /api/caja/cerrar/ menciona la mesa
```

- [ ] **Step 2: Correr y confirmar el fallo.** Espera: 404 en las rutas.

- [ ] **Step 3: Implementar.** Serializers `OrderCreateSerializer` (`mesa`, `items` con `allow_empty=False`), `OrderItemsSerializer`, `OrderRemoveItemSerializer`, `OrderCancelSerializer` (`motivo`, opcional, máximo 255) y `OrderSerializer`. `OrderViewSet` con `get_permissions()`: `cobrar` usa `IsPosUser`, todo lo demás `IsOrderUser`. Registrar `router.register('comandas', OrderViewSet, basename='order')` y actualizar el docstring de `operations_urls.py`.

- [ ] **Step 4: Correr todas las pruebas.** Espera: `OK`.

- [ ] **Step 5: Punto de control.** Sin commit.

---

### Tarea 5: Navegación por rol en el frontend

**Files:**
- Modify: `FronEnd/js/api.js`, `js/navigation.js`, `js/session.js`, `js/users.js` (`ROLE_LABELS`), `index.html`
- Create: `FronEnd/js/orders.js` (solo `loadTablesTab()` vacía y `stopTablesPolling()` por ahora)

**Interfaces:**
- Produces, en `api.js`: `getTablesFromApi()`, `getOrderFromApi(orderId)`, `createOrderInApi({mesa, items})`, `addOrderItemsInApi(orderId, items)`, `removeOrderItemInApi(orderId, productId, quantity)`, `chargeOrderInApi(orderId)`, `cancelOrderInApi(orderId, motivo)`.
- Produces, en `navigation.js`: `const WAITER_TABS = ['tables']`.
- Produces, en `index.html`: `<section id="tables-tab" class="tab-content">`, botón "Mesas" con `data-tab="tables"` en `#cashier-nav`, entre Venta y Cierre de caja, y `<script src="js/orders.js">` después de `cart.js`.

- [ ] **Step 1: `showTab()`.** Un mesero que pida otra pantalla va a `tables`, antes de la validación de `ADMIN_TABS`. `requiresOpeningCash` excluye al mesero, y también `tables` cuando existe `cashBoxState.pending_session`: el cajero necesita Mesas para cobrar lo que le impide cerrar la caja de ayer. El admin que pida `tables` va a `admin-dashboard`. Agregar la rama que llama a `loadTablesTab()`.

- [ ] **Step 2: `session.js`.** `updateRoleNavigation()` oculta `#cashier-nav` a admin y mesero, y usa `ROLE_LABELS` para `session-role` (agregar `waiter: 'Mesero'`). `loadSessionData()`: el mesero solo llama `loadCatalog()` y se salta configuración, caja, almacén y resumen. `enterApp()`: el mesero va directo a `tables`, sin `openDailyStartIfNeeded()`, y `canRestoreTab` solo acepta sus pestañas. `logoutSession()` y `showLoginScreen()` llaman `stopTablesPolling()`.

- [ ] **Step 3: Verificar en local.** Con los servidores arriba (sección 12 de la guía), crear un mesero local con el comando de la sección 4 de la guía y `role='waiter'`, y entrar. Espera: pantalla Mesas vacía, sin barra de pestañas, sin aviso de fondo inicial y **sin errores 403 en la consola**. El cajero ve la pestaña Mesas; el admin no.

- [ ] **Step 4: Punto de control.** Sin commit.

---

### Tarea 6: Pantalla de mesas y comanda (mesero)

**Files:**
- Modify: `FronEnd/js/orders.js`, `index.html` (`#tables-tab`), `css/styles.css`

**Interfaces:**
- Consumes: `api.js` de la tarea 5; `getSellableProducts()`, `getProductImageUrl()`, `escapeHtml()`, `showNotification()`, `openActionModal()`.
- Produces, en `orders.js`: `loadTablesTab()`, `refreshTables()`, `startTablesPolling()`, `stopTablesPolling()`, `openTable(tableNumber)`, `closeOrderView()`, `renderOrderView()`, `addToOrderDraft(productId)`, `removeFromOrderDraft(productId)`, `sendOrderDraft()`, `removeOrderItem(productId)`, `cancelEmptyOrder()`.
- Estado del módulo: `tablesOverview`, `currentTable`, `currentOrder`, `orderDraft` (`Map` de producto a cantidad), `orderCategory`, `tablesPollTimer`, `isSendingOrder`.

- [ ] **Step 1: Cuadrícula.** Libres en claro; ocupadas en color con número de productos, mesero y hora. Botón "Actualizar".

- [ ] **Step 2: Consultas automáticas.** `setInterval` cada `10000` ms, solo con `#tables-tab` activa, sin comanda abierta y con `document.visibilityState === 'visible'`. `showTab()` llama `stopTablesPolling()` al salir de `tables`. Un 401 detiene las consultas y lleva al login. Otros errores no repiten avisos en cada ciclo.

- [ ] **Step 3: Vista de comanda.** "Ya en la mesa" con botón − por producto; productos de `getSellableProducts()` con filtros de categoría propios (`orderCategory`, sin tocar `activeCategory`, que es de Venta); "Por mandar" con cantidades y barra fija "Mandar (n)". Sin `currentOrder` usa `createOrderInApi`; con ella, `addOrderItemsInApi`. Si la comanda está vacía, muestra "Cancelar mesa".

- [ ] **Step 4: Manejo de errores.** `sendOrderDraft()` pone `isSendingOrder` y deshabilita el botón hasta terminar. Si al abrir responde 409 por mesa ocupada: recargar la mesa, **conservar `orderDraft`** y avisar que ya se abrió, para que al mandar otra vez se use `agregar/`. Si responde 409 porque ya se cobró o canceló: mostrar el mensaje, limpiar y regresar a la cuadrícula. Con éxito, vaciar `orderDraft` y seguir en la comanda.

- [ ] **Step 5: Estilos**, primero para celular, reusando `.product-card` y `.category-tab`. La barra "Mandar" respeta `env(safe-area-inset-bottom)`.

- [ ] **Step 6: Verificar en el navegador**, a 390 × 844, como mesero con la caja abierta por el cajero:
  1. Abrir la mesa 3, mandar 2 tacos, agregar un refresco y quitar un taco: las cantidades cuadran y `GET /api/comandas/{id}/` muestra la bitácora con el usuario.
  2. Abrir otra mesa a la vez, y agregar a una mesa con otro mesero.
  3. **Doble toque en "Mandar"** con la red lenta (DevTools): llega una sola petición y las cantidades no se duplican.
  4. **Dos meseros en la misma mesa libre** (dos ventanas): el segundo recibe el aviso, conserva "Por mandar" y lo manda sin perderlo.
  5. **Esperar 25 s con productos en "Por mandar":** no se pierde nada. Regresar a la cuadrícula: se actualiza sola y la pestaña de red muestra que al ocultar la pestaña las consultas paran.
  6. **Con la vista abierta, cobrar esa mesa desde otra ventana con la API navegable** e intentar agregar: sale el mensaje y regresa a la cuadrícula.
  7. Un producto con nombre `<b>prueba</b>` se ve como texto.

- [ ] **Step 7: Punto de control.** Sin commit.

---

### Tarea 7: Cobro y cancelación (cajero)

**Files:**
- Modify: `FronEnd/js/orders.js`, `css/styles.css`

**Interfaces:**
- Consumes: `chargeOrderInApi`, `cancelOrderInApi`; `openActionModal()`, `openInputModal()`, `refreshCashBoxView()`, `updateTodaySalesSummary()`, `loadSalesHistoryTab()`, `refreshCatalog()`.
- Produces: `confirmChargeOrder()`, `confirmCancelOrder()`.

- [ ] **Step 1: Vista del cajero.** Con rol distinto de mesero, mostrar subtotal, IVA y total **que devuelve la API** (no calcular en el navegador), más los botones "Cobrar" y "Cancelar comanda", y la bitácora de cambios.

- [ ] **Step 2: Cobrar.** Confirmación con el desglose. Al confirmar, `chargeOrderInApi`; con éxito, aviso *"Venta #N registrada por $X MXN"*, y refrescar catálogo (por el stock), resumen de hoy, historial y caja. Regresar a la cuadrícula.

- [ ] **Step 3: Cancelar.** `openInputModal()` con `danger: true` y motivo obligatorio.

- [ ] **Step 4: Verificar en el navegador**, como cajero a tamaño escritorio:
  1. Cobrar la mesa 3: la venta sale en Ventas y en el resumen de hoy, el stock baja y la mesa queda libre en el celular del mesero en menos de 15 s.
  2. Cerrar caja con otra mesa abierta: el aviso nombra la mesa. Cobrarla y cerrar: el corte incluye ambas ventas.
  3. Cancelar una comanda con motivo: la mesa queda libre y no se crea venta.
  4. **Desactivar un producto de una comanda abierta** e intentar cobrar: el aviso lo nombra y la comanda sigue. Quitarlo y cobrar: funciona.
  5. **Cambio de día:** en el panel de Django, cambiar `business_date` de la jornada abierta a ayer, con una mesa abierta. El cajero entra a Mesas (no lo manda a Caja), cobra, cierra esa caja y abre la de hoy.

- [ ] **Step 5: Punto de control.** Sin commit.

---

### Tarea 8: Configuración de mesas y rol en Usuarios (admin)

**Files:**
- Modify: `FronEnd/index.html`, `js/settings.js`, `js/users.js`, `js/api.js` (JSDoc de `updateSettingsInApi`)

**Interfaces:**
- Consumes: `numero_mesas` de `/configuracion/`; `updateSettingsInApi(changes)`; `applyUserChange(user, changes, message)`.
- Produces: `updateTableCount(event)` y `displayTableCount()` en `settings.js`; `confirmUserRoleChange(userId, nextRole)` en `users.js`.

- [ ] **Step 1: Configuración.** Panel "Número de mesas" con el patrón de los paneles de IVA y tipo de cambio (`#table-count-form`, `#table-count-input`, `min=1`, `max=100`). `applySettings()` guarda el valor. El rechazo por mesa ocupada se muestra con `error.message`: `apiRequest` ya trae el mensaje del servidor.

- [ ] **Step 2: Usuarios.** Agregar `<option value="waiter">Mesero</option>` a `#user-role`. En cada fila, cambiar el botón "Hacer ..." por un `<select>` de rol, deshabilitado con `selfLock`. Al cambiar, **regresar de inmediato el select al rol actual** y abrir el modal: si se cancela queda correcto, y si se confirma `applyUserChange` redibuja la fila.

- [ ] **Step 3: Verificar en el navegador**, como admin: crear un mesero; cambiar un rol y cancelar (no cambia); confirmar (cambia y le cierra la sesión); poner 8 mesas (la cuadrícula muestra 8); intentar 2 con la mesa 3 ocupada (aviso, no cambia).

- [ ] **Step 4: Punto de control.** Sin commit.

---

### Tarea 9: Prueba completa en local y documentación

**Files:**
- Modify: `POS/GUIA_PRUEBAS_LOCAL.txt`, `docs/Cambios.md`

- [ ] **Step 1: Preparar la base local.** Sin `DATABASE_URL` definida: `manage.py migrate` y `manage.py cargar_menu`, más admin, cajero y mesero con los comandos de la sección 4 de la guía.

- [ ] **Step 2: Correr todas las pruebas.** Espera: `OK`, con las 159 anteriores incluidas.

- [ ] **Step 3: Flujo completo** (sección 7 de la spec), con el mesero **en un celular real por Wi-Fi** (sección 14 de la guía):
  admin crea el mesero y pone 8 mesas → cajero abre caja → mesero abre la mesa 3, manda 2 tacos, agrega un refresco y quita un taco → cajero revisa la bitácora y cobra → la venta sale en el historial y la mesa queda libre → cerrar caja con otra mesa abierta da aviso → cobrarla y cerrar.

- [ ] **Step 4: Documentar.** En la guía, una sección de pruebas de comandas y, en la 13, el orden de publicación de la spec. En `Cambios.md`, las pantallas nuevas y `/api/comandas/`.

- [ ] **Step 5: Parar y avisar a csvela.** **No publicar.** Publicar es decisión suya y requiere, en este orden: la cadena de Supabase, que la guía indica rotar con Diego; `migrate` contra Supabase **antes** del push; y el push, que se publica solo. Los bloqueos solo se pueden comprobar con concurrencia real después de eso, porque SQLite ignora `select_for_update`.
