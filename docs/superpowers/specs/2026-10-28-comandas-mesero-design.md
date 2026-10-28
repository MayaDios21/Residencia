# Proyecto 2 — Comandas y rol mesero

**Fecha:** 2026-10-28
**Estado:** diseño aprobado por csvela, pendiente de revisión del equipo
**Requiere antes:** [Proyecto 1 — Conectar cajero y administrador al backend](2026-10-28-integracion-backend-design.md)

---

## 1. Qué queremos

Un **mesero** anda por las mesas con **su celular**. Elige una mesa, toma el pedido
y lo **manda**. La comanda **no se cierra**: si la mesa pide más, el mesero vuelve y
agrega. Cuando el cliente pide la cuenta, **el cajero la cobra** desde la caja y en
ese momento se registra la venta.

### Lo que se decidió (y por qué)

| Pregunta | Decisión | Motivo |
|---|---|---|
| ¿Dónde se toma la comanda? | En el celular del mesero | Por eso las comandas viven en el backend: el cajero tiene que ver lo que manda el mesero desde otro dispositivo. |
| ¿Quién cobra? | El cajero | El dinero sigue pasando solo por caja; el corte cuadra. |
| ¿Cómo se identifica la comanda? | Número de mesa | Es lo más rápido de tocar en un celular. |
| ¿Cómo elige la mesa? | Cuadrícula; el admin define cuántas mesas hay | Evita escribir un número equivocado. |
| ¿Qué pasa al "mandar"? | Solo se guarda | Cocina se avisa como hoy. Pantalla de cocina o impresión quedan para después. |
| ¿Quién corrige productos ya mandados? | Mesero y cajero, con bitácora | Los errores son comunes; queda registro de quién cambió qué. |
| ¿Un mesero puede tener varias mesas? | Sí, todas las que quiera | La única regla es una comanda abierta **por mesa**. |
| ¿Solo el mesero que abrió la mesa puede agregar? | No, cualquier mesero agrega a cualquier mesa | En hora pico otro mesero atiende; la bitácora dice quién agregó. |

## 2. Datos (backend)

### Cambios a modelos existentes

- `UserProfile.Role`: agregar `WAITER = 'waiter', 'Mesero'`.
- `SystemSettings`: agregar `table_count` (`PositiveSmallIntegerField`, por defecto
  10, mínimo 1, máximo 100). En la API se expone como `numero_mesas`.

### Modelos nuevos

**`Order` (comanda)**

| Campo | Tipo | Notas |
|---|---|---|
| `table_number` | `PositiveSmallIntegerField` | 1..`table_count` |
| `status` | `abierta` / `cobrada` / `cancelada` | |
| `opened_by` | FK `User` | Mesero (o cajero) que la abrió |
| `opened_at` | `DateTimeField(auto_now_add)` | |
| `cash_session` | FK `CashSession` | Jornada en que se abrió |
| `sale` | `OneToOneField(Sale, null=True)` | Se llena al cobrar |
| `closed_at` | `DateTimeField(null=True)` | Al cobrar o cancelar |
| `cancelled_by`, `cancel_reason` | | Igual que en `Sale` |

Restricción: `UniqueConstraint(fields=['table_number'], condition=Q(status='abierta'))`.
Así la base de datos misma impide **dos comandas abiertas en la misma mesa**
(funciona en PostgreSQL y en SQLite).

**`OrderItem` (partida de la comanda)**: `order`, `product` (FK, `PROTECT`),
`quantity`. Un renglón por producto; si se vuelve a mandar el mismo producto, se
suma la cantidad.

**`OrderEvent` (bitácora)**: `order`, `user`, `action` (`agregar` / `quitar`),
`product`, `product_name` (copia), `quantity`, `created_at`. Se escribe en cada
agregar y quitar. No se edita ni se borra.

## 3. Reglas del negocio

1. Solo se pueden **abrir** comandas con la **caja del día abierta**.
2. **No se puede cerrar la caja con comandas abiertas** (`close_cash_session`
   responde 409 con la lista de mesas pendientes).
3. **El precio se toma al cobrar**, con el catálogo vigente, igual que hoy
   `create_sale()`. La comanda no copia precios.
4. **El inventario se descuenta al cobrar.** Al agregar un producto con
   `track_inventory`, si la cantidad total en la comanda supera el stock actual,
   se rechaza con 409 para avisar a tiempo. No se aparta stock.
