/*
 * NAVEGACIÓN
 * Decide qué pantalla se muestra, limita las secciones por perfil y exige al
 * cajero abrir la jornada antes de vender. También muestra la fecha del día.
 */

const ADMIN_TABS = ['admin-dashboard', 'admin', 'warehouse', 'categories', 'settings', 'users'];
// El administrador no vende: solo revisa ventas y cierres desde sus pestañas.
const CASHIER_TABS = ['pos'];

/** Muestra la fecha de hoy en el encabezado, en formato largo en español. */
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
    const isAdmin = adminSession?.role === 'admin';
    if (CASHIER_TABS.includes(tabName) && isAdmin) {
        tabName = 'admin-dashboard';
    }

    // Solo el cajero inicia jornada; el administrador nunca registra fondo inicial.
    const requiresOpeningCash = !isAdmin
        && tabName !== 'cashbox' && tabName !== 'admin-dashboard';
    if (requiresOpeningCash && shouldOpenCashBoxForToday()) {
        showNotification('Registra primero el fondo inicial para continuar.');
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
    if (isAdmin) {
        expandAdminNavGroupFor(tabName);
        closeAdminNav();
    }
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
    } else if (tabName === 'users') {
        loadUsers();
    }
}

/*
 * MENÚ LATERAL DEL ADMINISTRADOR
 * Grupos desplegables (Ventas, Inventario, Sistema) y, en celular, el cajón
 * que se abre con el botón de menú de la barra superior.
 */

/**
 * Abre o cierra un grupo del menú lateral.
 * @param {HTMLButtonElement} toggle - Botón del grupo (lleva aria-controls).
 * @param {boolean} [expanded] - Estado deseado; si se omite, alterna el actual.
 */
function toggleAdminNavGroup(toggle, expanded) {
    const isExpanded = expanded ?? toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(isExpanded));
    document.getElementById(toggle.getAttribute('aria-controls')).hidden = !isExpanded;
}

/**
 * Abre el grupo que contiene la pantalla indicada para que la opción activa
 * siempre quede a la vista. Los demás grupos se quedan como estaban.
 * @param {string} tabName - Nombre de la pantalla (data-tab).
 */
function expandAdminNavGroupFor(tabName) {
    const button = document.querySelector(`#admin-nav .tab[data-tab="${tabName}"]`);
    const group = button?.closest('.admin-nav-group');
    if (group) toggleAdminNavGroup(group.querySelector('.admin-nav-group-toggle'), true);
}

/**
 * Abre o cierra el menú lateral en celular. En pantallas anchas el menú
 * siempre está visible y la clase no tiene efecto.
 * @param {boolean} [open] - Estado deseado; si se omite, alterna el actual.
 */
function toggleAdminNav(open) {
    const isOpen = open ?? !document.body.classList.contains('admin-nav-open');
    document.body.classList.toggle('admin-nav-open', isOpen);
    document.getElementById('admin-nav-toggle').setAttribute('aria-expanded', String(isOpen));
}

/** Cierra el menú lateral en celular (al elegir una opción, tocar el fondo o pulsar Esc). */
function closeAdminNav() {
    toggleAdminNav(false);
}

document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.body.classList.contains('admin-nav-open')) {
        closeAdminNav();
        document.getElementById('admin-nav-toggle').focus();
    }
});
