/*
 * PANEL DEL ADMINISTRADOR
 * Métricas del periodo, gráfica de ventas por día, alertas de reabastecimiento
 * y ventas recientes. Todo sale del servidor (/api/reportes/, /api/ventas/ y
 * /api/inventario/alertas/), así que muestra lo de todas las cajas.
 */

// Con "Todo el historial" la gráfica muestra solo los últimos días, para que se lea.
const DASHBOARD_ALL_CHART_DAYS = 14;
// "Ventas recientes" busca en este número de días hacia atrás.
const DASHBOARD_RECENT_DAYS = 30;
const RESTOCK_LEVEL_LABELS = { critico: 'Crítico', bajo: 'Bajo', sin_registrar: 'Sin registrar', ok: 'Bien' };

// Igual que en Ventas: si cambian rápido el periodo, solo se dibuja la respuesta más reciente.
let dashboardRequestId = 0;

/**
 * Fecha AAAA-MM-DD de hace cierto número de días.
 * @param {number} daysAgo - 0 es hoy.
 * @returns {string}
 */
function getDateKeyDaysAgo(daysAgo) {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return getLocalDateKey(date);
}

/**
 * Rangos de fechas del periodo elegido: uno para las métricas y otro para la
 * gráfica (con "Todo el historial" las métricas no llevan rango).
 * @param {string} period - today, 7, 30 o all.
 * @returns {{metrics: Object, chart: Object}}
 */
function getDashboardRanges(period) {
    const today = getLocalDateKey();
    if (period === 'today') {
        const range = { desde: today, hasta: today };
        return { metrics: range, chart: range };
    }
    if (period === 'all') {
        return { metrics: {}, chart: { desde: getDateKeyDaysAgo(DASHBOARD_ALL_CHART_DAYS - 1), hasta: today } };
    }
    const range = { desde: getDateKeyDaysAgo(Number(period) - 1), hasta: today };
    return { metrics: range, chart: range };
}

/** Pide al servidor los datos del periodo seleccionado y dibuja el panel. */
async function renderAdminDashboard() {
    if (adminSession?.role !== 'admin') return;
    const period = document.getElementById('dashboard-period')?.value || 'today';
    const ranges = getDashboardRanges(period);
    const requestId = ++dashboardRequestId;

    const [summaryResult, chartResult, alertsResult, recentResult] = await Promise.allSettled([
        getReportSummaryFromApi(ranges.metrics),
        getSalesByDayFromApi(ranges.chart),
        getRestockAlertsFromApi(),
        getSalesFromApi({ desde: getDateKeyDaysAgo(DASHBOARD_RECENT_DAYS - 1) })
    ]);
    if (requestId !== dashboardRequestId) return;

    const failed = [summaryResult, chartResult, alertsResult, recentResult].find(result => result.status === 'rejected');
    if (failed) {
        console.error('Error al cargar el panel:', failed.reason);
        showNotification(`No se pudo cargar todo el panel: ${failed.reason.message}`);
    }

    const currency = amount => `$${amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const rangeText = period === 'today' ? 'Hoy' : period === 'all' ? 'Todo el historial' : `Últimos ${period} días`;

    if (summaryResult.status === 'fulfilled') {
        const summary = summaryResult.value;
        document.getElementById('admin-metric-sales').textContent = currency(Number(summary.total_sales));
        document.getElementById('admin-metric-count').textContent = summary.transactions.toLocaleString('es-MX');
        document.getElementById('admin-metric-average').textContent = currency(Number(summary.average_sale));
        document.getElementById('admin-metric-items').textContent = summary.items.toLocaleString('es-MX');
    }
    const salesCaption = document.getElementById('admin-metric-sales-caption');
    if (salesCaption) salesCaption.textContent = rangeText;

    const chart = document.getElementById('admin-sales-chart');
    const chartCaption = document.getElementById('admin-chart-caption');
    if (chartCaption) {
        chartCaption.textContent = period === 'all' ? `Últimos ${DASHBOARD_ALL_CHART_DAYS} días` : rangeText;
    }
    if (chart && chartResult.status === 'fulfilled') {
        const chartData = chartResult.value.days.map(day => ({
            date: new Date(`${day.date}T12:00:00`),
            total: Number(day.total)
        }));
        const maxDailySales = Math.max(...chartData.map(day => day.total), 1);
        chart.innerHTML = chartData.length ? chartData.map(day => {
            const label = day.date.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' });
            const height = day.total ? Math.max((day.total / maxDailySales) * 100, 5) : 2;
            return `<div class="dashboard-chart-column" title="${label}: ${currency(day.total)}"><span>${currency(day.total)}</span><div class="dashboard-chart-track"><i style="height:${height}%"></i></div><small>${label}</small></div>`;
        }).join('') : '<p class="dashboard-empty">Todavía no hay ventas para mostrar.</p>';
    }

    // Alertas del algoritmo de reabastecimiento: productos controlados e insumos.
    const stockCount = document.getElementById('admin-stock-count');
    const stockList = document.getElementById('admin-stock-alerts');
    if (alertsResult.status === 'fulfilled') {
        const alerts = alertsResult.value.items;
        if (stockCount) stockCount.textContent = `${alerts.length} ${alerts.length === 1 ? 'artículo' : 'artículos'}`;
        if (stockList) {
            stockList.innerHTML = alerts.length ? alerts.slice(0, 6).map(alert => {
                const suggestion = alert.suggested_quantity > 0 ? ` · pedir ${alert.suggested_quantity}` : '';
                return `
                <div class="dashboard-stock-item"><span>${escapeHtml(alert.name)}<small class="dashboard-stock-detail level-${alert.level}">${RESTOCK_LEVEL_LABELS[alert.level] || alert.level}${suggestion}</small></span><strong>${alert.stock ?? '—'} / ${alert.minimum_stock}</strong></div>
            `;
            }).join('') : '<p class="dashboard-empty">No hay artículos por reabastecer.</p>';
        }
    }

    const recentList = document.getElementById('admin-recent-sales');
    if (recentList && recentResult.status === 'fulfilled') {
        const recent = recentResult.value.slice(0, 5);
        recentList.innerHTML = recent.length ? recent.map(sale => {
            const date = new Date(sale.created_at);
            const cancelled = sale.status === 'cancelada' ? ' (cancelada)' : '';
            return `<div class="dashboard-recent-row"><span>#${sale.id}</span><time>${date.toLocaleDateString('es-MX')} ${date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</time><span>${sale.items_count} artículos${cancelled}</span><strong>${currency(Number(sale.total))}</strong></div>`;
        }).join('') : '<p class="dashboard-empty">Todavía no hay ventas registradas.</p>';
    }
}
