/*
 * HISTORIAL DE VENTAS
 * Lista y resumen de ventas con filtros por periodo, fechas y búsqueda,
 * totales del día, exportación, verificación y cancelación. Las ventas viven
 * en el servidor (/api/ventas/): el cajero solo ve las de la jornada de hoy.
 */

const SALE_STATUS_LABELS = { abierta: 'Abierta', cerrada: 'Cerrada', cancelada: 'Cancelada' };
const SALE_STATUS_CLASSES = { abierta: 'open', cerrada: 'closed', cancelada: 'cancelled' };

// Cada carga del historial lleva un número; si llega tarde la respuesta de una
// búsqueda anterior, se descarta para no pisar la más reciente.
let salesRequestId = 0;
let salesSearchTimer = null;

/**
 * Filtros de la pantalla de Ventas para la API. El rango de fechas, si se
 * llenó, manda sobre "Filtrar por". Las fechas son de la jornada de caja.
 * @returns {{desde: string, hasta: string, q: string}}
 */
function getSalesFilters() {
    const startDate = document.getElementById('start-date')?.value || '';
    const endDate = document.getElementById('end-date')?.value || '';
    const q = document.getElementById('sales-search')?.value.trim() || '';
    if (startDate || endDate) return { desde: startDate, hasta: endDate, q };

    const today = new Date();
    const todayKey = getLocalDateKey(today);
    const period = document.getElementById('date-filter')?.value || 'today';
    if (period === 'today') return { desde: todayKey, hasta: todayKey, q };
    if (period === 'week') {
        // La semana empieza en lunes.
        const monday = new Date(today);
        monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
        return { desde: getLocalDateKey(monday), hasta: todayKey, q };
    }
    if (period === 'month') {
        return { desde: getLocalDateKey(new Date(today.getFullYear(), today.getMonth(), 1)), hasta: todayKey, q };
    }
    return { desde: '', hasta: '', q };
}

/**
 * Carga y muestra la pestaña de historial de ventas con los filtros actuales.
 */
