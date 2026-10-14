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

function getProductStock(product) {
    return Number.isFinite(Number(product.stock)) ? Number(product.stock) : null;
}

function getProductMinimumStock(product) {
    return Number.isFinite(Number(product.minimum_stock)) ? Number(product.minimum_stock) : 5;
}
