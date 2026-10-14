/*
 * NAVEGACIÓN
 * Decide qué pantalla se muestra, limita las secciones por perfil y exige al
 * cajero abrir la jornada antes de vender. También muestra la fecha del día.
 */

const ADMIN_TABS = ['admin-dashboard', 'admin', 'warehouse', 'categories', 'settings'];

function updateBusinessDate() {
    const dateElement = document.getElementById('current-business-date');
    if (!dateElement) return;
    dateElement.textContent = new Intl.DateTimeFormat('es-MX', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    }).format(new Date());
}

/**
 * Cambia entre las pestañas del sistema
 * @param {string} tabName - Nombre de la pestaña a mostrar
 */
function showTab(tabName) {
    if (ADMIN_TABS.includes(tabName) && adminSession?.role !== 'admin') {
        showNotification('Esta sección requiere acceso de administrador.');
        return;
    }

    // El administrador solo revisa métricas y administra productos: no se le pide
    // iniciar jornada. Solo la necesita si entra a vender desde la pestaña Venta.
    const requiresOpeningCash = adminSession?.role === 'admin'
        ? tabName === 'pos'
        : tabName !== 'cashbox' && tabName !== 'admin-dashboard';
    if (requiresOpeningCash && shouldOpenCashBoxForToday()) {
        showNotification('🔒 Registra primero el fondo inicial para continuar.');
        showTab('cashbox');
        focusOpeningCashField();
        return;
    }

    document.querySelectorAll('.tab').forEach(tab => {
        const isActive = tab.dataset.tab === tabName;
        tab.classList.toggle('active', isActive);
        if (isActive) {
            tab.setAttribute('aria-current', 'page');
        } else {
            tab.removeAttribute('aria-current');
        }
    });
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    const content = document.getElementById(`${tabName}-tab`);
    content.classList.add('active');
    content.scrollTop = 0;

    // Recuerda la pantalla para reabrirla al recargar y permite estilos por pantalla.
    document.body.dataset.tab = tabName;
    localStorage.setItem(CURRENT_TAB_STORAGE_KEY, tabName);

    // Cargar datos específicos de la pestaña
    if (tabName === 'admin') {
        loadProductList();
        loadCategorySelector();
    } else if (tabName === 'categories') {
        loadCategoryList();
    } else if (tabName === 'warehouse') {
        loadWarehouse();
    } else if (tabName === 'sales') {
        loadSalesHistoryTab();
    } else if (tabName === 'cashbox') {
        loadCashBoxTab();
    } else if (tabName === 'settings') {
        displayExchangeRate();
        displayTaxRate();
    } else if (tabName === 'admin-dashboard') {
        renderAdminDashboard();
    }
}
