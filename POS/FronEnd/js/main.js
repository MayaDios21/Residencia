/*
 * ARRANQUE DEL SISTEMA
 * Carga los datos guardados, dibuja la interfaz y después decide si reabrir
 * la sesión guardada o mostrar el inicio de sesión. Se carga al final, después de todos
 * los demás módulos.
 */

/** Carga los datos de localStorage y dibuja las vistas iniciales. */
function initializeSystem() {
    try {
        loadCategoriesFromStorage();
        loadProductsFromStorage();
        markCatalogMigrated();
        loadSuppliesFromStorage();
        loadSalesHistory();
        loadCashBoxRecords();
        loadExchangeRate();
        loadTaxRate();
        loadCartFromStorage();

        // Asegura que todos los productos tengan imagen (o la del menú por defecto).
        products.forEach(product => {
            if (!product.image) product.image = defaultProductImages[product.name] || null;
        });
        saveProducts();

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

/** Utilidad de consola: reemplaza el catálogo por el menú por defecto. */
window.cargarDefecto = function() {
    products = JSON.parse(JSON.stringify(defaultProducts));
    saveProducts();
    loadProducts();
    loadCategoryTabs();
};

/**
 * Utilidad de consola: imprime el estado de productos, categorías, carrito y
 * LocalStorage para depurar.
 */
window.diagnosticar = function() {
    console.clear();
    console.log('='.repeat(50));
    console.log('🔍 DIAGNÓSTICO DEL SISTEMA POS');
    console.log('='.repeat(50));
    
    console.log('\n📊 ESTADO ACTUAL:');
    console.log(`  - Productos en memoria: ${products.length}`);
    console.log(`  - Categorías en memoria: ${categories.length}`);
    console.log(`  - Items en carrito: ${cart.length}`);
    console.log(`  - Categoría activa: ${activeCategory}`);
    
    console.log('\n💾 LOCALSTORAGE:');
    const savedProducts = localStorage.getItem('pos_products');
    console.log(`  - pos_products guardado: ${savedProducts ? 'SÍ' : 'NO'}`);
    if (savedProducts) {
        const parsed = JSON.parse(savedProducts);
        console.log(`  - Cantidad: ${parsed.length}`);
        if (parsed.length > 0) {
            console.log(`  - Primer producto:`, parsed[0]);
        }
    }
    
    const savedCategories = localStorage.getItem('pos_categories');
    console.log(`  - pos_categories guardado: ${savedCategories ? 'SÍ' : 'NO'}`);
    if (savedCategories) {
        const parsed = JSON.parse(savedCategories);
        console.log(`  - Cantidad: ${parsed.length}`);
    }
    
    console.log('\n🎯 PRODUCTOS POR DEFECTO DISPONIBLES:');
    console.log(`  - Total: ${defaultProducts.length}`);
    defaultProducts.forEach(p => console.log(`    • ${p.name} - $${p.price}`));
    
    console.log('\n🏠 ELEMENTOS DEL DOM:');
    console.log(`  - products-grid: ${document.getElementById('products-grid') ? 'EXISTE' : 'NO EXISTE'}`);
    console.log(`  - category-tabs: ${document.getElementById('category-tabs') ? 'EXISTE' : 'NO EXISTE'}`);
    console.log(`  - cart-items: ${document.getElementById('cart-items') ? 'EXISTE' : 'NO EXISTE'}`);
    
    console.log('\n' + '='.repeat(50));
    console.log('💡 COMANDOS ÚTILES:');
    console.log('  - loadProducts() → Recargar productos en vista');
    console.log('  - loadCategoryTabs() → Recargar pestañas');
    console.log('  - resetSystem() → Limpiar datos y reiniciar');
    console.log('='.repeat(50));
}
