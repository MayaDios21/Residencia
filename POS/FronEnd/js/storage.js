/*
 * PERSISTENCIA (localStorage)
 * Guarda y recupera el carrito en curso. El catálogo, la configuración, la
 * caja, las ventas y los insumos ya no se guardan aquí: vienen de la API.
 */

// Claves de cuando el catálogo, la configuración, la caja, las ventas y los
// insumos se guardaban en el navegador. Ahora viven en el servidor, así que se borran para no dejar datos viejos.
const LEGACY_STORAGE_KEYS = [
    'pos_products', 'pos_nextProductId', 'pos_categories', 'pos_nextCategoryId', 'pos_catalog_version',
    'pos_exchangeRate', 'pos_taxRate',
    'pos_cashbox_records', 'pos_nextCashBoxId', 'pos_opening_cash',
    'pos_salesHistory', 'pos_supplies'
];

/** Borra del navegador los datos que guardaban las versiones anteriores. */
function removeLegacyStorage() {
    LEGACY_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
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
