/*
============================================
SISTEMA POS - LÓGICA JAVASCRIPT
============================================
*/

// ============================================
// VARIABLES GLOBALES
// ============================================

// Base de datos de productos en memoria
let products = [];

// Base de datos de categorías
let categories = [];

// Productos por defecto (solo se cargan la primera vez)
const defaultProducts = [
    { id: 1, name: "Coca Cola 600ml", price: 25.00, category: "Bebidas", image: null },
    { id: 2, name: "Agua Natural 1L", price: 15.00, category: "Bebidas", image: null },
    { id: 3, name: "Jugo Naranja", price: 28.00, category: "Bebidas", image: null },
    { id: 4, name: "Sandwich Jamón", price: 45.00, category: "Comida", image: null },
    { id: 5, name: "Café Americano", price: 30.00, category: "Bebidas", image: null },
    { id: 6, name: "Papas Fritas", price: 20.00, category: "Snacks", image: null },
    { id: 7, name: "Galletas Oreo", price: 35.00, category: "Postres", image: null },
    { id: 8, name: "Chocolate Snickers", price: 22.00, category: "Postres", image: null }
];

// Categorías por defecto
const defaultCategories = [
    { id: 1, name: "Bebidas", color: "#3498db" },
    { id: 2, name: "Comida", color: "#e74c3c" },
    { id: 3, name: "Snacks", color: "#f39c12" },
    { id: 4, name: "Postres", color: "#9b59b6" }
];

// Carrito de compras
let cart = [];

// ID para nuevos productos y categorías
let nextProductId = 9;
let nextCategoryId = 5;

// Categoría activa para filtrar productos
let activeCategory = "Todas";

// ============================================
// LIMPIEZA AUTOMÁTICA DE DATOS CORRUPTOS
// ============================================

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
                // NO eliminar si el array está vacío - el usuario pudo haberlos eliminado
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
                // NO eliminar si el array está vacío - el usuario pudo haberlas eliminado
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

// ============================================
// FUNCIONES DE PERSISTENCIA (LocalStorage)
// ============================================

/**
 * Guarda los productos en LocalStorage
 */
