# Proyecto 1 — Conectar cajero y administrador al backend

**Fecha:** 2026-10-28
**Estado:** diseño aprobado por csvela, pendiente de revisión del equipo
**Va antes de:** [Proyecto 2 — Comandas y rol mesero](2026-10-28-comandas-mesero-design.md)

---

## 1. Por qué existe este proyecto

Queremos agregar comandas: el mesero las levanta **desde su celular** y el cajero
las cobra **desde la caja** (ver Proyecto 2). Como son dispositivos distintos,
las comandas tienen que vivir en el servidor. Ahí aparece el problema: hoy el
frontend del cajero y del administrador **casi no usa el backend**.

- `FronEnd/js/api.js` tiene `const USE_API = false;`. Con eso, catálogo, caja,
  ventas, historial, configuración y panel se guardan en el `localStorage` de cada
  navegador. Solo el login y la gestión de usuarios usan la API.
- **Los IDs de producto no coinciden.** El frontend tiene su propio catálogo con
  IDs locales (`state.js`: Taco de Birria = 1, Agua Grande = 7…). Los productos de
  la base de datos tienen otros IDs. Si el carrito mandara hoy sus productos a
  `POST /api/ventas/`, el servidor recibiría IDs que no significan lo mismo.
- **El backend no sabe si la caja está abierta.** La caja se abre solo en el
  navegador, y `create_sale()` exige una `CashSession` abierta en la base de datos.

Por eso, cobrar una comanda en el servidor obliga a conectar antes el catálogo, la
caja y las ventas. Este trabajo es además la "Integración completa del sistema"
que el cronograma marca para S11–S12. Este proyecto lo adelanta y le da un
objetivo concreto.

## 2. Alcance

**Entra:**

| Módulo | Hoy | Después |
|---|---|---|
| Catálogo (productos y categorías) | `localStorage` con IDs locales | Se carga de `GET /api/productos/` y `GET /api/categorias/` al iniciar sesión; el admin crea, edita y borra por la API |
| Configuración (IVA, tipo de cambio) | `localStorage` | `GET`/`PATCH /api/configuracion/` |
| Caja (abrir, estado, cerrar, historial de cierres) | `localStorage` | `/api/caja/actual/`, `abrir/`, `cerrar/`, `cierres/`, `cierres/exportar/` |
| Ventas (carrito) | `localStorage` (la rama con API existe, pero apagada) | `POST /api/ventas/` |
| Historial y cancelación de ventas | `localStorage` | `GET /api/ventas/`, `POST /api/ventas/{id}/cancelar/` |
| Panel del administrador | Calcula con el historial local | `GET /api/ventas/resumen/` (y `/api/reportes/` donde convenga) |
| Movimientos de inventario de productos | Rama con API apagada | `POST /api/inventario/movimientos/` |

**No entra (se hace después):**

- **Insumos del almacén** (vasos, platos…): el backend ya tiene
  `/api/inventario/insumos/` y `alertas/`, pero el frontend los deja como están.
- Pantallas nuevas: aquí solo se cambia de dónde salen los datos, no cómo se ven.

## 3. Decisiones

1. **Se elimina `USE_API`.** El frontend siempre usa la API. En el navegador solo
   quedan el token, la sesión (`pos_session`), la pestaña abierta y el carrito en
   curso.
2. **Sin servidor no se registran ventas.** Si la API no responde, se muestra un
   error. No se guarda nada en el navegador "para después", porque eso genera
   datos que no cuadran con el corte de caja.
3. **No se migran los datos del `localStorage`.** El sistema arranca con lo que haya
   en la base. Lo que cada dispositivo tenga guardado se ignora y se limpia.
4. **Menú inicial con un comando:** `python manage.py cargar_menu` crea en la base
   las categorías y productos que hoy trae el frontend (`defaultProducts` y
   `defaultCategories` en `FronEnd/js/state.js`), con las mismas rutas de imagen
   (`../Public/assets/imagenes/...`) en `Product.image`. Debe poder correrse más de
   una vez sin duplicar nada (`update_or_create` por nombre).
5. **El servidor manda en precios y existencias.** El frontend muestra lo que
   devuelve la API; no recalcula stock por su cuenta.

## 4. Cambios por archivo (frontend)

| Archivo | Cambio |
|---|---|
| `js/api.js` | Quitar `USE_API`. Agregar funciones para categorías (CRUD), productos (editar, borrar), configuración, caja (actual, abrir, cerrar, cierres, exportar), ventas (listar, cancelar, resumen). Cada una con JSDoc en español, como las existentes. |
| `js/main.js` | `initializeSystem()` deja de cargar del `localStorage`. Los datos se piden a la API **después** del login (en `enterApp()`), no antes. |
| `js/storage.js` | Se reduce a token, sesión, pestaña y carrito. Lo demás se borra. |
| `js/products.js`, `js/categories.js` | Leen y escriben por la API. Los IDs son los del servidor. |
| `js/cart.js` | `confirmSale()` siempre usa `createSaleInApi()`. Se quita `recordSale()` local. |
| `js/cashbox.js` | Abrir, consultar y cerrar por la API. `shouldOpenCashBoxForToday()` se basa en `GET /api/caja/actual/`. |
| `js/sales.js` | Historial y cancelación por la API. |
| `js/dashboard.js` | Métricas desde `GET /api/ventas/resumen/`. |
| `js/settings.js` | IVA y tipo de cambio por la API. El botón "limpiar datos" deja de tener sentido y se quita. |
| `js/warehouse.js` | Movimientos de productos por la API (ya existe la rama). Insumos sin cambios. |

## 5. Cambios en el backend

Pocos, porque los endpoints ya existen:

- Comando de gestión `pos/management/commands/cargar_menu.py` (decisión 4), con
  su prueba.
- Revisar que `ProductSerializer` acepte las rutas de imagen relativas que usa el
  frontend (`Product.image` es `TextField`, así que no debería haber problema).
- Si al conectar el frontend falta algún dato en una respuesta, se agrega al
  serializer con su prueba.

## 6. Cómo se prueba

- **Backend:** las 152 pruebas actuales siguen pasando, más las del comando
  `cargar_menu` (crea el menú y no duplica al correr dos veces).
- **Frontend (en el navegador, con los dos servidores arriba):**
  1. `cargar_menu`, login como cajero, abrir caja.
  2. Vender dos productos y confirmar que aparecen en `GET /api/ventas/`.
  3. Recargar la página: la venta sigue ahí (ya no depende del navegador).
  4. Desde **otro navegador**, entrar como admin y ver la venta en el historial y
     en el panel.
  5. Cancelar la venta y revisar que el stock regresa.
  6. Cerrar caja y comparar el corte con las ventas.
  7. Apagar Django e intentar vender: debe salir un error y no registrarse nada.

## 7. Riesgos

- **Archivo `storage.js` y `main.js`:** casi todo el arranque depende de ellos;
  conviene cambiarlos al final, módulo por módulo, probando cada uno.
- **Orden de carga:** hoy los datos se cargan antes del login. Con la API, sin
  token no hay datos. Hay que mover esa carga a después de iniciar sesión.
