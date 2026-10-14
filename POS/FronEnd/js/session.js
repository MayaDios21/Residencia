/*
 * SESIÓN
 * Login contra Django, persistencia de la sesión entre recargas (con
 * verificación del token), navegación según el rol y cierre de sesión.
 */

/**
 * Actualiza el perfil seleccionado y los textos del formulario de acceso.
 * @param {'cashier'|'admin'} role - Perfil local que se abrirá al continuar.
 */
function selectLoginRole(role) {
    selectedLoginRole = role === 'admin' ? 'admin' : 'cashier';
    const isAdmin = selectedLoginRole === 'admin';
    const cashierButton = document.getElementById('login-role-cashier');
    const adminButton = document.getElementById('login-role-admin');
    const heading = document.getElementById('login-heading');
    const submit = document.getElementById('entry-submit');

    cashierButton.classList.toggle('active', !isAdmin);
    cashierButton.setAttribute('aria-pressed', String(!isAdmin));
    adminButton.classList.toggle('active', isAdmin);
    adminButton.setAttribute('aria-pressed', String(isAdmin));
    heading.textContent = `Inicio de sesión · ${isAdmin ? 'Administrador' : 'Cajero'}`;
    submit.textContent = isAdmin ? 'Entrar al panel' : 'Entrar a caja';
}

/** Muestra las pestañas disponibles para el perfil y el nombre del usuario. */
function updateRoleNavigation() {
    const isAdmin = adminSession?.role === 'admin';
    ADMIN_TABS.forEach(tabName => {
        const button = document.querySelector(`.tab[data-tab="${tabName}"]`);
        if (button) button.hidden = !isAdmin;
    });
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
        const user = await loginInApi({
            username,
            password,
            role: selectedLoginRole
        });
        adminSession = {
            role: user.role,
            displayName: user.username
        };
        saveSessionToStorage();
    } catch (error) {
        showNotification(`❌ ${error.message}`);
        document.getElementById('login-password').focus();
        return;
    } finally {
        submit.disabled = false;
    }

    enterApp();
}

/** Envía el login con Enter o con "Ir" del teclado del iPad sin recargar la página. */
function handleLoginSubmit(event) {
    event.preventDefault();
    startApp();
}

/**
 * Muestra la app para la sesión activa.
 * @param {string|null} savedTab - Pantalla que estaba abierta antes de recargar.
 */
function enterApp(savedTab = null) {
    document.getElementById('session-loading').hidden = true;
    document.getElementById('entry-screen').hidden = true;
    document.getElementById('app-container').hidden = false;
    updateRoleNavigation();

    const isAdmin = adminSession.role === 'admin';
    const canRestoreTab = savedTab
        && document.getElementById(`${savedTab}-tab`)
        && (isAdmin || !ADMIN_TABS.includes(savedTab));

    if (isAdmin) {
        renderAdminDashboard();
        showTab(canRestoreTab ? savedTab : 'admin-dashboard');
    } else {
        showTab(canRestoreTab ? savedTab : 'pos');
        openDailyStartIfNeeded();
    }
}

/** Muestra la pantalla de login (sin sesión guardada o sesión expirada). */
function showLoginScreen() {
    delete document.body.dataset.tab;
    document.getElementById('session-loading').hidden = true;
    document.getElementById('app-container').hidden = true;
    document.getElementById('entry-screen').hidden = false;
}

function saveSessionToStorage() {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(adminSession));
}

function clearSessionStorage() {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem(CURRENT_TAB_STORAGE_KEY);
}

/**
 * Restaura la sesión al cargar la página. El servidor confirma que el token
 * sigue vigente; si responde 401/403 la sesión expiró y se vuelve al login.
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
            showNotification(`❌ ${error.message}`);
            return;
        }
    }
    adminSession = null;
    clearSessionStorage();
    showLoginScreen();
    document.getElementById('entry-login-form').reset();
    document.getElementById('login-username').focus();
    selectLoginRole('cashier');
}