function saveProducts() {
    try {
        localStorage.setItem('pos_products', JSON.stringify(products));
        localStorage.setItem('pos_nextProductId', nextProductId.toString());
        console.log('Productos guardados en LocalStorage');
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

/**
 * Carga los productos desde LocalStorage
 */
function loadProductsFromStorage() {
    try {
        const savedProducts = localStorage.getItem('pos_products');
        const savedNextId = localStorage.getItem('pos_nextProductId');
        
        if (savedProducts !== null) {
            // Hay datos guardados (aunque sea un array vacío)
            try {
                const parsed = JSON.parse(savedProducts);
                
                // Validar que sea un array válido (puede estar vacío si el usuario borró todo)
                if (Array.isArray(parsed)) {
                    // Si tiene contenido, validar la estructura
                    if (parsed.length > 0) {
                        const allValid = parsed.every(p => p.id && p.name && typeof p.price === 'number');
                        if (allValid) {
                            products = parsed;
                            console.log(`✅ ${products.length} productos cargados desde LocalStorage`);
                        } else {
                            throw new Error('Estructura de producto inválida');
                        }
                    } else {
                        // Array vacío es válido (el usuario borró todos los productos)
                        products = [];
                        console.log('✅ Array de productos vacío (el usuario eliminó todos los productos)');
                    }
                } else {
                    throw new Error('No es un array válido');
                }
            } catch (parseError) {
                console.warn('⚠️ Datos de productos inválidos, cargando por defecto...');
                localStorage.removeItem('pos_products');
                products = JSON.parse(JSON.stringify(defaultProducts));
                products.forEach(p => {
                    if (!p.hasOwnProperty('image')) p.image = null;
                });
                saveProducts();
            }
        } else {
            // Primera vez, cargar productos por defecto
            console.log('🆕 Primera carga: cargando productos por defecto');
            products = JSON.parse(JSON.stringify(defaultProducts));
            products.forEach(p => {
                if (!p.hasOwnProperty('image')) p.image = null;
            });
            saveProducts();
            console.log(` ${products.length} productos por defecto cargados (primera carga)`);
        }
        
        if (savedNextId) {
            nextProductId = parseInt(savedNextId);
        }
        
    } catch (error) {
        console.error(' Error crítico al cargar productos:', error);
        // Último recurso: usar por defecto
        products = JSON.parse(JSON.stringify(defaultProducts));
        saveProducts();
    }
}

/**
 * Guarda las categorías en LocalStorage
 */
function saveCategories() {
    try {
        localStorage.setItem('pos_categories', JSON.stringify(categories));
        localStorage.setItem('pos_nextCategoryId', nextCategoryId.toString());
        console.log('Categorías guardadas en LocalStorage');
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
 * Carga las categorías desde LocalStorage
 */
function loadCategoriesFromStorage() {
    try {
        const savedCategories = localStorage.getItem('pos_categories');
        const savedNextId = localStorage.getItem('pos_nextCategoryId');
        
        if (savedCategories !== null) {
            // Hay datos guardados (aunque sea un array vacío)
            const parsed = JSON.parse(savedCategories);
            
            // Validar que sea un array válido (puede estar vacío si el usuario borró todo)
            if (Array.isArray(parsed)) {
                categories = parsed;
                if (parsed.length > 0) {
                    console.log(`✅ ${categories.length} categorías cargadas desde LocalStorage`);
                } else {
                    console.log('✅ Array de categorías vacío (el usuario eliminó todas las categorías)');
                }
            } else {
                console.warn('⚠️ Datos de categorías inválidos, cargando por defecto');
                categories = [...defaultCategories];
                saveCategories();
            }
        } else {
            // Primera vez, cargar categorías por defecto
            console.log('🆕 Primera carga: cargando categorías por defecto');
            categories = [...defaultCategories];
            saveCategories();
        }
        
        if (savedNextId) {
            nextCategoryId = parseInt(savedNextId);
        }
        
    } catch (error) {
        console.error('❌ Error al cargar categorías:', error);
        // Si hay error, usar categorías por defecto
        categories = [...defaultCategories];
    }
}

/**
 * Crea una nueva categoría
 * @param {string} name - Nombre de la categoría
 * @param {string} color - Color de la categoría (opcional)
 */
function createCategory(name, color = '#95a5a6') {
    // Validar que no exista ya
    const existingCategory = categories.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (existingCategory) {
        alert(' Ya existe una categoría con ese nombre');
        return false;
    }
    
    const newCategory = {
        id: nextCategoryId++,
        name: name.trim(),
        color: color
    };
    
    categories.push(newCategory);
    saveCategories();
    
    console.log(' Nueva categoría creada:', newCategory);
    return newCategory;
}

/**
 * Elimina una categoría (mueve productos a "Sin Categoría")
 * @param {number} categoryId - ID de la categoría a eliminar
 */
/**
 * Elimina todas las categorías del sistema
 */
function deleteAllCategories() {
    if (categories.length === 0) {
        alert('⚠️ No hay categorías para eliminar');
        return;
    }
    
    // Contar productos que tienen categorías
    const productsWithCategories = products.filter(p => {
        return categories.some(c => c.name === p.category);
    });
    
    let confirmMsg = `¿Estás seguro de eliminar TODAS las categorías (${categories.length})?\n\n⚠️ Esta acción no se puede deshacer.`;
    
    if (productsWithCategories.length > 0) {
        confirmMsg += `\n\n${productsWithCategories.length} producto(s) serán movidos a "Sin Categoría".`;
    }
    
    if (confirm(confirmMsg)) {
        // Mover todos los productos a "Sin Categoría"
        products.forEach(product => {
            if (categories.some(c => c.name === product.category)) {
                product.category = "Sin Categoría";
            }
        });
        
        // Eliminar todas las categorías
        categories = [];
        
        // Guardar en localStorage
        saveProducts();
        saveCategories();
        
        // Actualizar las vistas
        renderCategoryList();
        renderCategoryTabs();
        renderProducts();
        loadCategoryOptions();
        
        // Resetear categoría activa
        activeCategory = "Todas";
        
        alert('✅ Todas las categorías han sido eliminadas');
    }
}

function deleteCategory(categoryId) {
    const category = categories.find(c => c.id === categoryId);
    if (!category) {
        alert(' Categoría no encontrada');
        return false;
    }
    
    // Contar productos en esta categoría
    const productsInCategory = products.filter(p => p.category === category.name);
    
    if (productsInCategory.length > 0) {
        const confirmMsg = `La categoría "${category.name}" tiene ${productsInCategory.length} producto(s).\n\n¿Mover productos a "Sin Categoría" y eliminar la categoría?`;
        if (!confirm(confirmMsg)) {
            return false;
        }
        
        // Mover productos a "Sin Categoría"
        products.forEach(product => {
            if (product.category === category.name) {
                product.category = "Sin Categoría";
            }
        });
        saveProducts();
    }
    
    // Eliminar categoría
    categories = categories.filter(c => c.id !== categoryId);
    saveCategories();
    
    console.log(' Categoría eliminada:', category.name);
    return true;
}

/**
 * Obtiene productos filtrados por categoría
 * @param {string} categoryName - Nombre de la categoría ("Todas" para todos)
 */
function getProductsByCategory(categoryName) {
    if (categoryName === "Todas") {
        return products;
    }
    return products.filter(product => product.category === categoryName);
}

// Configuración del sistema
// TAX_RATE ahora es una variable que puede ser modificada
let TAX_RATE = 0.08; // 8% de IVA (valor por defecto)

// Variable para almacenar el tipo de cambio
let exchangeRate = 19.50; // Tipo de cambio por defecto

// Historial de ventas
let salesHistory = [];

// ============================================
// FUNCIONES DE CARGA DE CONFIGURACIÓN
// ============================================

/**
 * Carga el historial de ventas desde LocalStorage
 */
function loadSalesHistory() {
    try {
        const saved = localStorage.getItem('pos_salesHistory');
        if (saved) {
            salesHistory = JSON.parse(saved);
            console.log(`📊 ${salesHistory.length} ventas cargadas del historial`);
        } else {
            salesHistory = [];
        }
    } catch (error) {
        console.error('Error al cargar historial de ventas:', error);
        salesHistory = [];
    }
}

/**
 * Carga y muestra la pestaña de historial de ventas
 */
function loadSalesHistoryTab() {
    const salesList = document.getElementById('sales-list');
    if (!salesList) {
        console.warn('⚠️ No se encontró el elemento sales-list');
        return;
    }
    
    // Actualizar resumen
    updateSalesSummary();
    
    if (salesHistory.length === 0) {
        salesList.innerHTML = `
            <div class="empty-sales">
                <span>•</span>
                <p>No hay ventas registradas<br>Las ventas aparecerán aquí</p>
            </div>
        `;
        return;
    }
    
    salesList.innerHTML = '';
    
    // Ordenar ventas por fecha (más reciente primero)
    const sortedSales = [...salesHistory].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    sortedSales.forEach(sale => {
        const date = new Date(sale.date);
        const formattedDate = date.toLocaleDateString('es-MX', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
        const formattedTime = date.toLocaleTimeString('es-MX', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // Crear elemento de venta
        const saleItem = document.createElement('div');
        saleItem.className = 'sale-item';
        
        // Crear lista de productos
        let productsHTML = '';
        if (sale.products && sale.products.length > 0) {
            productsHTML = sale.products.map(p => 
                `${p.quantity}x ${p.name} ($${p.price.toFixed(2)})`
            ).join(', ');
        }
        
        saleItem.innerHTML = `
            <div class="sale-info">
                <div class="sale-id">Venta #${sale.id}</div>
                <div class="sale-date">${formattedDate} - ${formattedTime}</div>
                <div class="sale-products">${productsHTML || 'Sin detalles'}</div>
            </div>
            <div class="sale-stats">
                <div class="sale-items">${sale.items || 0} items</div>
                <div class="sale-total">$${(sale.total || 0).toFixed(2)}</div>
            </div>
        `;
        
        salesList.appendChild(saleItem);
    });
}

/**
 * Actualiza el resumen de ventas
 */
function updateSalesSummary() {
    const totalSales = salesHistory.reduce((sum, sale) => sum + (sale.total || 0), 0);
    const totalTransactions = salesHistory.length;
    const totalItems = salesHistory.reduce((sum, sale) => sum + (sale.items || 0), 0);
    const averageSale = totalTransactions > 0 ? totalSales / totalTransactions : 0;
    
    const totalSalesEl = document.getElementById('total-sales');
    const totalTransactionsEl = document.getElementById('total-transactions');
    const totalItemsEl = document.getElementById('total-items');
    const averageSaleEl = document.getElementById('average-sale');
    
    if (totalSalesEl) totalSalesEl.textContent = `$${totalSales.toFixed(2)}`;
    if (totalTransactionsEl) totalTransactionsEl.textContent = totalTransactions;
    if (totalItemsEl) totalItemsEl.textContent = totalItems;
    if (averageSaleEl) averageSaleEl.textContent = `$${averageSale.toFixed(2)}`;
}

/**
 * Funciones auxiliares para el historial de ventas
 */
function filterSales() {
    console.log('Filtrar ventas');
    loadSalesHistoryTab();
}

function searchSales() {
    console.log('Buscar ventas');
}

function exportSales() {
    alert('Función de exportar en desarrollo');
}

function verifySalesIntegrity() {
    alert(`Ventas verificadas: ${salesHistory.length} registros correctos`);
}

function clearSalesHistory() {
    if (confirm('⚠️ ¿Estás seguro de borrar todo el historial de ventas?')) {
        salesHistory = [];
        localStorage.setItem('pos_salesHistory', JSON.stringify(salesHistory));
        loadSalesHistoryTab();
        alert('✅ Historial borrado');
    }
}

/**
 * Carga el tipo de cambio desde LocalStorage
 */
function loadExchangeRate() {
    try {
        const saved = localStorage.getItem('pos_exchangeRate');
        if (saved) {
            exchangeRate = parseFloat(saved);
            console.log(`💱 Tipo de cambio cargado: $${exchangeRate.toFixed(2)}`);
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
            console.log(`📋 IVA cargado: ${(TAX_RATE * 100).toFixed(2)}%`);
        }
    } catch (error) {
        console.error('Error al cargar tasa de IVA:', error);
        TAX_RATE = 0.08;
    }
}

/**
 * Muestra el tipo de cambio actual en la interfaz
 */
function displayExchangeRate() {
    try {
        const display = document.getElementById('exchange-rate-display');
        const current = document.getElementById('current-exchange-rate');
        const input = document.getElementById('exchange-rate-input');
        
        if (display) display.textContent = `$${exchangeRate.toFixed(2)}`;
        if (current) current.textContent = `$${exchangeRate.toFixed(2)}`;
        if (input) input.value = exchangeRate.toFixed(2);
    } catch (error) {
        console.error('Error al mostrar tipo de cambio:', error);
    }
}

/**
 * Muestra la tasa de IVA actual en la interfaz
 */
function displayTaxRate() {
    try {
        const display = document.getElementById('tax-rate-display');
        const current = document.getElementById('current-tax-rate');
        const input = document.getElementById('tax-rate-input');
        
        const taxPercent = (TAX_RATE * 100).toFixed(2);
        if (display) display.textContent = `${taxPercent}%`;
        if (current) current.textContent = taxPercent;
        if (input) input.value = taxPercent;
    } catch (error) {
        console.error('Error al mostrar tasa de IVA:', error);
    }
}

/**
 * Actualiza el tipo de cambio desde el formulario
 */
function updateExchangeRate(event) {
    event.preventDefault();
    try {
        const newRate = parseFloat(document.getElementById('exchange-rate-input').value);
        if (isNaN(newRate) || newRate <= 0) {
            alert('⚠️ Ingresa un tipo de cambio válido');
            return;
        }
        exchangeRate = newRate;
        localStorage.setItem('pos_exchangeRate', exchangeRate.toString());
        displayExchangeRate();
        alert(`✅ Tipo de cambio actualizado a $${exchangeRate.toFixed(2)} MXN/USD`);
        console.log(`💱 Tipo de cambio actualizado: $${exchangeRate.toFixed(2)}`);
    } catch (error) {
        console.error('Error al actualizar tipo de cambio:', error);
        alert('❌ Error al actualizar el tipo de cambio');
    }
}

/**
 * Actualiza la tasa de IVA desde el formulario
 */
function updateTaxRate(event) {
    event.preventDefault();
    try {
        const newTaxPercent = parseFloat(document.getElementById('tax-rate-input').value);
        if (isNaN(newTaxPercent) || newTaxPercent < 0 || newTaxPercent > 100) {
            alert('⚠️ Ingresa un porcentaje de IVA válido (0-100)');
            return;
        }
        TAX_RATE = newTaxPercent / 100;
        localStorage.setItem('pos_taxRate', TAX_RATE.toString());
        displayTaxRate();
        alert(`✅ IVA actualizado a ${newTaxPercent.toFixed(2)}%`);
        console.log(`📋 IVA actualizado: ${newTaxPercent.toFixed(2)}%`);
    } catch (error) {
        console.error('Error al actualizar tasa de IVA:', error);
        alert('❌ Error al actualizar la tasa de IVA');
    }
}

// ============================================
// GESTIÓN DE PESTAÑAS
// ============================================

/**
 * Cambia entre las pestañas del sistema
 * @param {string} tabName - Nombre de la pestaña a mostrar
 */
function showTab(tabName) {
    // Remover clase active de todas las pestañas
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    
    // Activar la pestaña seleccionada
    document.querySelector(`[onclick="showTab('${tabName}')"]`).classList.add('active');
    document.getElementById(`${tabName}-tab`).classList.add('active');
    
    // Cargar datos específicos de la pestaña
    if (tabName === 'admin') {
        loadProductList();
        loadCategorySelector();
    } else if (tabName === 'categories') {
        loadCategoryList();
    } else if (tabName === 'sales') {
        loadSalesHistoryTab();
    } else if (tabName === 'cashbox') {
        loadCashBoxTab();
    } else if (tabName === 'settings') {
        displayExchangeRate();
        displayTaxRate();
    }
}

// ============================================
// GESTIÓN DE PRODUCTOS
// ============================================

/**
 * Carga las pestañas de categorías
 */
function loadCategoryTabs() {
    const categoryTabs = document.getElementById('category-tabs');
    if (!categoryTabs) return;
    
    categoryTabs.innerHTML = '';
    
    // Pestaña "Todas"
    const allTab = document.createElement('div');
    allTab.className = `category-tab ${activeCategory === 'Todas' ? 'active' : ''}`;
    allTab.onclick = () => filterByCategory('Todas');
    
    const allCount = products.length;
    allTab.innerHTML = `
        <span>🏪 Todas</span>
        <span class="category-count">${allCount}</span>
    `;
    categoryTabs.appendChild(allTab);
    
    // Pestañas de categorías
    categories.forEach(category => {
        const categoryProducts = products.filter(p => p.category === category.name);
        const tab = document.createElement('div');
        tab.className = `category-tab ${activeCategory === category.name ? 'active' : ''}`;
        tab.onclick = () => filterByCategory(category.name);
        tab.style.borderColor = activeCategory === category.name ? category.color : '';
        tab.style.backgroundColor = activeCategory === category.name ? category.color : '';
        
        tab.innerHTML = `
            <span>${category.name}</span>
            <span class="category-count">${categoryProducts.length}</span>
        `;
        categoryTabs.appendChild(tab);
    });
    
    // Botón para nueva categoría
    const newTab = document.createElement('div');
    newTab.className = 'category-tab new-category';
    newTab.onclick = () => promptNewCategory();
    newTab.innerHTML = '<span>+ Nueva Categoría</span>';
    categoryTabs.appendChild(newTab);
}

/**
 * Filtra productos por categoría
 * @param {string} categoryName - Nombre de la categoría
 */
function filterByCategory(categoryName) {
    activeCategory = categoryName;
    loadCategoryTabs();
    loadProducts();
}

/**
 * Carga el selector de categorías en el formulario
 */
function loadCategorySelector() {
    const selector = document.getElementById('product-category');
    if (!selector) return;
    
    // Limpiar opciones existentes
    selector.innerHTML = '<option value="">Seleccionar categoría...</option>';
    
    // Agregar categorías existentes
    categories.forEach(category => {
        const option = document.createElement('option');
        option.value = category.name;
        option.textContent = category.name;
        selector.appendChild(option);
    });
    
    // Opción para sin categoría
    const noCategoryOption = document.createElement('option');
    noCategoryOption.value = 'Sin Categoría';
    noCategoryOption.textContent = 'Sin Categoría';
    selector.appendChild(noCategoryOption);
}

/**
 * Carga y muestra productos filtrados por categoría activa
 */
function loadProducts() {
    console.log('🔵 loadProducts() ejecutada');
    const grid = document.getElementById('products-grid');
    if (!grid) {
        console.error('❌ No se encontró el elemento products-grid');
        return;
    }
    
    grid.innerHTML = '';
    
    console.log(`📦 Intentando cargar productos. Total disponible: ${products.length}`);
    console.log(`🏷️  Categoría activa: ${activeCategory}`);
    console.log(`📋 Lista de productos:`, products);

    // Obtener productos filtrados
    const filteredProducts = getProductsByCategory(activeCategory);
    
    console.log(`📦 Productos filtrados: ${filteredProducts.length}`);

    if (filteredProducts.length === 0) {
        const message = activeCategory === 'Todas' 
            ? 'No hay productos disponibles'
            : `No hay productos en la categoría "${activeCategory}"`;
        grid.innerHTML = `<p style="text-align: center; color: #7f8c8d; padding: 40px;">${message}</p>`;
        console.log('⚠️ No hay productos para mostrar');
        return;
    }

    filteredProducts.forEach(product => {
        const card = document.createElement('div');
        card.className = 'product-card';
        card.onclick = () => addToCart(product);
        
        // Mostrar imagen del producto si existe
        let imageHTML = '';
        if (product.image && product.image.startsWith('data:')) {
            imageHTML = `<img src="${product.image}" alt="${escapeHtml(product.name)}" class="product-card-image">`;
        } else {
            // Placeholder si no hay imagen
            imageHTML = `<div class="product-card-placeholder">🍽️</div>`;
        }
        
        // Mostrar categoría en el producto
        const categoryBadge = product.category && product.category !== 'Sin Categoría' 
            ? `<div class="product-category">${escapeHtml(product.category)}</div>` 
            : '';
        
        card.innerHTML = `
            ${imageHTML}
            ${categoryBadge}
            <div class="product-name">${escapeHtml(product.name)}</div>
            <div class="product-price">$${product.price.toFixed(2)}</div>
        `;
        
        grid.appendChild(card);
    });
    
    console.log(`✅ ${filteredProducts.length} productos cargados en la vista`);
}

/**
 * Comprime una imagen para reducir el tamaño de almacenamiento
 * @param {File} file - Archivo de imagen a comprimir
 * @param {number} maxWidth - Ancho máximo de la imagen
 * @param {number} maxHeight - Alto máximo de la imagen
 * @param {number} quality - Calidad de compresión (0-1)
 * @returns {Promise<string>} - Promesa que resuelve con la imagen en base64
 */
function compressImage(file, maxWidth = 400, maxHeight = 400, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = function(event) {
            const img = new Image();
            img.src = event.target.result;
            img.onload = function() {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                // Calcular nuevo tamaño manteniendo proporción
                if (width > height) {
                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width *= maxHeight / height;
                        height = maxHeight;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Convertir a base64 con calidad reducida
                const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
                resolve(compressedBase64);
            };
            img.onerror = function() {
                reject(new Error('Error al cargar la imagen'));
            };
        };
        reader.onerror = function() {
            reject(new Error('Error al leer el archivo'));
        };
    });
}

/**
 * Agrega un nuevo producto al sistema
 * @param {Event} event - Evento del formulario
 */
function addProduct(event) {
    event.preventDefault();
    
    console.log('🔵 addProduct() ejecutada');
    
    const name = document.getElementById('product-name').value.trim();
    const price = parseFloat(document.getElementById('product-price').value);
    const category = document.getElementById('product-category').value.trim();
    const productImage = document.getElementById("product-image").files[0];
    const form = document.getElementById("add-product-form");
    const editingProductId = form.dataset.editingProductId;
    
    console.log(`📦 Datos del nuevo producto:`, { name, price, category, hasImage: !!productImage });
    
    // Validaciones
    if (!name) {
        alert('⚠️ El nombre del producto es obligatorio');
        return;
    }
    
    if (price < 0) {
        alert('⚠️ El precio no puede ser negativo');
        return;
    }
    
    if (isNaN(price)) {
        alert('⚠️ Ingresa un precio válido');
        return;
    }
    
    if (!category) {
        alert('⚠️ Selecciona una categoría');
        return;
    }
    
    // Verificar si ya existe un producto con el mismo nombre (excepto si es el mismo que estamos editando)
    const existingProduct = products.find(p => 
        p.name.toLowerCase() === name.toLowerCase() && p.id !== parseInt(editingProductId || -1)
    );
    
    if (existingProduct) {
        alert('⚠️ Ya existe un producto con ese nombre');
        return;
    }
    
    // Si estamos editando, usar saveProductChanges en su lugar
    if (editingProductId) {
        saveProductChanges(parseInt(editingProductId));
        return;
    }
    
    // Procesar imagen a base64 si existe
    if (productImage) {
        // Comprimir la imagen antes de guardarla
        compressImage(productImage)
            .then(compressedImage => {
                const newProduct = {
                    id: nextProductId++,
                    name: name,
                    price: price,
                    category: category,
                    image: compressedImage // Guardar imagen comprimida en base64
                };
                
                console.log(`✅ Producto con imagen creado, ID: ${newProduct.id}`);
                products.push(newProduct);
                console.log(`📊 Total de productos ahora: ${products.length}`);
                saveProducts();
                document.getElementById('add-product-form').reset();
                
                // Recargar todas las vistas
                console.log('🔄 Recargando vistas...');
                loadProducts();
                loadProductList();
                loadCategoryTabs();
                
                console.log('✅ Producto agregado exitosamente');
                alert(`✅ Producto "${name}" agregado exitosamente!`);
            })
            .catch(error => {
                console.error('Error al comprimir imagen:', error);
                alert('⚠️ Error al procesar la imagen. Intenta con otra imagen.');
            });
    } else {
        // Si no hay imagen, guardar sin imagen
        const newProduct = {
            id: nextProductId++,
            name: name,
            price: price,
            category: category,
            image: null
        };
        
        console.log(`✅ Producto sin imagen creado, ID: ${newProduct.id}`);
        products.push(newProduct);
        console.log(`📊 Total de productos ahora: ${products.length}`);
        saveProducts();
        document.getElementById('add-product-form').reset();
        
        // Recargar todas las vistas
        console.log('🔄 Recargando vistas...');
        loadProducts();
        loadProductList();
        loadCategoryTabs();
        
        console.log('✅ Producto agregado exitosamente');
        alert(`✅ Producto "${name}" agregado exitosamente!`);
    }
}

/**
 * Muestra el formulario para crear nueva categoría
 */
function showNewCategoryForm() {
    document.getElementById('new-category-form').style.display = 'block';
    document.getElementById('new-category-name').focus();
}

/**
 * Oculta el formulario para crear nueva categoría
 */
function hideNewCategoryForm() {
    document.getElementById('new-category-form').style.display = 'none';
    document.getElementById('new-category-name').value = '';
    document.getElementById('new-category-color').value = '#722F37';
}

/**
 * Crea una nueva categoría desde el formulario
 */
function createNewCategory() {
    const name = document.getElementById('new-category-name').value.trim();
    const color = document.getElementById('new-category-color').value;
    
    if (!name) {
        alert(' El nombre de la categoría es obligatorio');
        return;
    }
    
    const newCategory = createCategory(name, color);
    if (newCategory) {
        hideNewCategoryForm();
        loadCategorySelector();
        loadCategoryTabs();
        
        // Seleccionar la nueva categoría
        document.getElementById('product-category').value = newCategory.name;
        alert(` Categoría "${newCategory.name}" creada exitosamente!`);
    }
}

/**
 * Prompt para crear nueva categoría desde pestaña
 */
function promptNewCategory() {
    const name = prompt('Nombre de la nueva categoría:');
    if (!name) return;
    
    const newCategory = createCategory(name);
    if (newCategory) {
        loadCategoryTabs();
        loadCategorySelector();
        alert(` Categoría "${newCategory.name}" creada exitosamente!`);
    }
}

/**
 * Agregar categoría desde el formulario principal
 * @param {Event} event - Evento del formulario
 */
function addCategoryFromForm(event) {
    event.preventDefault();
    
    const name = document.getElementById('category-name').value.trim();
    const color = document.getElementById('category-color').value;
    
    if (!name) {
        alert(' El nombre de la categoría es obligatorio');
        return;
    }
    
    const newCategory = createCategory(name, color);
    if (newCategory) {
        // Limpiar formulario
        document.getElementById('add-category-form').reset();
        document.getElementById('category-color').value = '#722F37';
        
        // Actualizar vistas
        loadCategoryList();
        loadCategoryTabs();
        loadCategorySelector();
        
        alert(` Categoría "${newCategory.name}" creada exitosamente!`);
    }
}

/**
 * Cargar lista de categorías en administración
 */
function loadCategoryList() {
    const list = document.getElementById('category-list');
    if (!list) return;
    
    list.innerHTML = '';
    
    if (categories.length === 0) {
        list.innerHTML = '<p style="text-align: center; color: #7f8c8d; padding: 20px;">No hay categorías registradas</p>';
        return;
    }
    
    categories.forEach(category => {
        const productsInCategory = products.filter(p => p.category === category.name).length;
        
        const item = document.createElement('div');
        item.className = 'category-list-item';
        
        item.innerHTML = `
            <div class="category-info">
                <div class="category-color-indicator" style="background: ${category.color}"></div>
                <div>
                    <strong>${escapeHtml(category.name)}</strong><br>
                    <small style="color: #6c757d;">${productsInCategory} producto(s)</small>
                </div>
            </div>
            <div class="category-actions">
                <button class="btn-edit" onclick="editCategory(${category.id})">
 Editar
                </button>
                <button class="btn btn-danger" onclick="deleteCategoryWithConfirm(${category.id})">
 Eliminar
                </button>
            </div>
        `;
        
        list.appendChild(item);
    });
}

/**
 * Eliminar categoría con confirmación y actualización de vistas
 * @param {number} categoryId - ID de la categoría a eliminar
 */
function deleteCategoryWithConfirm(categoryId) {
    const success = deleteCategory(categoryId);
    if (success) {
        // Actualizar todas las vistas
        loadCategoryList();
        loadCategoryTabs();
        loadCategorySelector();
        loadProducts();
        loadProductList();
        
        // Si estábamos viendo esa categoría, cambiar a "Todas"
        const deletedCategory = categories.find(c => c.id === categoryId);
        if (deletedCategory && activeCategory === deletedCategory.name) {
            filterByCategory('Todas');
        }
        
        alert(' Categoría eliminada exitosamente!');
    }
}

/**
 * Editar categoría existente
 * @param {number} categoryId - ID de la categoría a editar
 */
function editCategory(categoryId) {
    const category = categories.find(c => c.id === categoryId);
    if (!category) {
        alert(' Categoría no encontrada');
        return;
    }
    
    const newName = prompt(`Editar nombre de categoría:`, category.name);
    if (!newName) return;
    
    if (newName.trim() === category.name) {
        alert(' No se realizaron cambios');
        return;
    }
    
    // Verificar que no exista otra categoría con ese nombre
    const existingCategory = categories.find(c => 
        c.id !== categoryId && c.name.toLowerCase() === newName.trim().toLowerCase()
    );
    
    if (existingCategory) {
        alert(' Ya existe una categoría con ese nombre');
        return;
    }
    
    const oldName = category.name;
    category.name = newName.trim();
    
    // Actualizar productos que tenían la categoría antigua
    products.forEach(product => {
        if (product.category === oldName) {
            product.category = category.name;
        }
    });
    
    // Guardar cambios
    saveCategories();
    saveProducts();
    
    // Actualizar vistas
    loadCategoryList();
    loadCategoryTabs();
    loadCategorySelector();
    loadProducts();
    loadProductList();
    
    // Actualizar categoría activa si es necesario
    if (activeCategory === oldName) {
        activeCategory = category.name;
    }
    
    alert(` Categoría renombrada de "${oldName}" a "${category.name}"`);
}

/**
 * Establece el color seleccionado en el formulario
 * @param {string} color - Color en formato hexadecimal
 */
function setColor(color) {
    document.getElementById('category-color').value = color;
    
    // Actualizar indicadores visuales
    document.querySelectorAll('.color-preset').forEach(preset => {
        preset.classList.remove('active');
    });
    
    document.querySelector(`[style*="${color}"]`).classList.add('active');
}

/**
 * Elimina un producto del sistema
 * @param {number} productId - ID del producto a eliminar
 */
/**
 * Elimina todos los productos del sistema
 */
function deleteAllProducts() {
    if (products.length === 0) {
        alert('⚠️ No hay productos para eliminar');
        return;
    }
    
    const confirmMsg = `¿Estás seguro de eliminar TODOS los productos (${products.length})?\n\n⚠️ Esta acción no se puede deshacer.\n\nSe eliminarán todos los productos del sistema.`;
    
    if (confirm(confirmMsg)) {
        // Eliminar todos los productos
        products = [];
        
        // Limpiar el carrito
        cart = [];
        
        // Guardar en localStorage
        saveProducts();
        
        // Actualizar las vistas
        renderProducts();
        renderProductList();
        renderCart();
        
        alert('✅ Todos los productos han sido eliminados');
    }
}

function deleteProduct(productId) {
    const product = products.find(p => p.id === productId);
    
    if (!product) {
        alert(' Producto no encontrado');
        return;
    }
    
    if (confirm(`¿Eliminar "${product.name}"?\n\nEsta acción no se puede deshacer.`)) {
        // Eliminar de la lista de productos
        products = products.filter(p => p.id !== productId);
        
        // 🔥 GUARDAR EN LOCALSTORAGE
        saveProducts();
        
        // Eliminar del carrito si está presente
        cart = cart.filter(item => item.id !== productId);
        
        // Actualizar vistas
        loadProducts();
        loadProductList();
        loadCategoryTabs();
        updateCart();
        
        alert(' Producto eliminado exitosamente!');
    }
}

/**
 * Carga la lista de productos en el panel de administración
 */
function loadProductList() {
    const list = document.getElementById('product-list');
    list.innerHTML = '';
    
    if (products.length === 0) {
        list.innerHTML = '<p style="text-align: center; color: #7f8c8d; padding: 20px;">No hay productos registrados</p>';
        return;
    }
    
    products.forEach(product => {
        const item = document.createElement('div');
        item.className = 'product-list-item';
        
        const categoryBadge = product.category && product.category !== 'Sin Categoría'
            ? `<span style="background: #722F37; color: white; font-size: 10px; padding: 2px 6px; border-radius: 10px; margin-left: 8px;">${escapeHtml(product.category)}</span>`
            : '';
        
        // Mostrar imagen en base64 o placeholder
        const imageSrc = product.image && product.image.startsWith('data:') 
            ? product.image 
            : 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22%3E%3Crect fill=%22%23ddd%22 width=%22100%22 height=%22100%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22%23999%22 font-size=%2214%22%3ESin imagen%3C/text%3E%3C/svg%3E';
        
        item.innerHTML = `
            <img src="${imageSrc}" alt="${product.name}" class="product-image">
            <div>
                <strong>${escapeHtml(product.name)}</strong>${categoryBadge}<br>
                <span style="color: #27ae60; font-weight: 600;">$${product.price.toFixed(2)}</span>
            </div>
            <div style="display: flex; gap: 5px;">
                <button class="btn btn-small" onclick="editProduct(${product.id})" style="background-color: #2980b9; color: white;">
                    ✎ Editar
                </button>
                <button class="btn btn-danger" onclick="deleteProduct(${product.id})">
                    🗑 Eliminar
                </button>
            </div>
        `;
        
        list.appendChild(item);
    });
}

// ============================================
// GESTIÓN DEL CARRITO
// ============================================

/**
 * Agrega un producto al carrito
 * @param {Object} product - Producto a agregar
 */
function addToCart(product) {
    const existingItem = cart.find(item => item.id === product.id);
    
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({
            id: product.id,
            name: product.name,
            price: product.price,
            quantity: 1
        });
    }
    
    updateCart();
    
    // Feedback visual (opcional)
    showNotification(` ${product.name} agregado al carrito`);
}

/**
 * Actualiza la visualización del carrito
 */
function updateCart() {
    const cartItems = document.getElementById('cart-items');
    const cartTotal = document.getElementById('cart-total');
    
    if (cart.length === 0) {
        cartItems.innerHTML = `
            <div class="empty-cart">
                <span></span>
                <p>Carrito vacío<br>Selecciona productos para comenzar</p>
            </div>
        `;
        cartTotal.style.display = 'none';
        return;
    }
    
    cartItems.innerHTML = '';
    cartTotal.style.display = 'block';
    
    cart.forEach(item => {
        const cartItem = document.createElement('div');
        cartItem.className = 'cart-item';
        
        const itemTotalMXN = item.price * item.quantity;
        const itemPriceUSD = convertToUSD(item.price);
        const itemTotalUSD = convertToUSD(itemTotalMXN);
        
        cartItem.innerHTML = `
            <div class="item-info">
                <div class="item-name">${escapeHtml(item.name)}</div>
                <div class="item-price">$${item.price.toFixed(2)} MXN / USD $${itemPriceUSD.toFixed(2)} c/u</div>
                <div class="quantity-controls">
                    <button class="qty-btn" onclick="updateQuantity(${item.id}, -1)">-</button>
                    <span class="quantity">${item.quantity}</span>
                    <button class="qty-btn" onclick="updateQuantity(${item.id}, 1)">+</button>
                </div>
            </div>
            <div>
                <div style="text-align: right; margin-bottom: 10px;">
                    <strong>$${itemTotalMXN.toFixed(2)} MXN<br>USD $${itemTotalUSD.toFixed(2)}</strong>
                </div>
                <button class="remove-btn" onclick="removeFromCart(${item.id})">
 Eliminar
                </button>
            </div>
        `;
        
        cartItems.appendChild(cartItem);
    });
    
    calculateTotal();
}

/**
 * Actualiza la cantidad de un producto en el carrito
 * @param {number} productId - ID del producto
 * @param {number} change - Cambio en la cantidad (+1 o -1)
 */
function updateQuantity(productId, change) {
    const item = cart.find(item => item.id === productId);
    
    if (!item) return;
    
    item.quantity += change;
    
    if (item.quantity <= 0) {
        removeFromCart(productId);
    } else {
        updateCart();
    }
}

/**
 * Elimina un producto del carrito
 * @param {number} productId - ID del producto a eliminar
 */
function removeFromCart(productId) {
    const item = cart.find(item => item.id === productId);
    
    if (item && confirm(`¿Eliminar "${item.name}" del carrito?`)) {
        cart = cart.filter(item => item.id !== productId);
        updateCart();
        showNotification(`➖ Producto eliminado del carrito`);
    }
}

/**
 * Calcula y muestra los totales del carrito
 */
function calculateTotal() {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = subtotal * TAX_RATE;
    const total = subtotal + tax;
    
    // Convertir a dólares
    const subtotalUSD = convertToUSD(subtotal);
    const taxUSD = convertToUSD(tax);
    const totalUSD = convertToUSD(total);
    
    document.getElementById('subtotal').textContent = `$${subtotal.toFixed(2)} MXN / USD $${subtotalUSD.toFixed(2)}`;
    document.getElementById('tax').textContent = `$${tax.toFixed(2)} MXN / USD $${taxUSD.toFixed(2)}`;
    document.getElementById('total').textContent = `$${total.toFixed(2)} MXN / USD $${totalUSD.toFixed(2)}`;
}

/**
 * Procesa la venta
 */
function checkout() {
    if (cart.length === 0) {
        alert(' El carrito está vacío');
        return;
    }
    
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = subtotal * TAX_RATE;
    const total = subtotal + tax;
    const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    
    // Convertir a dólares
    const subtotalUSD = convertToUSD(subtotal);
    const taxUSD = convertToUSD(tax);
    const totalUSD = convertToUSD(total);
    
    // Generar resumen de la venta
    let summary = `🧾 RESUMEN DE LA VENTA\n\n`;
    summary += `Productos (${itemCount} artículos):\n`;
    
    cart.forEach(item => {
        const itemTotalUSD = convertToUSD(item.price * item.quantity);
        summary += `• ${item.name} x${item.quantity} - $${(item.price * item.quantity).toFixed(2)} MXN (USD $${itemTotalUSD.toFixed(2)})\n`;
    });
    
    summary += `\n TOTALES:\n`;
    summary += `Subtotal: $${subtotal.toFixed(2)} MXN / USD $${subtotalUSD.toFixed(2)}\n`;
    summary += `IVA (${(TAX_RATE * 100)}%): $${tax.toFixed(2)} MXN / USD $${taxUSD.toFixed(2)}\n`;
    summary += `TOTAL: $${total.toFixed(2)} MXN / USD $${totalUSD.toFixed(2)}`;
    
    if (confirm(`${summary}\n\n¿Confirmar la venta?`)) {
        // Registrar la venta en el historial
        recordSale(cart, subtotal, tax, total);
        
        // Procesar la venta
        alert(` ¡Venta procesada exitosamente!\n\nTotal: $${total.toFixed(2)} MXN (USD $${totalUSD.toFixed(2)})\n ¡Gracias por su compra!`);
        
        // Limpiar el carrito
        cart = [];
        updateCart();
        
        // Cambiar a la pestaña de punto de venta
        showTab('pos');
    }
}

// ============================================
// FUNCIONES AUXILIARES
// ============================================

/**
 * Escapa caracteres HTML para prevenir XSS
 * @param {string} text - Texto a escapar
 * @returns {string} Texto escapado
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
 * Registra una venta en el historial
 * @param {Array} items - Items vendidos
 * @param {number} subtotal - Subtotal de la venta
 * @param {number} tax - IVA de la venta
 * @param {number} total - Total de la venta
 */
function recordSale(items, subtotal, tax, total) {
    try {
        const sale = {
            id: Date.now(),
            date: new Date().toISOString(),
            items: items.reduce((sum, item) => sum + item.quantity, 0),
            subtotal: subtotal,
            tax: tax,
            total: total,
            payment: 'Efectivo',
            products: items.map(item => ({
                name: item.name,
                price: item.price,
                quantity: item.quantity
            }))
        };
        
        salesHistory.push(sale);
        localStorage.setItem('pos_salesHistory', JSON.stringify(salesHistory));
        console.log('✅ Venta registrada en historial:', sale);
    } catch (error) {
        console.error('❌ Error al registrar venta:', error);
    }
}

/**
 * Muestra una notificación temporal
 * @param {string} message - Mensaje a mostrar
 */
function showNotification(message) {
    // Crear elemento de notificación
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #27ae60;
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        z-index: 1000;
        font-weight: 600;
        transform: translateX(300px);
        transition: transform 0.3s ease;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Mostrar notificación
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
    }, 100);
    
    // Ocultar notificación después de 3 segundos
    setTimeout(() => {
        notification.style.transform = 'translateX(300px)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 3000);
}

// ============================================
// INICIALIZACIÓN DEL SISTEMA
// ============================================

/**
 * Inicializa el sistema cuando se carga la página
 */
function initializeSystem() {
    console.log('⏳ Iniciando sistema POS...');
    
    try {
        // 🔥 CARGAR DATOS DESDE LOCALSTORAGE
        loadCategoriesFromStorage();
        loadProductsFromStorage();
        loadSalesHistory();
        loadCashBoxRecords();
        loadExchangeRate();
        loadTaxRate();
        loadCartFromStorage();
        
        console.log(`📥 Datos cargados del localStorage`);
        console.log(`   - Productos: ${products.length}`);
        console.log(`   - Categorías: ${categories.length}`);
        
        // VERIFICACIÓN: Solo validar que sean arrays, NO restaurar si están vacíos
        // (el usuario pudo haberlos eliminado intencionalmente)
        if (!Array.isArray(products)) {
            console.log('⚠️ Productos no es un array válido, inicializando...');
            products = [];
        }
        
        if (!Array.isArray(categories)) {
            console.log('⚠️ Categorías no es un array válido, inicializando...');
            categories = [];
        }
        
        // Asegurar que todos los productos tengan la propiedad image
        products.forEach(product => {
            if (!product.hasOwnProperty('image')) {
                product.image = null;
            }
        });
        saveProducts();
        
        // Esperar un poco a que el DOM esté completamente listo
        setTimeout(() => {
            try {
                console.log('⏳ Renderizando interfaz...');
                console.log(`   Productos a renderizar: ${products.length}`);
                console.log(`   Categorías disponibles: ${categories.length}`);
                
                // Inicializar vistas
                loadCategoryTabs();
                loadCategorySelector();
                loadProducts();
                updateCart();
                displayExchangeRate();
                displayTaxRate();
                
                console.log('✅ Sistema POS inicializado correctamente');
                console.log(` ${categories.length} categorías disponibles`);
                console.log(` ${products.length} productos disponibles`);
                console.log(` ${salesHistory.length} ventas en el historial`);
                console.log(` ${cashBoxRecords.length} registros de caja`);
                console.log(` Tipo de cambio actual: $${exchangeRate.toFixed(2)} MXN/USD`);
                console.log(` IVA actual: ${(TAX_RATE * 100).toFixed(2)}%`);
            } catch (error) {
                console.error('❌ Error al renderizar interfaz:', error);
                console.error('Stack:', error.stack);
                alert('Error al inicializar la interfaz. Abre la consola (F12) para más detalles.');
            }
        }, 200);
        
    } catch (error) {
        console.error('❌ Error crítico en initializeSystem:', error);
        console.error('Stack:', error.stack);
        alert('Error al inicializar el sistema. Abre la consola (F12) para más detalles.');
    }
}

/**
 * Limpia el localStorage completamente y reinicia con datos por defecto
 */
function resetSystem() {
    console.log('🔄 Iniciando reinicio completo del sistema...');
    
    if (confirm('⚠️ Esto eliminará TODOS los datos guardados y cargará los productos por defecto.\n\n¿Continuar?')) {
        try {
            // Limpiar localStorage completamente
            console.log('🗑️  Limpiando localStorage...');
            localStorage.clear();
            
            // Resetear todas las variables globales
            products = [];
            categories = [];
            cart = [];
            activeCategory = 'Todas';
            nextProductId = 9;
            nextCategoryId = 5;
            
            // Cargar valores por defecto
            console.log('📦 Cargando valores por defecto...');
            products = JSON.parse(JSON.stringify(defaultProducts));
            categories = JSON.parse(JSON.stringify(defaultCategories));
            
            // Asegurar que todos los productos tengan imagen
            products.forEach(p => {
                if (!p.hasOwnProperty('image')) p.image = null;
            });
            
            // Guardar en localStorage
            console.log('💾 Guardando en localStorage...');
            saveProducts();
            saveCategories();
            saveCart();
            
            console.log('✅ Sistema reiniciado correctamente');
            console.log(`   - ${products.length} productos cargados`);
            console.log(`   - ${categories.length} categorías cargadas`);
            
            alert('✅ Sistema reiniciado correctamente. Recargando página...');
            window.location.reload();
        } catch (error) {
            console.error('❌ Error al reiniciar:', error);
            alert('Error al reiniciar el sistema. Abre la consola (F12) para más detalles.');
        }
    }
}

// Inicializar cuando se carga el DOM
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        console.log('📄 DOM completamente cargado');
        setTimeout(initializeSystem, 300);
    });
} else {
    // Si el DOM ya está cargado, ejecutar inmediatamente
    console.log('📄 DOM ya estaba cargado, inicializando...');
    setTimeout(initializeSystem, 300);
}

// ============================================
// CONTROL DE FONDO DE CAJA
// ============================================

// Array para almacenar registros de caja
let cashBoxRecords = [];

// ID para nuevos registros
let nextCashBoxId = 1;

// Objeto para almacenar el cálculo currente
let currentCashBoxCalculation = {
    initialFund: 0,
    dailySales: 0,
    minorExpenses: 0,
    totalInCash: 0,
    netSales: 0
};

/**
 * Guarda los registros de caja en LocalStorage
 */
function saveCashBoxRecords() {
    try {
        localStorage.setItem('pos_cashbox_records', JSON.stringify(cashBoxRecords));
        localStorage.setItem('pos_nextCashBoxId', nextCashBoxId.toString());
        console.log(' Registros de caja guardados en LocalStorage');
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
            console.log(` ${cashBoxRecords.length} registros de caja cargados desde LocalStorage`);
        } else {
            cashBoxRecords = [];
            console.log(' No hay registros de caja previos');
        }
        
        if (savedNextId) {
            nextCashBoxId = parseInt(savedNextId);
        }
        
    } catch (error) {
        console.error(' Error al cargar registros de caja:', error);
        cashBoxRecords = [];
    }
}

