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

// Utilidades de mantenimiento para usar desde la consola del navegador.
window.limpiar = function() {
    localStorage.clear();
    location.reload();
};

/**
 * Utilidad de consola: imprime el estado de productos, categorías, carrito y
 * de la pantalla para depurar.
 */
window.diagnosticar = function() {
    console.clear();
    console.log('='.repeat(50));
    console.log('DIAGNÓSTICO DEL SISTEMA POS');
    console.log('='.repeat(50));
    
    console.log('\nESTADO ACTUAL:');
    console.log(`  - Productos en memoria: ${products.length}`);
    console.log(`  - Categorías en memoria: ${categories.length}`);
    console.log(`  - Items en carrito: ${cart.length}`);
    console.log(`  - Categoría activa: ${activeCategory}`);
    console.log(`  - API: ${API_URL}`);
    if (products.length > 0) console.log('  - Primer producto:', products[0]);

    console.log('\nELEMENTOS DEL DOM:');
    console.log(`  - products-grid: ${document.getElementById('products-grid') ? 'EXISTE' : 'NO EXISTE'}`);
    console.log(`  - category-tabs: ${document.getElementById('category-tabs') ? 'EXISTE' : 'NO EXISTE'}`);
    console.log(`  - cart-items: ${document.getElementById('cart-items') ? 'EXISTE' : 'NO EXISTE'}`);
    
    console.log('\n' + '='.repeat(50));
    console.log('COMANDOS ÚTILES:');
    console.log('  - refreshCatalog() → Volver a pedir el catálogo al servidor');
    console.log('  - loadCategoryTabs() → Recargar pestañas');
    console.log('='.repeat(50));
}
