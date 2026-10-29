/*
 * PERSISTENCIA (localStorage)
 * Guarda y recupera ventas, configuración, carrito, caja e insumos. El
 * catálogo (productos y categorías) ya no se guarda aquí: viene de la API.
 */

// Claves del catálogo de cuando se guardaba en el navegador. Ahora el catálogo
// vive en el servidor, así que se borran para no dejar datos viejos.
const LEGACY_CATALOG_KEYS = ['pos_products', 'pos_nextProductId', 'pos_categories', 'pos_nextCategoryId', 'pos_catalog_version'];

/** Borra del navegador el catálogo guardado por versiones anteriores. */
function removeLegacyCatalogStorage() {
    LEGACY_CATALOG_KEYS.forEach(key => localStorage.removeItem(key));
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
 * Carga el tipo de cambio desde LocalStorage
 */
function loadExchangeRate() {
    try {
        const saved = localStorage.getItem('pos_exchangeRate');
        if (saved) {
            exchangeRate = parseFloat(saved);
        }
    } catch (error) {
        console.error('Error al cargar tipo de cambio:', error);
        exchangeRate = 19.50;
    }
}

/**
 * Carga la tasa de IVA desde LocalStorage
 */
function loadTaxRate() {
    try {
        const saved = localStorage.getItem('pos_taxRate');
        if (saved) {
            TAX_RATE = parseFloat(saved);
        }
    } catch (error) {
        console.error('Error al cargar tasa de IVA:', error);
        TAX_RATE = 0.08;
    }
}

/**
 * Guarda los registros de caja en LocalStorage
 */
function saveCashBoxRecords() {
    try {
        localStorage.setItem('pos_cashbox_records', JSON.stringify(cashBoxRecords));
        localStorage.setItem('pos_nextCashBoxId', nextCashBoxId.toString());
    } catch (error) {
        console.error(' Error al guardar registros de caja:', error);
    }
}

/**
 * Carga los registros de caja desde LocalStorage
 */
function loadCashBoxRecords() {
    try {
        const savedRecords = localStorage.getItem('pos_cashbox_records');
        const savedNextId = localStorage.getItem('pos_nextCashBoxId');
        
        if (savedRecords) {
            cashBoxRecords = JSON.parse(savedRecords);
        } else {
            cashBoxRecords = [];
        }
        
        if (savedNextId) {
            nextCashBoxId = parseInt(savedNextId);
        }

        const savedOpeningCash = localStorage.getItem('pos_opening_cash');
        if (savedOpeningCash) {
            openingCash = JSON.parse(savedOpeningCash);
        }
        
    } catch (error) {
        console.error(' Error al cargar registros de caja:', error);
        cashBoxRecords = [];
    }

    syncSalesWithCashBoxClosures();

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
