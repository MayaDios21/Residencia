/*
 * SESIÓN
 * Inicio de sesión contra Django, persistencia de la sesión entre recargas (con
 * verificación del token), navegación según el rol y cierre de sesión.
 */

/**
 * Muestra la navegación del perfil (pestañas del cajero o menú lateral del
 * administrador) y el nombre del usuario.
 */
function updateRoleNavigation() {
    const isAdmin = adminSession?.role === 'admin';
    document.getElementById('cashier-nav').hidden = isAdmin;
    document.getElementById('admin-nav').hidden = !isAdmin;
    document.getElementById('admin-nav-toggle').hidden = !isAdmin;
    // La clase activa el diseño de dos columnas (menú + pantalla) en el CSS.
    document.body.classList.toggle('role-admin', isAdmin);
    closeAdminNav();
    document.getElementById('session-role').textContent = isAdmin ? 'Administrador' : 'Cajero';
    document.getElementById('session-user').textContent = adminSession.displayName;
    // Las pestañas de categoría de Venta cambian según el rol ("+ Nueva categoría").
    loadCategoryTabs();
}

/**
 * Entra al POS después de validar las credenciales mediante la API.
 */
async function startApp() {
    const form = document.getElementById('entry-login-form');
    if (!form.reportValidity()) return;
    const formData = new FormData(form);
    const username = String(formData.get('access-identifier')).trim();
    const password = String(formData.get('access-secret'));
    const submit = document.getElementById('entry-submit');
    submit.disabled = true;

    try {
        // No reutilizar tokens que hayan quedado guardados en otra sesión local.
        localStorage.removeItem(AUTH_TOKEN_KEY);
        clearSessionStorage();
        // El servidor devuelve el rol del usuario; con él se decide qué pantallas ver.
        const user = await loginInApi({ username, password });
        adminSession = {
            role: user.role,
            displayName: user.username
        };
        saveSessionToStorage();
    } catch (error) {
        showNotification(`${error.message}`);
        document.getElementById('login-password').focus();
        return;
    } finally {
        submit.disabled = false;
    }

    enterApp();
}

/** Envía el inicio de sesión con Enter o con "Ir" del teclado del iPad sin recargar la página. */
function handleLoginSubmit(event) {
    event.preventDefault();
    startApp();
}

/**
 * Pide al servidor el catálogo, la configuración y el estado de la caja
 * (necesitan el token, por eso va después del login) y redibuja las vistas.
 * Si algo no responde, avisa qué no se pudo cargar.
 */
async function loadSessionData() {
    const requests = [
        ['el catálogo', loadCatalog()],
        ['la configuración', loadSettings()],
        ['la caja', loadCashBoxState()]
    ];
    if (adminSession.role === 'admin') {
        requests.push(['los cierres de caja', getCashBoxClosingsFromApi().then(closings => { cashBoxClosings = closings; })]);
    }
    const results = await Promise.allSettled(requests.map(([, request]) => request));
    results.forEach((result, index) => {
        if (result.status === 'rejected') {
            console.error(`No se pudo cargar ${requests[index][0]}:`, result.reason);
            showNotification(`No se pudo cargar ${requests[index][0]}: ${result.reason.message}`);
        }
    });
    refreshCategoryViews();
    loadWarehouse();
    renderCashBoxTab();
}

/**
 * Muestra la app para la sesión activa.
 * @param {string|null} savedTab - Pantalla que estaba abierta antes de recargar.
 */
async function enterApp(savedTab = null) {
    document.getElementById('session-loading').hidden = true;
    document.getElementById('entry-screen').hidden = true;
    document.getElementById('app-container').hidden = false;
    updateRoleNavigation();
    await loadSessionData();

    const isAdmin = adminSession.role === 'admin';
    const canRestoreTab = savedTab
        && document.getElementById(`${savedTab}-tab`)
        && (isAdmin ? !CASHIER_TABS.includes(savedTab) : !ADMIN_TABS.includes(savedTab));

    if (isAdmin) {
        renderAdminDashboard();
        showTab(canRestoreTab ? savedTab : 'admin-dashboard');
    } else {
        showTab(canRestoreTab ? savedTab : 'pos');
        openDailyStartIfNeeded();
    }
}

/** Muestra la pantalla de inicio de sesión (sin sesión guardada o sesión expirada). */
function showLoginScreen() {
    delete document.body.dataset.tab;
    document.getElementById('session-loading').hidden = true;
    document.getElementById('app-container').hidden = true;
    document.getElementById('entry-screen').hidden = false;
}

/** Guarda la sesión activa en LocalStorage para recuperarla al recargar. */
function saveSessionToStorage() {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(adminSession));
}

/** Borra la sesión guardada y la pestaña recordada. */
function clearSessionStorage() {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem(CURRENT_TAB_STORAGE_KEY);
}

/**
 * Restaura la sesión al cargar la página. El servidor confirma que el token
 * sigue vigente; si responde 401/403 la sesión expiró y se vuelve al inicio de sesión.
 */
async function restoreSession() {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    let savedSession = null;
    try {
        savedSession = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY));
    } catch (error) {
        savedSession = null;
    }

    if (!token || !savedSession?.role) {
        clearSessionStorage();
        showLoginScreen();
        return;
    }

    try {
        const user = await getCurrentUserFromApi();
        adminSession = { role: user.role, displayName: user.username };
        saveSessionToStorage();
    } catch (error) {
        if (error.status === 401 || error.status === 403) {
            localStorage.removeItem(AUTH_TOKEN_KEY);
            clearSessionStorage();
            showLoginScreen();
            showNotification('Tu sesión expiró. Inicia sesión de nuevo.');
            return;
        }
        // Sin conexión con el servidor: se conserva la sesión guardada.
        console.warn('No se pudo verificar la sesión con el servidor:', error);
        adminSession = savedSession;
    }

    enterApp(localStorage.getItem(CURRENT_TAB_STORAGE_KEY));
}

/** Cierra la sesión de API y devuelve a la pantalla inicial. */
async function logoutSession() {
    try {
        await logoutFromApi();
    } catch (error) {
        // 401/403: el token ya no era válido, así que la sesión ya estaba cerrada.
        if (error.status !== 401 && error.status !== 403) {
            showNotification(`${error.message}`);
            return;
        }
    }
    adminSession = null;
    clearSessionStorage();
    // Los datos del servidor se vuelven a pedir en el siguiente login.
    products = [];
    categories = [];
    cashBoxState = { status: 'sin_abrir', session: null, sales_today: null, pending_session: null };
    cashBoxClosings = [];
    showLoginScreen();
    document.getElementById('entry-login-form').reset();
    document.getElementById('login-username').focus();
}
