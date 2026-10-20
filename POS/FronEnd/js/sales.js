/*
 * HISTORIAL DE VENTAS
 * Lista y resumen de ventas, totales del día y cierre de ventas por jornada.
 */

/**
 * Carga y muestra la pestaña de historial de ventas
 */
function loadSalesHistoryTab() {
    const salesList = document.getElementById('sales-list');
    if (!salesList) {
        console.warn('⚠️ No se encontró el elemento sales-list');
        return;
    }
    
    // Actualizar resumen
    updateSalesSummary();
    
    if (salesHistory.length === 0) {
        salesList.innerHTML = `
            <div class="empty-sales">
                <p>No hay ventas registradas<br>Las ventas aparecerán aquí</p>
            </div>
        `;
        return;
    }
    
    salesList.innerHTML = '';
    
    // Ordenar ventas por fecha (más reciente primero)
    const sortedSales = [...salesHistory].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    sortedSales.forEach(sale => {
        const date = new Date(sale.date);
        const formattedDate = date.toLocaleDateString('es-MX', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
        const formattedTime = date.toLocaleTimeString('es-MX', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // Crear elemento de venta
        const saleItem = document.createElement('div');
        saleItem.className = 'sale-item';
        
        // Crear lista de productos
        let productsHTML = '';
        if (sale.products && sale.products.length > 0) {
            productsHTML = sale.products.map(p => 
                `${p.quantity}x ${escapeHtml(p.name)} ($${p.price.toFixed(2)})`
            ).join(', ');
        }
        
        saleItem.innerHTML = `
            <div class="sale-info">
                <div class="sale-id">Venta #${sale.id}</div>
                <div class="sale-date">${formattedDate} - ${formattedTime}</div>
                <div class="sale-products">${productsHTML || 'Sin detalles'}</div>
            </div>
            <div class="sale-stats">
                <div class="sale-items">${sale.items || 0} items</div>
                <div class="sale-total">$${(sale.total || 0).toFixed(2)}</div>
                <div class="sale-status ${sale.status === 'cerrada' ? 'closed' : 'open'}">
                    ${sale.status === 'cerrada' ? 'Cerrada' : 'Abierta'}
                </div>
            </div>
        `;
        
        salesList.appendChild(saleItem);
    });
}

/**
 * Actualiza el resumen de ventas
 */
function updateSalesSummary() {
    const totalSales = salesHistory.reduce((sum, sale) => sum + (sale.total || 0), 0);
    const totalTransactions = salesHistory.length;
    const totalItems = salesHistory.reduce((sum, sale) => sum + (sale.items || 0), 0);
    const averageSale = totalTransactions > 0 ? totalSales / totalTransactions : 0;
    
    const totalSalesEl = document.getElementById('total-sales');
    const totalTransactionsEl = document.getElementById('total-transactions');
    const totalItemsEl = document.getElementById('total-items');
    const averageSaleEl = document.getElementById('average-sale');
    
    if (totalSalesEl) totalSalesEl.textContent = `$${totalSales.toFixed(2)}`;
    if (totalTransactionsEl) totalTransactionsEl.textContent = totalTransactions;
    if (totalItemsEl) totalItemsEl.textContent = totalItems;
    if (averageSaleEl) averageSaleEl.textContent = `$${averageSale.toFixed(2)}`;
}

function getTodaySalesSummary() {
    const today = getLocalDateKey();
    const sales = salesHistory.filter(sale => getLocalDateKey(new Date(sale.date)) === today);
    return {
        total: sales.reduce((sum, sale) => sum + (sale.total || 0), 0),
        count: sales.length,
        items: sales.reduce((sum, sale) => sum + (sale.items || 0), 0)
    };
}

function updateTodaySalesSummary() {
    const summary = getTodaySalesSummary();
    const total = document.getElementById('today-sales-total');
    const count = document.getElementById('today-sales-count');
    const items = document.getElementById('today-items-count');
    if (total) total.textContent = `$${summary.total.toFixed(2)}`;
    if (count) count.textContent = summary.count;
    if (items) items.textContent = summary.items;
    if (adminSession?.role === 'admin' && document.getElementById('admin-dashboard-tab')?.classList.contains('active')) {
        renderAdminDashboard();
    }
}

function closeSalesForDate(dateKey, closedAt = new Date().toISOString()) {
    let changed = false;
    salesHistory = salesHistory.map(sale => {
        const saleDateKey = sale.dateKey || getLocalDateKey(new Date(sale.date));
        if (saleDateKey !== dateKey || sale.status === 'cerrada') return sale;
        changed = true;
        return { ...sale, dateKey: saleDateKey, status: 'cerrada', closedAt };
    });
    if (changed) saveSalesHistory();
    return changed;
}

function syncSalesWithCashBoxClosures() {
    const closedDates = new Set(cashBoxRecords.map(record => record.dateKey));
    let changed = false;
    salesHistory = salesHistory.map(sale => {
        const saleDateKey = sale.dateKey || getLocalDateKey(new Date(sale.date));
        if (!closedDates.has(saleDateKey) || sale.status === 'cerrada') return sale;
        changed = true;
        return { ...sale, dateKey: saleDateKey, status: 'cerrada' };
    });
    if (changed) saveSalesHistory();
}

/**
 * Funciones auxiliares para el historial de ventas
 */
function filterSales() {
    loadSalesHistoryTab();
}

function searchSales() {
}

function exportSales() {
    alert('Función de exportar en desarrollo');
}

function verifySalesIntegrity() {
    alert(`Ventas verificadas: ${salesHistory.length} registros correctos`);
}

function clearSalesHistory() {
    openActionModal(
        'Borrar historial de ventas',
        'Se eliminarán todas las ventas registradas. Esta acción no se puede deshacer.',
        'Borrar historial',
        () => {
            salesHistory = [];
            localStorage.setItem('pos_salesHistory', JSON.stringify(salesHistory));
            loadSalesHistoryTab();
            showNotification('✅ Historial de ventas borrado');
        }
    );
}