5. **Cobrar es atómico.** `charge_order(order_id, user)` con
   `@transaction.atomic`:
   - bloquea la comanda (`select_for_update`) y valida que esté abierta y no vacía;
   - llama a `create_sale(items, user)` (el mismo de `POST /api/ventas/`);
   - marca la comanda como `cobrada`, guarda `sale` y `closed_at`.
   Si `create_sale` falla (sin stock, caja cerrada), se revierte todo y la comanda
   **sigue abierta**. Es imposible cobrar dos veces la misma comanda.
6. **Cancelar:** cajero o admin, con motivo. El mesero solo puede cancelar una
   comanda **vacía** (por ejemplo, abrió la mesa equivocada).
7. **Concurrencia:** agregar, quitar, cobrar y cancelar bloquean la fila de la
   comanda. Si dos meseros abren la misma mesa a la vez, uno entra y el otro
   recibe 409 (lo garantiza la restricción única).

## 4. Permisos

> **Hay que corregir esto antes de agregar el rol.** Hoy `IsPosUser = IsCatalogUser`
> (`pos/permissions.py`), y `IsCatalogUser` acepta **cualquier rol válido**. En
> cuanto exista `waiter`, el mesero podría abrir y cerrar caja, vender y ver el
> historial sin que nadie cambie nada más.

| Permiso | Roles | Se usa en |
|---|---|---|
| `IsCatalogUser` | mesero, cajero, admin | Leer productos y categorías (el mesero necesita el menú) |
| `IsPosUser` (**nuevo significado**) | cajero, admin | Caja, ventas, leer configuración |
| `IsOrderUser` (nuevo) | mesero, cajero, admin | Comandas |
| `IsAdminRole` | admin | Sin cambios |

Sugerencia: una clase `HasAnyRole` con `allowed_roles = (...)` y que las demás
hereden de ella.

## 5. API

Todo bajo `/api/comandas/`, en español como el resto.

| Método y ruta | Cuerpo | Qué hace | Quién |
|---|---|---|---|
| `GET /comandas/mesas/` | | Una entrada por mesa (1..`table_count`): libre u ocupada; si está ocupada, su comanda resumida (id, productos, subtotal estimado, quién la abrió, desde cuándo) | `IsOrderUser` |
| `GET /comandas/?estado=abierta` | | Lista de comandas | `IsOrderUser` |
| `GET /comandas/{id}/` | | Detalle con partidas y bitácora | `IsOrderUser` |
| `POST /comandas/` | `{mesa, items: [{product_id, quantity}]}` | Abre la comanda con sus primeros productos | `IsOrderUser` |
| `POST /comandas/{id}/agregar/` | `{items: [...]}` | Agrega productos (suma si ya estaban) | `IsOrderUser` |
| `POST /comandas/{id}/quitar/` | `{product_id, quantity}` | Resta cantidad; si llega a 0, quita la partida | `IsOrderUser` |
| `POST /comandas/{id}/cobrar/` | | Cobra (regla 5). Responde lo mismo que `POST /ventas/` | `IsPosUser` |
| `POST /comandas/{id}/cancelar/` | `{motivo}` | Cancela (regla 6) | `IsOrderUser`; el servicio rechaza con 403 si es mesero y la comanda tiene productos |

**Errores** (mismos códigos que ya usa la API):

- `409`: mesa ocupada, caja cerrada, stock insuficiente, comanda ya cobrada o
  cancelada, cerrar caja con mesas abiertas.
- `400`: datos inválidos (mesa fuera de rango, cantidad < 1, producto inactivo).
- `403`: rol sin permiso.

**Cambios a endpoints existentes:**

- `PATCH /configuracion/` acepta `numero_mesas` (solo admin). No deja bajarlo si
  hay una comanda abierta en una mesa mayor al nuevo número.
- `POST /caja/cerrar/`: 409 si hay comandas abiertas (regla 2).
- `POST /usuarios/` y `PATCH /usuarios/{id}/` aceptan `role: "waiter"` (sale solo
  de `UserProfile.Role.choices`).
- Login: sin cambios; el servidor ya devuelve `role` del perfil.

## 6. Pantallas (frontend)

### Mesero (pensada para celular)

