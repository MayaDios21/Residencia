const API_URL = window.POS_API_URL || 'http://127.0.0.1:8000/api';
const USE_API = false;
const AUTH_TOKEN_KEY = 'pos_auth_token';

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
        const message = data?.detail || data?.message || 'Error de comunicación con el servidor';
        const requestError = new Error(message);
        requestError.status = response.status;
        throw requestError;
    }

    return data;
}

async function loginInApi(credentials) {
    const data = await apiRequest('/auth/login/', {
        method: 'POST',
        body: JSON.stringify(credentials)
    });
    localStorage.setItem(AUTH_TOKEN_KEY, data.token);
    return data.user;
}

async function getCurrentUserFromApi() {
    return apiRequest('/auth/me/');
}

async function logoutFromApi() {
    try {
        await apiRequest('/auth/logout/', { method: 'POST' });
    } finally {
        localStorage.removeItem(AUTH_TOKEN_KEY);
    }
}

async function getProductsFromApi() {
    return apiRequest('/productos/');
}

async function createProductInApi(product) {
    return apiRequest('/productos/', {
        method: 'POST',
        body: JSON.stringify(product)
    });
}

async function createInventoryMovementInApi(movement) {
    return apiRequest('/inventario/movimientos/', {
        method: 'POST',
        body: JSON.stringify(movement)
    });
}

async function createSaleInApi(sale) {
    return apiRequest('/ventas/', {
        method: 'POST',
        body: JSON.stringify(sale)
    });
}
