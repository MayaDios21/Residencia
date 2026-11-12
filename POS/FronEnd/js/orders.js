/*
 * MESAS Y COMANDAS
 * Cuadrícula de mesas y comanda de la mesa elegida, para el mesero y el cajero
 * (un solo código). El mesero toca productos, los junta en "Por mandar" y los
 * manda; la comanda sigue abierta para agregar más. El cajero además ve el
 * total con IVA que calcula el servidor, la bitácora, y cobra o cancela.
 *
 * Todo vive en el servidor (/api/comandas/). La cuadrícula se actualiza sola
 * cada 10 segundos, solo mientras está en pantalla y la pestaña está visible:
 * en Vercel cada consulta cuesta una ejecución y una consulta a la base.
 */

const TABLES_POLL_MS = 10000;

// Cuadrícula tal como la devolvió la API: { numero_mesas, mesas: [{ mesa, comanda }] }.
let tablesOverview = null;
// Mesa abierta en pantalla (null = se está viendo la cuadrícula).
let currentTable = null;
// Comanda de esa mesa según la API (null = mesa libre, aún sin comanda).
let currentOrder = null;
// Productos tocados que todavía no se mandan: id de producto → cantidad.
const orderDraft = new Map();
// Filtro de categoría del menú de la comanda (independiente del de Venta).
let orderCategory = 'Todas';
let tablesPollTimer = null;
// Evita mandar dos veces lo mismo si se toca "Mandar" mientras responde el servidor.
let isSendingOrder = false;
// Evita repetir el mismo aviso de error en cada consulta automática.
let tablesPollErrorShown = false;

/**
 * Indica si quien usa la pantalla es mesero (no cobra ni cancela con productos).
 * @returns {boolean}
 */
function isWaiterSession() {
    return adminSession?.role === 'waiter';
}

/**
 * Da formato de pesos a un monto que llega como texto o número.
 * @param {string|number} amount
 * @returns {string} Por ejemplo "$54.00".
 */
function formatOrderMoney(amount) {
    return `$${Number(amount || 0).toFixed(2)}`;
}

/**
 * Hora corta (HH:MM) de una fecha ISO de la API.
 * @param {string} isoDate
 * @returns {string}
 */