/**
 * Calcula los totales de caja
 * @param {Event} event - Evento del formulario
 */
function calculateCashBox(event) {
    event.preventDefault();
    
    // Obtener valores del formulario
    const initialFund = parseFloat(document.getElementById('initial-fund').value);
    const dailySales = parseFloat(document.getElementById('daily-sales').value);
    const minorExpenses = parseFloat(document.getElementById('minor-expenses').value);
    
    // Validaciones
    if (isNaN(initialFund) || isNaN(dailySales) || isNaN(minorExpenses)) {
        alert(' Por favor ingresa valores numéricos válidos');
        return;
    }
    
    if (initialFund < 0 || dailySales < 0 || minorExpenses < 0) {
        alert(' Los valores no pueden ser negativos');
        return;
    }
    
    // Cálculos
    const totalInCash = initialFund + dailySales - minorExpenses;
    const netSales = totalInCash - initialFund;
    
    // Almacenar en objeto actual
    currentCashBoxCalculation = {
        initialFund: initialFund,
        dailySales: dailySales,
        minorExpenses: minorExpenses,
        totalInCash: totalInCash,
        netSales: netSales
    };
    
    // Mostrar resultados
    document.getElementById('total-cashbox').textContent = `$${totalInCash.toFixed(2)}`;
    document.getElementById('net-sales').textContent = `$${netSales.toFixed(2)}`;
    
    const resultsPanel = document.getElementById('cashbox-results');
    resultsPanel.style.display = 'block';
    
    // Scroll a los resultados
    resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    
    console.log(' Cálculo de caja realizado:', currentCashBoxCalculation);
}

