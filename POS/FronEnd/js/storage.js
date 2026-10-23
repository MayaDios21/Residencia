/*
 * PERSISTENCIA (localStorage)
 * Guarda y recupera productos, categorías, ventas, configuración, carrito y
 * caja. Descarta datos dañados antes de usarlos.
 */

/**
 * Limpia automáticamente datos corruptos del localStorage
 */
function cleanCorruptedData() {
    try {
        // Verificar si hay productos guardados
        const savedProducts = localStorage.getItem('pos_products');
        if (savedProducts) {
            try {
                const parsed = JSON.parse(savedProducts);
                if (!Array.isArray(parsed)) {
                    console.warn('⚠️ Datos de productos corruptos detectados, limpiando...');
                    localStorage.removeItem('pos_products');
                }
                // NO eliminar si la lista está vacía: el usuario pudo haberlos eliminado
            } catch (e) {
                console.warn('⚠️ Error al parsear productos, limpiando...');
                localStorage.removeItem('pos_products');
            }
        }
        
        // Verificar si hay categorías guardadas
        const savedCategories = localStorage.getItem('pos_categories');
        if (savedCategories) {
            try {
                const parsed = JSON.parse(savedCategories);
                if (!Array.isArray(parsed)) {
                    console.warn('⚠️ Datos de categorías corruptos detectados, limpiando...');
                    localStorage.removeItem('pos_categories');
                }
                // NO eliminar si la lista está vacía: el usuario pudo haberlas eliminado
            } catch (e) {
                console.warn('⚠️ Error al parsear categorías, limpiando...');
                localStorage.removeItem('pos_categories');
            }
        }
    } catch (error) {
        console.error('Error en limpieza automática:', error);
    }
}

// Ejecutar limpieza antes de cualquier otra cosa
cleanCorruptedData();

/**
 * Guarda los productos en LocalStorage
 */
function saveProducts() {
    try {
        localStorage.setItem('pos_products', JSON.stringify(products));
        localStorage.setItem('pos_nextProductId', nextProductId.toString());
    } catch (error) {
        console.error('Error al guardar productos:', error);
        
        // Verificar si el error es por falta de espacio
        if (error.name === 'QuotaExceededError' || error.code === 22) {
            alert('⚠️ No hay suficiente espacio de almacenamiento.\n\nSugerencias:\n• Las imágenes ahora se comprimen automáticamente\n• Elimina productos que ya no uses\n• Usa imágenes más pequeñas');
        } else {
            // No mostrar alerta para otros errores, solo registrar en consola
            console.warn('Los productos se guardarán en el siguiente intento');
        }
    }
}

// Versión del catálogo guardado. La revisión de datos de ejemplo antiguos
// (de versiones de prueba anteriores) se hace solo una vez por dispositivo;
// después, lo que guarde el administrador nunca se reemplaza al recargar.
const CATALOG_VERSION_KEY = 'pos_catalog_version';
const CATALOG_VERSION = '2';
const OLD_DEMO_PRODUCT_NAMES = ['Agua Natural 1L', 'Jugo Naranja', 'Sandwich Jamón', 'Café Americano', 'Papas Fritas', 'Galletas Oreo', 'Chocolate Snickers'];
const OLD_DEMO_CATEGORY_NAMES = ['Comida', 'Snacks', 'Postres'];

/**
 * Indica si este navegador aún no revisa los datos de ejemplo antiguos.
 * @returns {boolean}
 */
function needsCatalogMigration() {
    return localStorage.getItem(CATALOG_VERSION_KEY) !== CATALOG_VERSION;
}

/**
 * Devuelve una copia independiente del menú por defecto.
 * @returns {Object[]}
 */
function getDefaultProductsCopy() {
    return JSON.parse(JSON.stringify(defaultProducts));
}