function formatOrderTime(isoDate) {
    return new Date(isoDate).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Total de piezas en "Por mandar".
 * @returns {number}
 */
function getOrderDraftCount() {
    let count = 0;
    orderDraft.forEach(quantity => { count += quantity; });
    return count;
}

/**
 * Si la sesión ya no vale (401), avisa y regresa al inicio de sesión.
 * @param {Error} error - Error lanzado por apiRequest.
 * @returns {boolean} true si era un 401 y ya se atendió.
 */
function handleOrderSessionError(error) {
    if (error.status !== 401) return false;
    stopTablesPolling();
    localStorage.removeItem(AUTH_TOKEN_KEY);
    clearSessionStorage();
    adminSession = null;
    showLoginScreen();
    showNotification('Tu sesión expiró. Inicia sesión de nuevo.');
    return true;
}

/* ---------- Cuadrícula de mesas ---------- */

/**
 * Entra a la pestaña Mesas: muestra la cuadrícula (o la comanda que estaba
 * abierta) y arranca la actualización automática.
 */
function loadTablesTab() {
    if (currentTable !== null) {
        renderOrderView();
        reloadCurrentOrder();
        return;
    }
    renderTablesGrid();
    refreshTables();
    startTablesPolling();
}

/**
 * Pide al servidor el estado de las mesas y redibuja la cuadrícula si está en pantalla.
 * @param {{quiet?: boolean}} [options] - quiet: no repetir avisos (consulta automática).
 */
async function refreshTables({ quiet = false } = {}) {
    try {
        tablesOverview = await getTablesFromApi();
        tablesPollErrorShown = false;
    } catch (error) {
        if (handleOrderSessionError(error)) return;
        console.error('Error al consultar las mesas:', error);
        if (!quiet || !tablesPollErrorShown) {
            showNotification(`No se pudieron consultar las mesas: ${error.message}`);
            tablesPollErrorShown = true;
        }
        return;
    }
    if (currentTable === null) renderTablesGrid();
}

/** Arranca la consulta automática de mesas (cada 10 s, solo con la cuadrícula visible). */
function startTablesPolling() {
    stopTablesPolling();
    tablesPollTimer = setInterval(() => {
        const gridVisible = document.body.dataset.tab === 'tables' && currentTable === null;
        if (gridVisible && document.visibilityState === 'visible') {
            refreshTables({ quiet: true });
        }
    }, TABLES_POLL_MS);
}

/** Detiene la consulta automática (al salir de Mesas, abrir una comanda o cerrar sesión). */
function stopTablesPolling() {
    if (tablesPollTimer) clearInterval(tablesPollTimer);
    tablesPollTimer = null;
}

/** Dibuja la cuadrícula: mesas libres en claro y ocupadas con su resumen. */
function renderTablesGrid() {
    const view = document.getElementById('tables-view');
    if (!view) return;

    const tables = tablesOverview?.mesas || [];
    const occupied = tables.filter(table => table.comanda).length;
    const cards = tables.map(table => {
        const order = table.comanda;
        if (!order) {
            return `
                <button class="table-card" type="button" onclick="openTable(${table.mesa})">
                    <span class="table-card-number">${table.mesa}</span>
                    <span class="table-card-detail">Libre</span>
                </button>`;
        }
        return `
            <button class="table-card is-occupied" type="button" onclick="openTable(${table.mesa})">
                <span class="table-card-number">${table.mesa}</span>
                <span class="table-card-detail">${order.items_count} ${order.items_count === 1 ? 'producto' : 'productos'} · ${formatOrderMoney(order.subtotal)}</span>
                <span class="table-card-meta">${escapeHtml(order.opened_by)} · ${formatOrderTime(order.opened_at)}</span>
            </button>`;
    }).join('');

    view.innerHTML = `
        <div class="page-heading">
            <div>
                <span class="eyebrow">Comandas</span>
                <h2>Mesas</h2>
                <p class="page-subtitle">${tablesOverview ? `${occupied} de ${tables.length} ocupadas. Se actualiza sola cada 10 segundos.` : 'Cargando mesas…'}</p>
            </div>
            <button class="btn btn-secondary btn-compact" type="button" onclick="refreshTables()">Actualizar</button>
        </div>
        <div class="tables-grid">${cards}</div>
    `;
}

/* ---------- Comanda de una mesa ---------- */

/**
 * Abre la comanda de una mesa (o la vista para empezarla, si está libre).
 * @param {number} tableNumber
 */
async function openTable(tableNumber) {
    stopTablesPolling();
    currentTable = tableNumber;
    currentOrder = null;
    orderDraft.clear();
    orderCategory = 'Todas';

    const summary = tablesOverview?.mesas.find(table => table.mesa === tableNumber)?.comanda;
    renderOrderView();
    if (summary) await reloadCurrentOrder(summary.id);
}

/**
 * Vuelve a pedir la comanda en pantalla y la redibuja. Si ya se cobró o
 * canceló en otro dispositivo, avisa y regresa a la cuadrícula.
 * @param {number} [orderId] - Por defecto, la comanda en pantalla.
 * @returns {Promise<boolean>} false si la comanda ya no está abierta.
 */
async function reloadCurrentOrder(orderId = currentOrder?.id) {
    if (!orderId) return true;
    try {
        currentOrder = await getOrderFromApi(orderId);
    } catch (error) {
        if (handleOrderSessionError(error)) return false;
        showNotification(`No se pudo cargar la comanda: ${error.message}`);
        return true;
    }
    if (currentOrder.status !== 'abierta') {
        showNotification(`La comanda de la mesa ${currentTable} ya fue ${currentOrder.status}.`);
        leaveOrderView();
        return false;
    }
    renderOrderView();
    return true;
}

/** Regresa a la cuadrícula; si hay productos sin mandar, pide confirmación. */
function closeOrderView() {
    const pending = getOrderDraftCount();
    if (pending === 0) {
        leaveOrderView();
        return;
    }
    openActionModal(
        'Descartar pedido',
        `Hay ${pending} ${pending === 1 ? 'producto' : 'productos'} en "Por mandar" para la mesa ${currentTable}. Si regresas, se descartan.`,
        'Descartar y regresar',
        leaveOrderView
    );
}

/** Sale de la comanda sin preguntar y vuelve a la cuadrícula actualizada. */
function leaveOrderView() {
    currentTable = null;
    currentOrder = null;
    orderDraft.clear();
    renderTablesGrid();
    refreshTables();
    startTablesPolling();
}

/** Dibuja la comanda: encabezado, panel (en la mesa, por mandar, totales) y menú. */
function renderOrderView() {
    const view = document.getElementById('tables-view');
    if (!view || currentTable === null) return;

    const subtitle = currentOrder
        ? `Abierta por ${escapeHtml(currentOrder.opened_by)} a las ${formatOrderTime(currentOrder.opened_at)}`
        : 'Mesa libre: lo que mandes abre la comanda.';
    view.innerHTML = `
        <div class="page-heading order-heading">
            <div>
                <button class="btn btn-secondary btn-compact" type="button" onclick="closeOrderView()">← Mesas</button>
                <h2>Mesa ${currentTable}</h2>
                <p class="page-subtitle">${subtitle}</p>
            </div>
        </div>
        <div class="order-layout">
            <div class="order-panel" id="order-panel"></div>
            <section class="order-menu" aria-label="Menú">
                <div class="category-tabs" id="order-category-tabs" role="group" aria-label="Categorías"></div>
                <div class="products-grid" id="order-products-grid"></div>
            </section>
        </div>
        <div class="order-send-bar" id="order-send-bar"></div>
    `;
    renderOrderPanel();
    renderOrderMenu();
}

/** Dibuja lo que ya está en la mesa, lo que falta por mandar, totales y acciones. */
function renderOrderPanel() {
    const panel = document.getElementById('order-panel');
    if (!panel) return;
    const isWaiter = isWaiterSession();
    const items = currentOrder?.items || [];

    const sentRows = items.length === 0
        ? '<p class="order-empty">Todavía no hay productos en la mesa.</p>'
        : items.map(item => `
            <li class="order-line">
                <span class="order-line-qty">${item.quantity}×</span>
                <span class="order-line-name">${escapeHtml(item.product_name)}</span>
                <span class="order-line-price">${formatOrderMoney(item.line_total)}</span>
                <button class="qty-btn" type="button" onclick="removeOrderItem(${item.product_id})" aria-label="Quitar uno de ${escapeHtml(item.product_name)}">−</button>
            </li>`).join('');

    const draftRows = [];
    orderDraft.forEach((quantity, productId) => {
        const product = products.find(item => item.id === productId);
        const name = product ? product.name : `Producto ${productId}`;
        draftRows.push(`
            <li class="order-line">
                <span class="order-line-qty">${quantity}×</span>
                <span class="order-line-name">${escapeHtml(name)}</span>
                <button class="qty-btn" type="button" onclick="removeFromOrderDraft(${productId})" aria-label="Quitar uno de ${escapeHtml(name)} de lo que falta por mandar">−</button>
            </li>`);
    });

    let totals = '';
    let actions = '';
    if (currentOrder && items.length > 0) {
        totals = isWaiter
            ? `<div class="total-line final"><span>Subtotal estimado</span><span>${formatOrderMoney(currentOrder.subtotal)}</span></div>`
            : `
                <div class="total-line"><span>Subtotal</span><span>${formatOrderMoney(currentOrder.subtotal)}</span></div>
                <div class="total-line"><span>IVA</span><span>${formatOrderMoney(currentOrder.tax)}</span></div>
                <div class="total-line final"><span>Total</span><span>${formatOrderMoney(currentOrder.total)}</span></div>`;
        if (!isWaiter) {
            actions = `
                <div class="order-actions">
                    <button class="btn btn-success" type="button" onclick="confirmChargeOrder()">Cobrar ${formatOrderMoney(currentOrder.total)}</button>
                    <button class="btn btn-danger btn-compact" type="button" onclick="confirmCancelOrder()">Cancelar comanda</button>
                </div>`;
        }
    } else if (currentOrder) {
        actions = `
            <div class="order-actions">
                <button class="btn btn-danger btn-compact" type="button" onclick="cancelEmptyOrder()">Cancelar mesa</button>
            </div>`;
    }

    const events = currentOrder?.events || [];
    const log = !isWaiter && events.length > 0 ? `
        <details class="order-log">
            <summary>Cambios (${events.length})</summary>
            <ul>${events.map(event => `
                <li>${formatOrderTime(event.created_at)} · ${escapeHtml(event.user)} ${event.action === 'agregar' ? 'agregó' : 'quitó'} ${event.quantity} × ${escapeHtml(event.product_name)}</li>`).join('')}
            </ul>
        </details>` : '';

    panel.innerHTML = `
        <section class="panel order-section" aria-label="Ya en la mesa">
            <div class="panel-heading"><h3>Ya en la mesa</h3></div>
            <ul class="order-lines">${sentRows}</ul>
            ${totals}
            ${actions}
            ${log}
        </section>
        <section class="panel order-section${draftRows.length ? ' has-draft' : ''}" aria-label="Por mandar">
            <div class="panel-heading"><h3>Por mandar</h3></div>
            ${draftRows.length ? `<ul class="order-lines">${draftRows.join('')}</ul>` : '<p class="order-empty">Toca productos del menú para agregarlos.</p>'}
        </section>
    `;
    renderOrderSendBar();
}

/** Dibuja la barra fija "Mandar (n)"; deshabilitada sin productos o mientras se manda. */
function renderOrderSendBar() {
    const bar = document.getElementById('order-send-bar');
    if (!bar) return;
    const count = getOrderDraftCount();
    const label = isSendingOrder ? 'Mandando…' : `Mandar (${count})`;
    bar.innerHTML = `
        <button class="checkout-btn" type="button" onclick="sendOrderDraft()" ${count === 0 || isSendingOrder ? 'disabled' : ''}>${label}</button>
    `;
}

/** Dibuja los filtros de categoría y los productos que se pueden pedir. */
function renderOrderMenu() {
    const tabs = document.getElementById('order-category-tabs');
    const grid = document.getElementById('order-products-grid');
    if (!tabs || !grid) return;

    const sellable = getSellableProducts();
    const chip = (label, count, color = '') => {
        const isActive = orderCategory === label;
        const style = isActive && color ? ` style="border-color:${escapeHtml(color)};background-color:${escapeHtml(color)}"` : '';
        // El nombre va en data-category y no dentro del onclick: así un apóstrofo no rompe el JS.
        return `<button class="category-tab${isActive ? ' active' : ''}" type="button" aria-pressed="${isActive}" data-category="${escapeHtml(label)}" onclick="filterOrderMenu(this.dataset.category)"${style}><span>${escapeHtml(label)}</span><span class="category-count">${count}</span></button>`;
    };
    tabs.innerHTML = chip('Todas', sellable.length) + categories
        .map(category => chip(category.name, sellable.filter(product => product.category === category.name).length, category.color))
        .join('');

    const visible = orderCategory === 'Todas'
        ? sellable
        : sellable.filter(product => product.category === orderCategory);
    grid.innerHTML = visible.length === 0
        ? '<p class="empty-state">No hay productos en esta categoría.</p>'
        : visible.map(product => {
            const imageUrl = getProductImageUrl(product);
            const image = imageUrl
                ? `<img src="${encodeURI(imageUrl)}" alt="" class="product-card-image" width="160" height="110" loading="lazy">`
                : '<span class="product-card-placeholder">Sin imagen</span>';
            return `
                <button class="product-card" type="button" onclick="addToOrderDraft(${product.id})">
                    ${image}
                    <span class="product-name">${escapeHtml(product.name)}</span>
                    <span class="product-price">${formatOrderMoney(product.price)}</span>
                </button>`;
        }).join('');
}

/**
 * Cambia el filtro de categoría del menú de la comanda.
 * @param {string} categoryName - "Todas" o el nombre de una categoría.
 */
function filterOrderMenu(categoryName) {
    orderCategory = categoryName;
    renderOrderMenu();
}

/**
 * Suma una pieza del producto a "Por mandar".
 * @param {number} productId
 */
function addToOrderDraft(productId) {
    orderDraft.set(productId, (orderDraft.get(productId) || 0) + 1);
    renderOrderPanel();
}

/**
 * Resta una pieza del producto en "Por mandar"; en cero lo quita.
 * @param {number} productId
 */
function removeFromOrderDraft(productId) {
    const quantity = (orderDraft.get(productId) || 0) - 1;
    if (quantity > 0) {
        orderDraft.set(productId, quantity);
    } else {
        orderDraft.delete(productId);
    }
    renderOrderPanel();
}

/**
 * Manda "Por mandar" a la mesa: abre la comanda si la mesa estaba libre o
 * agrega a la existente. Si falla, "Por mandar" se conserva para reintentar.
 */
async function sendOrderDraft() {
    if (isSendingOrder || orderDraft.size === 0) return;
    isSendingOrder = true;
    renderOrderSendBar();

    const items = [...orderDraft].map(([productId, quantity]) => ({ product_id: productId, quantity }));
    try {
        currentOrder = currentOrder
            ? await addOrderItemsInApi(currentOrder.id, items)
            : await createOrderInApi({ mesa: currentTable, items });
        orderDraft.clear();
        showNotification(`Pedido mandado a la mesa ${currentTable}.`);
    } catch (error) {
        isSendingOrder = false;
        if (handleOrderSessionError(error)) return;
        await recoverFromOrderError(error);
        return;
    }
    isSendingOrder = false;
    renderOrderView();
}

/**
 * Después de un error al mandar: si otro mesero ya abrió la mesa, carga esa
 * comanda (lo pendiente se agregará al volver a mandar); si la comanda ya se
 * cobró o canceló, regresa a la cuadrícula. "Por mandar" no se pierde.
 * @param {Error} error - Error de la API.
 */
async function recoverFromOrderError(error) {
    showNotification(error.message);
    if (error.status === 409 && !currentOrder) {
        try {
            tablesOverview = await getTablesFromApi();
        } catch (refreshError) {
            renderOrderPanel();
            return;
        }
        const summary = tablesOverview.mesas.find(table => table.mesa === currentTable)?.comanda;
        if (summary) {
            await reloadCurrentOrder(summary.id);
            showNotification(`La mesa ${currentTable} ya estaba abierta: vuelve a tocar "Mandar" para agregar tu pedido.`);
            return;
        }
    } else if (error.status === 409 && currentOrder) {
        const stillOpen = await reloadCurrentOrder();
        if (!stillOpen) return;
    }
    renderOrderPanel();
}

/**
 * Quita una pieza de un producto que ya está en la mesa (queda en la bitácora).
 * @param {number} productId
 */
async function removeOrderItem(productId) {
    if (!currentOrder) return;
    try {
        currentOrder = await removeOrderItemInApi(currentOrder.id, productId, 1);
        renderOrderPanel();
    } catch (error) {
        if (handleOrderSessionError(error)) return;
        showNotification(error.message);
        await reloadCurrentOrder();
    }
}

/** Libera una mesa abierta por error que ya no tiene productos. */
async function cancelEmptyOrder() {
    if (!currentOrder) return;
    try {
        await cancelOrderInApi(currentOrder.id);
        showNotification(`Mesa ${currentTable} liberada.`);
        leaveOrderView();
    } catch (error) {
        if (handleOrderSessionError(error)) return;
        showNotification(error.message);
        await reloadCurrentOrder();
    }
}

/* ---------- Cobro y cancelación (cajero) ---------- */

/** Pide confirmación con el desglose y cobra la comanda. */
function confirmChargeOrder() {
    if (!currentOrder) return;
    const order = currentOrder;
    const table = currentTable;
    openActionModal(
        `Cobrar mesa ${table}`,
        `Se registrará la venta: subtotal ${formatOrderMoney(order.subtotal)} + IVA ${formatOrderMoney(order.tax)} = ${formatOrderMoney(order.total)} MXN. La mesa quedará libre.`,
        'Cobrar',
        () => chargeCurrentOrder(order.id, table)
    );
}

/**
 * Cobra la comanda y actualiza catálogo (stock), resumen de hoy, historial y caja.
 * @param {number} orderId
 * @param {number} table - Mesa, para el aviso.
 */
async function chargeCurrentOrder(orderId, table) {
    let sale;
    try {
        sale = await chargeOrderInApi(orderId);
    } catch (error) {
        if (handleOrderSessionError(error)) return;
        showNotification(`No se pudo cobrar la mesa ${table}: ${error.message}`);
        await reloadCurrentOrder(orderId);
        return;
    }
    showNotification(`Venta #${sale.id} registrada por ${formatOrderMoney(sale.total)} MXN`);
    leaveOrderView();
    await Promise.allSettled([
        refreshCatalog(),
        refreshCashBoxView(),
        updateTodaySalesSummary(),
        loadSalesHistoryTab()
    ]);
}

/** Pide el motivo y cancela una comanda con productos (no se registra venta). */
async function confirmCancelOrder() {
    if (!currentOrder) return;
    const order = currentOrder;
    const table = currentTable;
    const reason = await openInputModal({
        eyebrow: 'Cancelar comanda',
        title: `Mesa ${table}`,
        message: 'La mesa quedará libre y no se registrará venta.',
        label: 'Motivo',
        maxLength: 255,
        confirmLabel: 'Cancelar comanda',
        danger: true,
        validate: value => (value.trim() ? '' : 'Escribe el motivo de la cancelación.')
    });
    if (reason === null) return;
    try {
        await cancelOrderInApi(order.id, reason.trim());
        showNotification(`Comanda de la mesa ${table} cancelada.`);
        leaveOrderView();
    } catch (error) {
        if (handleOrderSessionError(error)) return;
        showNotification(error.message);
        await reloadCurrentOrder(order.id);
    }
}

// Al volver a la pestaña del navegador, la cuadrícula se pone al día de inmediato.
document.addEventListener('visibilitychange', () => {
    const gridVisible = document.body.dataset.tab === 'tables' && currentTable === null;
    if (document.visibilityState === 'visible' && gridVisible && adminSession) {
        refreshTables({ quiet: true });
    }
});
