/*
 * COMUNICACIÓN CON EL BACKEND
 * Dirección de la API de Django, token de sesión y funciones para llamarla.
 * El inicio de sesión y la gestión de usuarios siempre usan la API; ventas,
 * inventario y catálogo solo cuando USE_API es true (mientras tanto se
 * guardan en el navegador). Es el primer módulo que carga index.html.
 */

/**
 * Dirección de la API. Publicado en Vercel, frontend y API comparten dominio
 * ('/api'). En local (servidor de pruebas con puerto, como 8080 o 5500, o
 * archivo abierto directo) Django corre en el puerto 8000 del mismo equipo.
 */
function resolveApiUrl() {
    if (window.POS_API_URL) return window.POS_API_URL;
    if (location.protocol === 'file:' || location.port !== '') {
        return `http://${location.hostname || '127.0.0.1'}:8000/api`;
    }
    return '/api';
}

const API_URL = resolveApiUrl();
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
 * Inicia sesión en el backend y guarda el token recibido. No se manda rol:
 * el servidor lo toma del perfil del usuario y lo devuelve en la respuesta.
 * @param {{username: string, password: string}} credentials - Datos del formulario de acceso.
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
 * Obtiene las categorías del backend.
 * @returns {Promise<Object[]>} Categorías ({id, name, color, is_active}).
 */
async function getCategoriesFromApi() {
    return apiRequest('/categorias/');
}

/**
 * Crea una categoría (solo administrador).
 * @param {{name: string, color: string}} category - Nombre y color #rrggbb.
 * @returns {Promise<Object>} Categoría creada.
 */
async function createCategoryInApi(category) {
    return apiRequest('/categorias/', {
        method: 'POST',
        body: JSON.stringify(category)
    });
}

/**
 * Actualiza parcialmente una categoría (solo administrador).
 * @param {number} categoryId - ID de la categoría.
 * @param {Object} changes - Campos a cambiar (name, color, is_active).
 * @returns {Promise<Object>} Categoría actualizada.
 */
async function updateCategoryInApi(categoryId, changes) {
    return apiRequest(`/categorias/${categoryId}/`, {
        method: 'PATCH',
        body: JSON.stringify(changes)
    });
}

/**
 * Elimina una categoría; sus productos quedan sin categoría (solo administrador).
 * @param {number} categoryId - ID de la categoría.
 */
async function deleteCategoryInApi(categoryId) {
    return apiRequest(`/categorias/${categoryId}/`, { method: 'DELETE' });
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
 * Actualiza parcialmente un producto (solo administrador). El stock no se
 * cambia aquí: solo con movimientos de inventario o ventas.
 * @param {number} productId - ID del producto.
 * @param {Object} changes - Campos a cambiar (name, price, category, image…).
 * @returns {Promise<Object>} Producto actualizado.
 */
async function updateProductInApi(productId, changes) {
    return apiRequest(`/productos/${productId}/`, {
        method: 'PATCH',
        body: JSON.stringify(changes)
    });
}

/**
 * Elimina un producto (solo administrador). Responde 409 si tiene historial
 * de inventario: en ese caso se desactiva en lugar de borrarse.
 * @param {number} productId - ID del producto.
 */
async function deleteProductInApi(productId) {
    return apiRequest(`/productos/${productId}/`, { method: 'DELETE' });
}

/**
 * Descarga un archivo de la API (por ejemplo un CSV) con el token de sesión.
 * Un enlace normal no serviría porque no manda el encabezado Authorization.
 * @param {string} path - Ruta relativa a API_URL.
 * @param {string} filename - Nombre con el que se guarda el archivo.
 */
async function downloadFileFromApi(path, filename) {
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    const response = await fetch(`${API_URL}${path}`, {
        headers: token ? { Authorization: `Token ${token}` } : {}
    });
    if (!response.ok) {
        let message = 'No se pudo descargar el archivo';
        try {
            message = (await response.json()).detail || message;
        } catch (error) {
            // La respuesta no era JSON; se queda el mensaje genérico.
        }
        const requestError = new Error(message);
        requestError.status = response.status;
        throw requestError;
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

/**
 * Obtiene el IVA y el tipo de cambio (ambos roles).
 * @returns {Promise<{tax_rate: string, exchange_rate: string}>} tax_rate es fracción (0.0800 = 8 %).
 */
async function getSettingsFromApi() {
    return apiRequest('/configuracion/');
}

/**
 * Cambia el IVA y/o el tipo de cambio (solo administrador).
 * @param {{tax_rate?: string, exchange_rate?: string}} changes
 * @returns {Promise<Object>} Configuración actualizada.
 */
async function updateSettingsInApi(changes) {
    return apiRequest('/configuracion/', {
        method: 'PATCH',
        body: JSON.stringify(changes)
    });
}

/**
 * Estado de la caja de hoy: sin_abrir, abierta o cerrada, con la jornada,
 * las ventas del día y una jornada anterior que haya quedado abierta.
 * @returns {Promise<{status: string, session: ?Object, sales_today: ?Object, pending_session: ?Object}>}
 */
async function getCurrentCashBoxFromApi() {
    return apiRequest('/caja/actual/');
}

/**
 * Abre la caja de hoy con su fondo inicial.
 * @param {number} openingAmount - Fondo inicial, mayor que cero.
 * @returns {Promise<Object>} Jornada abierta.
 */
async function openCashBoxInApi(openingAmount) {
    return apiRequest('/caja/abrir/', {
        method: 'POST',
        body: JSON.stringify({ opening_amount: openingAmount.toFixed(2) })
    });
}

/**
 * Cierra la jornada abierta. El servidor calcula el efectivo esperado y
 * cierra las ventas de ese día.
 * @param {Object} [closing] - counted_cash, minor_expenses y retained_fund (opcionales).
 * @returns {Promise<Object>} Jornada cerrada con sus totales.
 */
async function closeCashBoxInApi(closing = {}) {
    return apiRequest('/caja/cerrar/', {
        method: 'POST',
        body: JSON.stringify(closing)
    });
}

/**
 * Lista los cierres de caja registrados (solo administrador).
 * @returns {Promise<Object[]>}
 */
async function getCashBoxClosingsFromApi() {
    return apiRequest('/caja/cierres/');
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