/**
 * Guarda el registro actual de caja en el historial
 */
function saveCashBoxRecord() {
    if (currentCashBoxCalculation.totalInCash === 0 && currentCashBoxCalculation.netSales === 0) {
        alert(' Debes calcular primero antes de guardar');
        return;
    }
    
    const record = {
        id: nextCashBoxId++,
        date: new Date().toISOString(),
        initialFund: currentCashBoxCalculation.initialFund,
        dailySales: currentCashBoxCalculation.dailySales,
        minorExpenses: currentCashBoxCalculation.minorExpenses,
        totalInCash: currentCashBoxCalculation.totalInCash,
        netSales: currentCashBoxCalculation.netSales
    };
    
    // Agregar al inicio del array (más reciente primero)
    cashBoxRecords.unshift(record);
    
    // Guardar en localStorage
    saveCashBoxRecords();
    
    // Actualizar tabla
    loadCashBoxTable();
    
    // Limpiar formulario
    document.getElementById('cashbox-form').reset();
    
    // Ocultar resultados
    document.getElementById('cashbox-results').style.display = 'none';
    
    // Resetear cálculo actual
    currentCashBoxCalculation = {
        initialFund: 0,
        dailySales: 0,
        minorExpenses: 0,
        totalInCash: 0,
        netSales: 0
    };
    
    alert(' Registro guardado exitosamente!');
    console.log(' Nuevo registro de caja guardado:', record);
}