/**
 * Carga los productos desde LocalStorage. Una lista vacía es válida (el
 * administrador pudo borrarlos todos); solo se usa el menú por defecto la
 * primera vez o si los datos están dañados.
 */
function loadProductsFromStorage() {
    try {
        const savedProducts = localStorage.getItem('pos_products');
        const parsed = savedProducts === null ? null : JSON.parse(savedProducts);
        const isValid = Array.isArray(parsed) && parsed.every(p => p && p.id && p.name && typeof p.price === 'number');
        const hasOldDemo = isValid && needsCatalogMigration() && parsed.some(p => OLD_DEMO_PRODUCT_NAMES.includes(p.name));

        if (isValid && !hasOldDemo) {
            products = parsed;
            normalizeProductImages();
        } else {
            if (parsed !== null) console.warn('Catálogo guardado inválido o de prueba; se carga el menú por defecto.');
            products = getDefaultProductsCopy();
            saveProducts();
        }
    } catch (error) {
        console.error('Error al cargar productos:', error);
        products = getDefaultProductsCopy();
        saveProducts();
    }

    // Catálogos guardados antes de existir el control de almacén: solo las
    // bebidas se cuentan; tacos, quesadillas y extras no.
    products.forEach(product => {
        if (typeof product.track_inventory !== 'boolean') {
            product.track_inventory = product.category === 'Bebidas';
        }
    });

    const savedNextId = parseInt(localStorage.getItem('pos_nextProductId'), 10);
    const highestId = products.reduce((max, product) => Math.max(max, Number(product.id) || 0), defaultProducts.length);
    nextProductId = Number.isNaN(savedNextId) ? highestId + 1 : Math.max(savedNextId, highestId + 1);
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
 * Guarda las categorías en LocalStorage
 */
function saveCategories() {
    try {
        localStorage.setItem('pos_categories', JSON.stringify(categories));
        localStorage.setItem('pos_nextCategoryId', nextCategoryId.toString());
    } catch (error) {
        console.error('Error al guardar categorías:', error);
        
        // Verificar si el error es por falta de espacio
        if (error.name === 'QuotaExceededError' || error.code === 22) {
            alert('⚠️ No hay suficiente espacio de almacenamiento para guardar las categorías.');
        } else {
            // No mostrar alerta para otros errores, solo registrar en consola
            console.warn('Las categorías se guardarán en el siguiente intento');
        }
    }
}

/**
 * Carga las categorías desde LocalStorage. Igual que con los productos, una
 * lista vacía es válida y solo se usan las de ejemplo la primera vez.
 */
function loadCategoriesFromStorage() {
    try {
        const savedCategories = localStorage.getItem('pos_categories');
        const parsed = savedCategories === null ? null : JSON.parse(savedCategories);
        const isValid = Array.isArray(parsed) && parsed.every(c => c && c.id && c.name);
        const hasOldDemo = isValid && needsCatalogMigration() && parsed.some(c => OLD_DEMO_CATEGORY_NAMES.includes(c.name));

        if (isValid && !hasOldDemo) {
            categories = parsed;
        } else {
            if (parsed !== null) console.warn('Categorías guardadas inválidas o de prueba; se cargan las de ejemplo.');
            categories = defaultCategories.map(category => ({ ...category }));
            saveCategories();
        }
    } catch (error) {
        console.error('Error al cargar categorías:', error);
        categories = defaultCategories.map(category => ({ ...category }));
    }

    const savedNextId = parseInt(localStorage.getItem('pos_nextCategoryId'), 10);
    const highestId = categories.reduce((max, category) => Math.max(max, Number(category.id) || 0), defaultCategories.length);
    nextCategoryId = Number.isNaN(savedNextId) ? highestId + 1 : Math.max(savedNextId, highestId + 1);
}

/** Marca el catálogo como revisado para no volver a buscar datos de prueba. */
function markCatalogMigrated() {
    localStorage.setItem(CATALOG_VERSION_KEY, CATALOG_VERSION);
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