- Al entrar va directo a **Mesas**; es su única pantalla. No ve Venta, Caja ni
  Ventas, y **no se le pide fondo inicial**.
- **Cuadrícula de mesas:** libres en claro; ocupadas en color con número de
  productos, mesero y hora. Se actualiza cada 10 s mientras está visible, más un
  botón para actualizar.
- **Vista de comanda** (al tocar una mesa):
  - "Ya en la mesa": lo mandado, con botón − por producto (quitar o corregir).
  - Productos del menú con filtros por categoría, como en la pantalla Venta. Lo
    que se toca se junta en "Por mandar".
  - Barra fija abajo: **"Mandar (n)"**. En mesa libre, el primer "Mandar" abre la
    comanda (`POST /comandas/`); después usa `agregar/`.
  - Si la comanda está vacía: "Cancelar mesa".

### Cajero

- Pestaña nueva **"Mesas"** entre Venta y Cierre de caja, con la **misma
  cuadrícula y vista de comanda** (un solo código).
- Además ve el **total con IVA** y:
  - **"Cobrar"**: confirmación con el desglose, como la venta actual → `cobrar/`.
  - **"Cancelar comanda"**: pide motivo → `cancelar/`.
- Si intenta cerrar caja con mesas abiertas, se le dice cuáles faltan.

### Administrador

- **Configuración:** campo "Número de mesas".
- **Usuarios:** opción "Mesero" en el rol. Ojo: hoy el cambio de rol en
  `js/users.js` es un interruptor admin ↔ cajero (`nextRole = user.role === 'admin' ? 'cashier' : 'admin'`);
  con tres roles tiene que ser un selector.
- Sin pantalla de Mesas en esta versión. Las comandas cobradas son ventas
  normales, así que salen en historial y reportes.

### Archivos

| Archivo | Cambio |
|---|---|
| `js/orders.js` (nuevo) | Cuadrícula, vista de comanda, "Por mandar", cobrar y cancelar |
| `js/api.js` | Funciones de comandas (con JSDoc en español) |
| `js/navigation.js` | `WAITER_TABS = ['tables']`; `showTab()` hoy obliga a **cualquier rol que no sea admin** a abrir caja (`requiresOpeningCash = !isAdmin && ...`), hay que excluir al mesero |
| `js/session.js` | `enterApp()` manda al mesero a `tables`; navegación por rol |
| `index.html` | Sección `#tables-tab`, pestaña "Mesas" del cajero, opción "Mesero" en usuarios, campo de mesas en configuración |
| `css/styles.css` | Cuadrícula y barra "Mandar", primero para celular |

## 7. Pruebas

**Backend (escribirlas antes del código):**

- Modelos: no se pueden tener dos comandas abiertas en la misma mesa; sí después
  de cobrar o cancelar la anterior.
- Cada endpoint: caso feliz y errores (mesa ocupada, mesa fuera de rango, caja
  cerrada, producto inactivo, cantidad inválida).
- Agregar suma cantidades; quitar resta y borra en 0; cada cambio deja un
  `OrderEvent` con el usuario correcto.
- **Cobro atómico:** sin stock o con caja cerrada, el cobro falla, **no se crea
  venta y la comanda sigue abierta**. Cobrar dos veces → 409.
- Cerrar caja con comandas abiertas → 409.
- `numero_mesas` no baja por debajo de una mesa ocupada.
- **Permisos:** el mesero recibe 403 en caja, ventas, inventario, reportes,
  usuarios y configuración; no puede cobrar; solo cancela comandas vacías.
- Las pruebas existentes siguen pasando.

**Frontend (en el navegador):**

1. Admin crea un mesero y pone 8 mesas.
2. Cajero abre caja.
3. Mesero, en tamaño celular, abre la mesa 3, manda 2 tacos; vuelve y agrega un
   refresco; quita un taco.
4. Cajero ve la mesa 3 ocupada, revisa la bitácora, cobra.
5. La venta aparece en el historial; la mesa 3 queda libre.
6. Cerrar caja con otra mesa abierta → aviso; cobrarla y cerrar.

## 8. Fuera de alcance (posibles siguientes pasos)

- Pantalla de cocina o impresión de comandas.
- Mover una comanda de mesa o juntar mesas.
- Que el admin vea las mesas en vivo.
- Notificaciones en tiempo real (hoy basta con actualizar cada 10 s).