async function loadSalesHistoryTab() {
    const salesList = document.getElementById('sales-list');
    if (!salesList || !adminSession) return;

    // Verificar solo lo puede hacer el administrador.
    const verifyButton = document.getElementById('verify-sales-btn');
    if (verifyButton) verifyButton.hidden = adminSession.role !== 'admin';

    const requestId = ++salesRequestId;
    const filters = getSalesFilters();
    let sales;
    let summary;
    try {
        [sales, summary] = await Promise.all([getSalesFromApi(filters), getSalesSummaryFromApi(filters)]);
    } catch (error) {
        if (requestId !== salesRequestId) return;
        console.error('Error al cargar las ventas:', error);
        salesList.innerHTML = `<div class="empty-sales"><p>No se pudieron cargar las ventas<br>${escapeHtml(error.message)}</p></div>`;
        return;
    }
    if (requestId !== salesRequestId) return;

    updateSalesSummary(summary);

    if (sales.length === 0) {
        salesList.innerHTML = `
            <div class="empty-sales">
                <p>No hay ventas en este periodo<br>Las ventas aparecerán aquí</p>
            </div>
        `;
        return;
    }

    salesList.innerHTML = '';
    const isAdmin = adminSession.role === 'admin';

    // El servidor ya las manda de la más reciente a la más antigua.
    sales.forEach(sale => {
        const date = new Date(sale.created_at);
        const formattedDate = date.toLocaleDateString('es-MX', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
        const formattedTime = date.toLocaleTimeString('es-MX', {
            hour: '2-digit',
            minute: '2-digit'
        });
        const isCancelled = sale.status === 'cancelada';

        const saleItem = document.createElement('div');
        saleItem.className = `sale-item${isCancelled ? ' is-cancelled' : ''}`;

        const productsHTML = sale.items.map(item =>
            `${item.quantity}x ${escapeHtml(item.product_name)} ($${Number(item.unit_price).toFixed(2)})`
        ).join(', ');
        const cancelDetail = isCancelled
            ? `<div class="sale-date">Cancelada por ${escapeHtml(sale.cancelled_by || '')}${sale.cancel_reason ? `: ${escapeHtml(sale.cancel_reason)}` : ''}</div>`
            : '';
        // Solo se cancelan ventas de la jornada abierta; el servidor lo vuelve a revisar.
        const cancelButton = isAdmin && sale.status === 'abierta'
            ? `<button class="btn btn-danger btn-compact" type="button" onclick="cancelSale(${sale.id})">Cancelar</button>`
            : '';

        saleItem.innerHTML = `
            <div class="sale-info">
                <div class="sale-id">Venta #${sale.id}</div>
                <div class="sale-date">${formattedDate} - ${formattedTime} · ${escapeHtml(sale.cashier)}</div>
                <div class="sale-products">${productsHTML || 'Sin detalles'}</div>
                ${cancelDetail}
            </div>
            <div class="sale-stats">
                <div class="sale-items">${sale.items_count} items</div>
                <div class="sale-total">$${Number(sale.total).toFixed(2)}</div>
                <div class="sale-status ${SALE_STATUS_CLASSES[sale.status] || 'open'}">
                    ${SALE_STATUS_LABELS[sale.status] || sale.status}
                </div>
                ${cancelButton}
            </div>
        `;

        salesList.appendChild(saleItem);
    });
}

/**
 * Muestra el resumen de ventas del periodo (sin canceladas).
 * @param {{total_sales: string, transactions: number, items: number, average_sale: string}} summary
 */
function updateSalesSummary(summary) {
    const totalSalesEl = document.getElementById('total-sales');
    const totalTransactionsEl = document.getElementById('total-transactions');
    const totalItemsEl = document.getElementById('total-items');
    const averageSaleEl = document.getElementById('average-sale');

    if (totalSalesEl) totalSalesEl.textContent = `$${Number(summary.total_sales).toFixed(2)}`;
    if (totalTransactionsEl) totalTransactionsEl.textContent = summary.transactions;
    if (totalItemsEl) totalItemsEl.textContent = summary.items;
    if (averageSaleEl) averageSaleEl.textContent = `$${Number(summary.average_sale).toFixed(2)}`;
}

/** Actualiza el resumen de ventas del día en la pantalla de Venta y en el panel. */
async function updateTodaySalesSummary() {
    // Sin sesión no hay token para consultar el servidor.
    if (!adminSession) return;
    const todayKey = getLocalDateKey();
    let summary;
    try {
        summary = await getSalesSummaryFromApi({ desde: todayKey, hasta: todayKey });
    } catch (error) {
        console.error('Error al consultar las ventas de hoy:', error);
        return;
    }
    const total = document.getElementById('today-sales-total');
    const count = document.getElementById('today-sales-count');
    const items = document.getElementById('today-items-count');
    if (total) total.textContent = `$${Number(summary.total_sales).toFixed(2)}`;
    if (count) count.textContent = summary.transactions;
    if (items) items.textContent = summary.items;
    if (adminSession?.role === 'admin' && document.getElementById('admin-dashboard-tab')?.classList.contains('active')) {
        renderAdminDashboard();
    }
}

/** Cambio en el rango de fechas: vuelve a consultar. */
function filterSales() {
    loadSalesHistoryTab();
}

/** Cambio en "Filtrar por": el periodo sustituye al rango de fechas que hubiera. */
function filterSalesByPeriod() {
    document.getElementById('start-date').value = '';
    document.getElementById('end-date').value = '';
    loadSalesHistoryTab();
}

/** Búsqueda por número de venta (acepta "#12") o por producto, con una pausa al escribir. */
function searchSales() {
    clearTimeout(salesSearchTimer);
    salesSearchTimer = setTimeout(loadSalesHistoryTab, 300);
}

/** Descarga en CSV las ventas que se están viendo (lo genera el servidor). */
async function exportSales() {
    try {
        await downloadFileFromApi(`/ventas/exportar/${buildQueryString(getSalesFilters())}`, `ventas_${getLocalDateKey()}.csv`);
        showNotification('Ventas exportadas');
    } catch (error) {
        console.error('Error al exportar ventas:', error);
        showNotification(`No se pudo exportar: ${error.message}`);
    }
}

/** Revisa en el servidor que los montos de las ventas filtradas cuadren. */
async function verifySalesIntegrity() {
    try {
        const result = await verifySalesInApi(getSalesFilters());
        if (result.with_errors === 0) {
            alert(`Ventas verificadas: ${result.checked} registros correctos`);
        } else {
            const ids = result.errors.map(error => `#${error.sale_id}`).join(', ');
            alert(`Se revisaron ${result.checked} ventas: ${result.with_errors} con montos que no cuadran (${ids}).`);
        }
    } catch (error) {
        console.error('Error al verificar ventas:', error);
        showNotification(`No se pudo verificar: ${error.message}`);
    }
}

/**
 * Cancela una venta de la jornada abierta (solo administrador). El servidor
 * regresa al stock lo vendido; la venta se conserva marcada como cancelada.
 * @param {number} saleId - ID de la venta.
 */
async function cancelSale(saleId) {
    const reason = prompt(`Cancelar la venta #${saleId}. Se regresará al almacén lo vendido.\n\nMotivo (opcional):`);
    if (reason === null) return;

    try {
        await cancelSaleInApi(saleId, reason.trim());
    } catch (error) {
        console.error('Error al cancelar la venta:', error);
        showNotification(`No se pudo cancelar la venta: ${error.message}`);
        return;
    }
    showNotification(`Venta #${saleId} cancelada`);
    loadSalesHistoryTab();
    updateTodaySalesSummary();
    // El stock de los productos controlados cambió en el servidor.
    refreshCatalog().catch(error => console.error('Error al recargar el catálogo:', error));
}
