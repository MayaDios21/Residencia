/*
 * PERSISTENCIA (localStorage)
 * Guarda y recupera ventas, carrito e insumos. El catálogo, la
 * configuración y la caja ya no se guardan aquí: vienen de la API.
 */

// Claves de cuando el catálogo, la configuración y la caja se guardaban en el
// navegador. Ahora viven en el servidor, así que se borran para no dejar datos viejos.
const LEGACY_STORAGE_KEYS = [
    'pos_products', 'pos_nextProductId', 'pos_categories', 'pos_nextCategoryId', 'pos_catalog_version',
    'pos_exchangeRate', 'pos_taxRate',
    'pos_cashbox_records', 'pos_nextCashBoxId', 'pos_opening_cash'
];

/** Borra del navegador los datos que guardaban las versiones anteriores. */
function removeLegacyStorage() {
    LEGACY_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
}

/** Guarda los insumos del almacén en LocalStorage. */
function saveSupplies() {
    localStorage.setItem('pos_supplies', JSON.stringify(supplies));
}

/** Carga los insumos del almacén (vasos, platos…); una lista vacía es válida. */
function loadSuppliesFromStorage() {
    try {
        const parsed = JSON.parse(localStorage.getItem('pos_supplies'));
        supplies = Array.isArray(parsed) ? parsed.filter(item => item && item.id && item.name) : [];
    } catch (error) {
        console.error('Error al cargar insumos:', error);
        supplies = [];
    }
    nextSupplyId = supplies.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
}

/**
 * Carga el historial de ventas desde LocalStorage
 */
function loadSalesHistory() {
    try {
        const saved = localStorage.getItem('pos_salesHistory');
        if (saved) {
            salesHistory = JSON.parse(saved);
            salesHistory = salesHistory.map(sale => ({
                ...sale,
                dateKey: sale.dateKey || getLocalDateKey(new Date(sale.date)),
                status: sale.status || 'abierta'
            }));
        } else {
            salesHistory = [];
        }
    } catch (error) {
        console.error('Error al cargar historial de ventas:', error);
        salesHistory = [];
    }
}

/** Guarda el historial de ventas en LocalStorage. */
function saveSalesHistory() {
    localStorage.setItem('pos_salesHistory', JSON.stringify(salesHistory));
}

/**
 * Guarda el carrito en LocalStorage
 */
function saveCart() {
    try {
        localStorage.setItem('pos_cart', JSON.stringify(cart));
    } catch (error) {
        console.error('Error al guardar el carrito:', error);
        // Solo registrar en consola, no mostrar alerta
        console.warn('El carrito se guardará en el siguiente intento');
    }
}

/**
 * Carga el carrito desde LocalStorage
 */
function loadCartFromStorage() {
    try {
        const savedCart = localStorage.getItem('pos_cart');
        if (savedCart) {
            cart = JSON.parse(savedCart);
        } else {
            cart = []; // Si no hay carrito guardado, inicializar vacío
        }
    } catch (error) {
        console.error('Error al cargar el carrito:', error);
        cart = []; // Si hay error, inicializar carrito vacío
    }
}
