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
        openWarehouseTab();
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
 * Grupos desplegables (Ventas, Inventario, Sistema). En celular el menú es un
 * cajón que se abre con el botón de la barra superior; en pantallas anchas ese
 * mismo botón lo contrae a iconos. Con el menú contraído, tocar el icono de un
 * grupo lo despliega completo encima de la pantalla con ese grupo abierto, y
 * al elegir una opción, tocar fuera o pulsar Esc vuelve a iconos. La
 * preferencia de contraído se recuerda en este navegador.
 */

const ADMIN_NAV_COLLAPSED_KEY = 'pos_admin_nav_collapsed';
// Debe coincidir con el corte de celular de styles.css (max-width: 699px).
const MOBILE_NAV_QUERY = window.matchMedia('(max-width: 699px)');

/**
 * Indica si el menú está contraído a iconos. En celular nunca lo está: ahí
 * manda el cajón, aunque la preferencia guardada diga lo contrario.
 * @returns {boolean}
 */
function isAdminNavCollapsed() {
    return !MOBILE_NAV_QUERY.matches && document.body.classList.contains('admin-nav-collapsed');
}

/**
 * Indica si el menú contraído está desplegado temporalmente encima de la pantalla.
 * @returns {boolean}
 */
function isAdminNavPeeking() {
    return isAdminNavCollapsed() && document.body.classList.contains('admin-nav-peek');
}

/**
 * Despliega el menú contraído encima de la pantalla o lo regresa a iconos.
 * Al regresar se cierran los grupos, porque en iconos no se ven.
 * @param {boolean} peeking - true para desplegarlo.
 */
function setAdminNavPeeking(peeking) {
    document.body.classList.toggle('admin-nav-peek', peeking);
    if (!peeking) collapseAllAdminNavGroups();
}

/**
 * Abre o cierra un grupo del menú lateral. Si el menú está contraído, primero
 * lo despliega encima de la pantalla para que se vean las opciones del grupo.
 * @param {HTMLButtonElement} toggle - Botón del grupo (lleva aria-controls).
 * @param {boolean} [expanded] - Estado deseado; si se omite, alterna el actual.
 */
function toggleAdminNavGroup(toggle, expanded) {
    const isExpanded = expanded ?? toggle.getAttribute('aria-expanded') !== 'true';
    if (isExpanded && isAdminNavCollapsed() && !isAdminNavPeeking()) {
        setAdminNavPeeking(true);
    }
    toggle.setAttribute('aria-expanded', String(isExpanded));
    document.getElementById(toggle.getAttribute('aria-controls')).hidden = !isExpanded;
}

/** Cierra todos los grupos del menú lateral. */
function collapseAllAdminNavGroups() {
    document.querySelectorAll('.admin-nav-group-toggle').forEach(toggle => toggleAdminNavGroup(toggle, false));
}

/**
 * Abre el grupo que contiene la pantalla indicada para que la opción activa
 * siempre quede a la vista. Los demás grupos se quedan como estaban. Con el
 * menú contraído no hace nada: ahí basta con resaltar el icono del grupo.
 * @param {string} tabName - Nombre de la pantalla (data-tab).
 */
function expandAdminNavGroupFor(tabName) {
    if (isAdminNavCollapsed()) return;
    const button = document.querySelector(`#admin-nav .tab[data-tab="${tabName}"]`);
    const group = button?.closest('.admin-nav-group');
    if (group) toggleAdminNavGroup(group.querySelector('.admin-nav-group-toggle'), true);
}

/**
 * Contrae el menú a iconos o lo vuelve a expandir (pantallas anchas) y guarda
 * la preferencia en este navegador.
 * @param {boolean} collapsed - true para dejar solo los iconos.
 */
function setAdminNavCollapsed(collapsed) {
    document.body.classList.remove('admin-nav-peek');
    document.body.classList.toggle('admin-nav-collapsed', collapsed);
    try {
        localStorage.setItem(ADMIN_NAV_COLLAPSED_KEY, String(collapsed));
    } catch (error) {
        // Sin almacenamiento (modo privado) el menú funciona igual; solo no se recuerda.
    }
    collapseAllAdminNavGroups();
    if (!collapsed) expandAdminNavGroupFor(document.body.dataset.tab);
    syncAdminNavToggle();
}

/**
 * Actualiza aria-expanded y el texto oculto del botón de menú según el modo:
 * en celular indica si el cajón está abierto; en pantallas anchas, si el menú
 * está expandido.
 */
function syncAdminNavToggle() {
    const toggle = document.getElementById('admin-nav-toggle');
    const label = document.getElementById('admin-nav-toggle-label');
    if (MOBILE_NAV_QUERY.matches) {
        toggle.setAttribute('aria-expanded', String(document.body.classList.contains('admin-nav-open')));
        label.textContent = 'Menú';
    } else {
        const collapsed = isAdminNavCollapsed();
        toggle.setAttribute('aria-expanded', String(!collapsed));
        label.textContent = collapsed ? 'Expandir menú' : 'Contraer menú';
    }
}

/**
 * Abre o cierra el cajón del menú en celular.
 * @param {boolean} open - true para abrirlo.
 */
function setAdminNavDrawerOpen(open) {
    document.body.classList.toggle('admin-nav-open', open);
    syncAdminNavToggle();
}

/**
 * Acción del botón de menú de la barra superior: en celular abre o cierra el
 * cajón; en pantallas anchas contrae o expande el menú.
 */
function toggleAdminNav() {
    if (MOBILE_NAV_QUERY.matches) {
        setAdminNavDrawerOpen(!document.body.classList.contains('admin-nav-open'));
    } else {
        setAdminNavCollapsed(!isAdminNavCollapsed());
    }
}

/**
 * Cierra el cajón en celular y, si el menú contraído estaba desplegado, lo
 * regresa a iconos (al elegir una opción, tocar fuera o pulsar Esc).
 */
function closeAdminNav() {
    setAdminNavDrawerOpen(false);
    if (isAdminNavPeeking()) setAdminNavPeeking(false);
}

/** Aplica la preferencia guardada de menú contraído al cargar la página. */
function restoreAdminNavCollapsed() {
    let collapsed = false;
    try {
        collapsed = localStorage.getItem(ADMIN_NAV_COLLAPSED_KEY) === 'true';
    } catch (error) {
        collapsed = false;
    }
    document.body.classList.toggle('admin-nav-collapsed', collapsed);
    syncAdminNavToggle();
}

document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (document.body.classList.contains('admin-nav-open') || isAdminNavPeeking()) {
        closeAdminNav();
        document.getElementById('admin-nav-toggle').focus();
    }
});

// Con el menú desplegado encima de la pantalla, un clic fuera lo regresa a iconos.
document.addEventListener('click', event => {
    if (isAdminNavPeeking() && !event.target.closest('#admin-nav')) {
        setAdminNavPeeking(false);
    }
});

// Al cruzar el corte de celular cambia el significado del botón de menú.
MOBILE_NAV_QUERY.addEventListener('change', () => {
    document.body.classList.remove('admin-nav-peek');
    setAdminNavDrawerOpen(false);
    collapseAllAdminNavGroups();
    expandAdminNavGroupFor(document.body.dataset.tab);
});

restoreAdminNavCollapsed();
