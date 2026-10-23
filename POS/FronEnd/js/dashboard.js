/*
 * PANEL DEL ADMINISTRADOR
 * Métricas del periodo, gráfica de ventas por día, stock bajo y ventas recientes.
 */

/** Devuelve las ventas locales incluidas en el periodo seleccionado. */
function getAdminDashboardSales(period) {
    const now = new Date();
    const today = getLocalDateKey(now);
    if (period === 'today') {
        return salesHistory.filter(sale => getLocalDateKey(new Date(sale.date)) === today);
    }
    if (period === 'all') return salesHistory;

    const days = Number(period);
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - days + 1);
    return salesHistory.filter(sale => new Date(sale.date) >= start && new Date(sale.date) <= now);
}

/** Calcula y dibuja las métricas con los datos guardados en este navegador. */
function renderAdminDashboard() {
    if (adminSession?.role !== 'admin') return;
    const period = document.getElementById('dashboard-period')?.value || 'today';
    const sales = getAdminDashboardSales(period);
    const total = sales.reduce((sum, sale) => sum + (Number(sale.total) || 0), 0);
    const transactions = sales.length;
    const items = sales.reduce((sum, sale) => sum + (Number(sale.items) || 0), 0);
    const average = transactions ? total / transactions : 0;
    const currency = amount => `$${amount.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    document.getElementById('admin-metric-sales').textContent = currency(total);
    document.getElementById('admin-metric-count').textContent = transactions.toLocaleString('es-MX');
    document.getElementById('admin-metric-average').textContent = currency(average);
    document.getElementById('admin-metric-items').textContent = items.toLocaleString('es-MX');

    const chart = document.getElementById('admin-sales-chart');
    const chartCaption = document.getElementById('admin-chart-caption');
    const salesCaption = document.getElementById('admin-metric-sales-caption');
    let days;
    if (period === 'today') {
        days = [new Date()];
    } else if (period === 'all') {
        const dates = [...new Set(sales.map(sale => getLocalDateKey(new Date(sale.date))))].sort();
        days = dates.slice(-14).map(dateKey => new Date(`${dateKey}T12:00:00`));
    } else {
        const periodDays = Number(period);
        days = Array.from({ length: periodDays }, (_, index) => {
            const date = new Date();
            date.setDate(date.getDate() - periodDays + index + 1);
            return date;
        });
    }
    const totalsByDay = new Map();
    sales.forEach(sale => {
        const dateKey = getLocalDateKey(new Date(sale.date));
        totalsByDay.set(dateKey, (totalsByDay.get(dateKey) || 0) + (Number(sale.total) || 0));
    });
    const chartData = days.map(date => ({
        date,
        total: totalsByDay.get(getLocalDateKey(date)) || 0
    }));
    const maxDailySales = Math.max(...chartData.map(day => day.total), 1);
    if (chart) {
        chart.innerHTML = chartData.length ? chartData.map(day => {
            const label = day.date.toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric' });
            const height = day.total ? Math.max((day.total / maxDailySales) * 100, 5) : 2;
            return `<div class="dashboard-chart-column" title="${label}: ${currency(day.total)}"><span>${currency(day.total)}</span><div class="dashboard-chart-track"><i style="height:${height}%"></i></div><small>${label}</small></div>`;
        }).join('') : '<p class="dashboard-empty">Todavía no hay ventas para mostrar.</p>';
    }
    const rangeText = period === 'today' ? 'Hoy' : period === 'all' ? 'Todo el historial' : `Últimos ${period} días`;
    if (chartCaption) chartCaption.textContent = rangeText;
    if (salesCaption) salesCaption.textContent = rangeText;

    // Alertas del almacén: consumibles de venta e insumos (vasos, platos…).
    const stockAlerts = [...products.filter(isInventoryTracked), ...supplies].filter(product => {
        const stock = getProductStock(product);
        return stock !== null && stock <= getProductMinimumStock(product);
    });
    const stockCount = document.getElementById('admin-stock-count');
    const stockList = document.getElementById('admin-stock-alerts');
    if (stockCount) stockCount.textContent = `${stockAlerts.length} ${stockAlerts.length === 1 ? 'producto' : 'productos'}`;
    if (stockList) {
        stockList.innerHTML = stockAlerts.length ? stockAlerts.slice(0, 6).map(product => `
            <div class="dashboard-stock-item"><span>${escapeHtml(product.name)}</span><strong>${getProductStock(product)} / ${getProductMinimumStock(product)}</strong></div>
        `).join('') : '<p class="dashboard-empty">No hay productos con stock bajo.</p>';
    }

    const recent = [...salesHistory].sort((left, right) => new Date(right.date) - new Date(left.date)).slice(0, 5);
    const recentList = document.getElementById('admin-recent-sales');
    if (recentList) {
        recentList.innerHTML = recent.length ? recent.map(sale => {
            const date = new Date(sale.date);
            return `<div class="dashboard-recent-row"><span>#${escapeHtml(String(sale.id))}</span><time>${date.toLocaleDateString('es-MX')} ${date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</time><span>${Number(sale.items) || 0} artículos</span><strong>${currency(Number(sale.total) || 0)}</strong></div>`;
        }).join('') : '<p class="dashboard-empty">Todavía no hay ventas registradas.</p>';
    }
}
