/*
 * UTILIDADES
 * Fechas locales, conversión de moneda y existencias de productos.
 */

function getLocalDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Convierte pesos mexicanos a dólares usando el tipo de cambio actual
 * @param {number} mxn - Cantidad en pesos mexicanos
 * @returns {number} Cantidad en dólares
 */
function convertToUSD(mxn) {
    return mxn / exchangeRate;
}

/**
 * Indica si un producto de venta se cuenta en el almacén. Solo los consumibles
 * marcados (refrescos, aguas…) llevan existencias; la comida no.
 * @param {Object} product - Producto del catálogo.
 * @returns {boolean}
 */
function isInventoryTracked(product) {
    return product?.track_inventory === true;
}

/**
 * Devuelve las existencias de un producto o insumo.
 * @param {Object} product - Producto del catálogo o insumo del almacén.
 * @returns {number|null} Stock actual, o null si no se controla o aún no se registra.
 */
function getProductStock(product) {
    // Los productos de venta sin control de almacén nunca limitan la venta.
    if (product?.track_inventory === false) return null;
    return Number.isFinite(Number(product.stock)) ? Number(product.stock) : null;
}

/**
 * Devuelve el stock mínimo antes de marcar alerta de stock bajo.
 * @param {Object} product - Producto del catálogo o insumo del almacén.
 * @returns {number} Mínimo configurado, o 5 por defecto.
 */
function getProductMinimumStock(product) {
    return Number.isFinite(Number(product.minimum_stock)) ? Number(product.minimum_stock) : 5;
}
