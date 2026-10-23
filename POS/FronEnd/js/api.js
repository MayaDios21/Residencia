const API_URL = window.POS_API_URL || 'http://127.0.0.1:8000/api';
const USE_API = false;
const AUTH_TOKEN_KEY = 'pos_auth_token';

/** Devuelve el primer mensaje de validación de DRF ({campo: ["mensaje"]}). */
function getFirstFieldError(data) {
    if (!data || typeof data !== 'object') return '';
    const firstValue = Object.values(data)[0];
    if (Array.isArray(firstValue)) return String(firstValue[0] || '');
    return typeof firstValue === 'string' ? firstValue : '';
}

/**
 * Hace una petición a la API de Django con el token de sesión guardado.
 * @param {string} path - Ruta relativa a API_URL, por ejemplo '/auth/me/'.
 * @param {RequestInit} [options] - Opciones de fetch (método, cuerpo, encabezados).
 * @returns {Promise<any>} Respuesta en JSON, o null si no trae cuerpo.
 * @throws {Error} Con el mensaje del servidor y la propiedad status si la respuesta no es 2xx.
 */
async function apiRequest(path, options = {}) {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Token ${token}` } : {}),
            ...(options.headers || {})
        }
    });

    let data = null;
    try {
        data = await response.json();
    } catch (error) {
        data = null;
    }

    if (!response.ok) {
        const message = data?.detail || data?.message || getFirstFieldError(data)
            || 'Error de comunicación con el servidor';
        const requestError = new Error(message);
        requestError.status = response.status;
        throw requestError;
    }

    return data;
}

/**
 * Inicia sesión en el backend y guarda el token recibido.
 * @param {{username: string, password: string, role: string}} credentials - Datos del formulario de acceso.
 * @returns {Promise<Object>} Usuario autenticado (id, username, role…).
 */
async function loginInApi(credentials) {
    const data = await apiRequest('/auth/login/', {
        method: 'POST',
        body: JSON.stringify(credentials)
    });
    localStorage.setItem(AUTH_TOKEN_KEY, data.token);
    return data.user;
}

/**
 * Consulta el usuario dueño del token actual; sirve para validar la sesión guardada.
 * @returns {Promise<Object>} Usuario autenticado.
 */
async function getCurrentUserFromApi() {
    return apiRequest('/auth/me/');
}

/** Cierra la sesión en el servidor y borra el token local aunque la petición falle. */
async function logoutFromApi() {
    try {
        await apiRequest('/auth/logout/', { method: 'POST' });
    } finally {
        localStorage.removeItem(AUTH_TOKEN_KEY);
    }
}

/**
 * Obtiene el catálogo de productos del backend.
 * @returns {Promise<Object[]>}
 */
async function getProductsFromApi() {
    return apiRequest('/productos/');
}

/**
 * Crea un producto en el backend.
 * @param {Object} product - Datos del producto (nombre, precio, categoría…).
 * @returns {Promise<Object>} Producto creado.
 */
async function createProductInApi(product) {
    return apiRequest('/productos/', {
        method: 'POST',
        body: JSON.stringify(product)
    });
}

/**
 * Registra una entrada, salida o ajuste de inventario en el backend.
 * @param {{product_id: number, type: string, quantity: number, reason: string}} movement
 * @returns {Promise<Object>} Movimiento creado con stock_remaining.
 */
async function createInventoryMovementInApi(movement) {
    return apiRequest('/inventario/movimientos/', {
        method: 'POST',
        body: JSON.stringify(movement)
    });
}

/**
 * Registra una venta en el backend; el servidor recalcula los totales.
 * @param {Object} sale - Productos y método de pago.
 * @returns {Promise<Object>} Venta registrada.
 */
async function createSaleInApi(sale) {
    return apiRequest('/ventas/', {
        method: 'POST',
        body: JSON.stringify(sale)
    });
}

// Gestión de usuarios (solo administrador). Siempre usa la API, sin importar
// USE_API, porque los usuarios solo existen en el backend.
async function getUsersFromApi() {
    return apiRequest('/usuarios/');
}

/**
 * Crea un usuario nuevo (solo administrador).
 * @param {Object} user - username, nombre, apellidos, rol y contraseña.
 * @returns {Promise<Object>} Usuario creado.
 */
async function createUserInApi(user) {
    return apiRequest('/usuarios/', {
        method: 'POST',
        body: JSON.stringify(user)
    });
}

/**
 * Actualiza parcialmente un usuario: rol, estado activo o nombre.
 * @param {number} userId - ID del usuario.
 * @param {Object} changes - Campos a cambiar.
 * @returns {Promise<Object>} Usuario actualizado.
 */
async function updateUserInApi(userId, changes) {
    return apiRequest(`/usuarios/${userId}/`, {
        method: 'PATCH',
        body: JSON.stringify(changes)
    });
}

/**
 * Asigna una contraseña nueva a un usuario (solo administrador).
 * @param {number} userId - ID del usuario.
 * @param {string} password - Contraseña nueva.
 * @returns {Promise<Object>}
 */
async function resetUserPasswordInApi(userId, password) {
    return apiRequest(`/usuarios/${userId}/restablecer-contrasena/`, {
        method: 'POST',
        body: JSON.stringify({ password })
    });
}
