const API_URL = 'http://127.0.0.1:8000/api';
const USE_API = false;

async function apiRequest(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
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
