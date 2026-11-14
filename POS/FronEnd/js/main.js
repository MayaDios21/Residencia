/*
 * ARRANQUE DEL SISTEMA
 * Carga los datos guardados en el navegador, dibuja la interfaz y después
 * decide si reabrir la sesión guardada o mostrar el inicio de sesión. El
 * catálogo, la configuración, la caja, las ventas y los insumos se piden a
 * la API al entrar (ver enterApp en session.js). Se carga al final, después
 * de todos los demás módulos.
 */

/** Carga los datos de localStorage y dibuja las vistas iniciales. */
function initializeSystem() {
    try {
        removeLegacyStorage();
        loadCartFromStorage();

        loadCategoryTabs();
        loadCategorySelector();
        loadProducts();
        updateCart();
        updateTodaySalesSummary();
        updateBusinessDate();
        displayExchangeRate();
        displayTaxRate();
    } catch (error) {
        console.error('Error al inicializar el sistema:', error);
        alert('Error al inicializar el sistema. Abre la consola (F12) para más detalles.');
    }
    // Con los datos listos, decide entre reabrir la sesión guardada o mostrar el inicio de sesión.
    restoreSession();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeSystem);
} else {
    initializeSystem();
}