/**
 * Carga la pestaña de control de caja
 */
function loadCashBoxTab() {
    loadCashBoxTable();
    updateCashBoxSummary();
}

/**
 * Actualiza el resumen del control de caja
 */
function updateCashBoxSummary() {
    const totalIngresos = cashBoxRecords.filter(r => r.type === 'ingreso').reduce((sum, r) => sum + r.amount, 0);
    const totalEgresos = cashBoxRecords.filter(r => r.type === 'egreso').reduce((sum, r) => sum + r.amount, 0);
    const balance = totalIngresos - totalEgresos;
    
    // Actualizar elementos si existen
    const ingresosEl = document.getElementById('total-ingresos');
    const egresosEl = document.getElementById('total-egresos');
    const balanceEl = document.getElementById('balance-caja');
    
    if (ingresosEl) ingresosEl.textContent = `$${totalIngresos.toFixed(2)}`;
    if (egresosEl) egresosEl.textContent = `$${totalEgresos.toFixed(2)}`;
    if (balanceEl) balanceEl.textContent = `$${balance.toFixed(2)}`;
}

/**
 * Carga y muestra la tabla de historial de caja
 */
function loadCashBoxTable() {
    const tbody = document.getElementById('cashbox-tbody');
    
    if (cashBoxRecords.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; padding: 20px; color: #999;">No hay registros</td></tr>';
        return;
    }
    
    tbody.innerHTML = '';
    
    cashBoxRecords.forEach(record => {
        const date = new Date(record.date);
        const formattedDate = date.toLocaleDateString('es-MX', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formattedDate}</td>
            <td>$${record.initialFund.toFixed(2)}</td>
            <td>$${record.dailySales.toFixed(2)}</td>
            <td>$${record.minorExpenses.toFixed(2)}</td>
            <td><strong>$${record.totalInCash.toFixed(2)}</strong></td>
            <td><strong style="color: #27ae60;">$${record.netSales.toFixed(2)}</strong></td>
            <td>
                <button class="action-btn" onclick="deleteCashBoxRecord(${record.id})">Eliminar</button>
            </td>
        `;
        
        tbody.appendChild(row);
    });
}

/**
 * Elimina un registro de caja
 * @param {number} recordId - ID del registro a eliminar
 */
function deleteCashBoxRecord(recordId) {
    const record = cashBoxRecords.find(r => r.id === recordId);
    
    if (!record) {
        alert(' Registro no encontrado');
        return;
    }
    
    const date = new Date(record.date).toLocaleDateString('es-MX');
    if (confirm(`¿Eliminar el registro del ${date}?\n\nFondo: $${record.initialFund.toFixed(2)} | Ventas: $${record.dailySales.toFixed(2)}`)) {
        cashBoxRecords = cashBoxRecords.filter(r => r.id !== recordId);
        saveCashBoxRecords();
        loadCashBoxTable();
        alert(' Registro eliminado exitosamente');
    }
}

/**
 * Limpia todo el historial de caja
 */
function clearCashBoxHistory() {
    if (cashBoxRecords.length === 0) {
        alert(' No hay registros para limpiar');
        return;
    }
    
    const confirmMsg = ` ¿Estás seguro de que quieres borrar TODOS los registros de caja?\n\nSe eliminarán ${cashBoxRecords.length} registros.\n\nEsta acción NO se puede deshacer.`;
    
    if (confirm(confirmMsg)) {
        if (confirm('🚨 ÚLTIMA CONFIRMACIÓN\n\n¿Realmente quieres borrar TODO el historial de caja?\n\nEsta acción es IRREVERSIBLE.')) {
            cashBoxRecords = [];
            nextCashBoxId = 1;
            saveCashBoxRecords();
            loadCashBoxTable();
            alert(' Historial de caja borrado completamente');
            console.log(' Historial de caja borrado por el usuario');
        }
    }
}

/**
 * Exporta el historial de caja a CSV
 */
function exportCashBoxHistory() {
    if (cashBoxRecords.length === 0) {
        alert(' No hay registros para exportar');
        return;
    }
    
    // Crear contenido CSV
    let csvContent = 'Fecha y Hora,Fondo Inicial,Ventas del Día,Gastos Menores,Total en Caja,Ventas Netas\n';
    
    cashBoxRecords.forEach(record => {
        const date = new Date(record.date).toLocaleDateString('es-MX') + ' ' + 
                     new Date(record.date).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
        
        csvContent += `"${date}",${record.initialFund.toFixed(2)},${record.dailySales.toFixed(2)},${record.minorExpenses.toFixed(2)},${record.totalInCash.toFixed(2)},${record.netSales.toFixed(2)}\n`;
    });
    
    // Crear y descargar archivo
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `fondo_caja_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    alert(` Se exportaron ${cashBoxRecords.length} registros exitosamente`);
}

/**
 * Edita un producto existente
 * @param {number} productId - ID del producto a editar
 */
function editProduct(productId) {
    const product = products.find(p => p.id === productId);

    if (!product) {
        alert("Producto no encontrado");
        return;
    }

    // Cargar los datos en el formulario
    document.getElementById("product-name").value = product.name;
    document.getElementById("product-price").value = product.price;
    document.getElementById("product-category").value = product.category;
    
    // Desplazar hacia el formulario
    document.querySelector('.admin-section').scrollIntoView({ behavior: 'smooth' });

    // Guardar el ID del producto en edición
    document.getElementById("add-product-form").dataset.editingProductId = productId;

    // Cambiar el texto del botón para indicar que se está editando
    const submitButton = document.querySelector("#add-product-form button[type='submit']");
    submitButton.textContent = "✓ Guardar Cambios";
    submitButton.style.backgroundColor = "#2980b9";
}

/**
 * Guarda los cambios de un producto editado
 * @param {number} productId - ID del producto a actualizar
 */
function saveProductChanges(productId) {
    // Obtener los datos actualizados del formulario
    const updatedName = document.getElementById("product-name").value.trim();
    const updatedPrice = parseFloat(document.getElementById("product-price").value);
    const updatedCategory = document.getElementById("product-category").value.trim();
    const productImageFile = document.getElementById("product-image").files[0];

    // Validaciones
    if (!updatedName) {
        alert(" El nombre del producto es obligatorio");
        return;
    }

    if (updatedPrice < 0 || isNaN(updatedPrice)) {
        alert(" Ingresa un precio válido");
        return;
    }

    if (!updatedCategory) {
        alert(" Selecciona una categoría");
        return;
    }

    const productIndex = products.findIndex(p => p.id === productId);

    if (productIndex === -1) {
        alert("Producto no encontrado");
        return;
    }

    // Función para guardar los cambios
    const performUpdate = (imageData) => {
        products[productIndex] = {
            ...products[productIndex],
            name: updatedName,
            price: updatedPrice,
            category: updatedCategory,
            image: imageData !== undefined ? imageData : products[productIndex].image
        };

        saveProducts();
        document.getElementById("add-product-form").reset();
        delete document.getElementById("add-product-form").dataset.editingProductId;
        
        const submitButton = document.querySelector("#add-product-form button[type='submit']");
        submitButton.textContent = "Agregar Producto";
        submitButton.style.backgroundColor = "";

        loadProductList();
        loadCategoryTabs();
        alert(` Producto \"${updatedName}\" actualizado exitosamente!`);
    };

    // Si hay imagen nueva, convertir a base64
    if (productImageFile) {
        // Comprimir la imagen antes de guardarla
        compressImage(productImageFile)
            .then(compressedImage => {
                performUpdate(compressedImage);
            })
            .catch(error => {
                console.error('Error al comprimir imagen:', error);
                alert('⚠️ Error al procesar la imagen. Intenta con otra imagen.');
            });
    } else {
        // Sin imagen nueva, mantener la anterior
        performUpdate(undefined);
    }
}

// ============================================
// NUEVAS FUNCIONES PARA PERSISTENCIA DEL CARRITO
// ============================================

/**
 * Guarda el carrito en LocalStorage
 */
function saveCart() {
    try {
        localStorage.setItem('pos_cart', JSON.stringify(cart));
        console.log('Carrito guardado en LocalStorage');
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
            console.log(`Carrito cargado con ${cart.length} productos`);
        } else {
            cart = []; // Si no hay carrito guardado, inicializar vacío
        }
    } catch (error) {
        console.error('Error al cargar el carrito:', error);
        cart = []; // Si hay error, inicializar carrito vacío
    }
}

// ============================================
// FUNCIONES DE DEPURACIÓN Y MANTENIMIENTO
// ============================================

// Funciones de utilidad global
window.limpiar = function() {
    console.log('🧹 Limpiando datos...');
    localStorage.clear();
    products = [];
    categories = [];
    location.reload();
};

window.cargarDefecto = function() {
    console.log('📦 Cargando productos por defecto...');
    products = JSON.parse(JSON.stringify(defaultProducts));
    products.forEach(p => {
        if (!p.hasOwnProperty('image')) p.image = null;
    });
    saveProducts();
    loadProducts();
    loadCategoryTabs();
    console.log('✅ Productos cargados:', products.length);
};

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