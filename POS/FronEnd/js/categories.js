/*
 * CATEGORÍAS
 * Alta, edición y eliminación de categorías, filtros de la pantalla de Venta
 * y selector de categoría del formulario de productos. Los cambios se guardan
 * en la API y después se recarga el catálogo.
 */

/** Refresca todas las vistas que muestran categorías o productos. */
function refreshCategoryViews() {
    loadCategoryList();
    loadCategoryTabs();
    loadCategorySelector();
    loadProducts();
    loadProductList();
}

/**
 * Crea una nueva categoría en la API y recarga el catálogo.
 * @param {string} name - Nombre de la categoría
 * @param {string} color - Color de la categoría (opcional)
 * @returns {Promise<Object|false>} Categoría creada, o false si no se pudo.
 */
async function createCategory(name, color = '#95a5a6') {
    // Validar que no exista ya
    const existingCategory = categories.find(c => c.name.toLowerCase() === name.trim().toLowerCase());
    if (existingCategory) {
        alert(' Ya existe una categoría con ese nombre');
        return false;
    }

    try {
        const newCategory = await createCategoryInApi({ name: name.trim(), color });
        await refreshCatalog();
        return newCategory;
    } catch (error) {
        console.error('Error al crear categoría:', error);
        showNotification(`No se pudo crear la categoría: ${error.message}`);
        return false;
    }
}

/** Elimina todas las categorías del sistema (los productos pasan a "Sin Categoría"). */
function deleteAllCategories() {
    if (categories.length === 0) {
        alert('No hay categorías para eliminar');
        return;
    }
    
    // Contar productos que tienen categorías
    const productsWithCategories = products.filter(p => {
        return categories.some(c => c.name === p.category);
    });
    
    let confirmMsg = `¿Estás seguro de eliminar TODAS las categorías (${categories.length})?\n\nEsta acción no se puede deshacer.`;
    
    if (productsWithCategories.length > 0) {
        confirmMsg += `\n\n${productsWithCategories.length} producto(s) serán movidos a "Sin Categoría".`;
    }
    
    openActionModal(
        'Eliminar categorías',
        confirmMsg,
        'Eliminar categorías',
        async () => {
            const results = await Promise.allSettled(categories.map(category => deleteCategoryInApi(category.id)));
            activeCategory = "Todas";
            try {
                await refreshCatalog();
            } catch (error) {
                console.error('Error al recargar el catálogo:', error);
            }
            const failed = results.filter(result => result.status === 'rejected').length;
            showNotification(failed === 0
                ? 'Todas las categorías han sido eliminadas'
                : `No se pudieron eliminar ${failed} categorías. Intenta de nuevo.`);
        }
    );
}

/**
 * Elimina una categoría (sus productos pasan a "Sin Categoría"). Si tiene
 * productos, primero pide confirmación; la notificación solo sale al terminar.
 * @param {number} categoryId - ID de la categoría a eliminar
 */
function deleteCategory(categoryId) {
    const category = categories.find(c => c.id === categoryId);
    if (!category) {
        alert('Categoría no encontrada');
        return;
    }

    // El servidor deja sus productos sin categoría.
    const removeCategory = async () => {
        try {
            await deleteCategoryInApi(categoryId);
            await refreshCatalog();
            showNotification('Categoría eliminada exitosamente');
        } catch (error) {
            console.error('Error al eliminar categoría:', error);
            showNotification(`No se pudo eliminar la categoría: ${error.message}`);
        }
    };

    const productsInCategory = products.filter(p => p.category === category.name);
    if (productsInCategory.length === 0) {
        removeCategory();
        return;
    }

    openActionModal(
        'Eliminar categoría',
        `La categoría "${category.name}" tiene ${productsInCategory.length} producto(s).\n\n¿Mover productos a "Sin Categoría" y eliminar la categoría?`,
        'Eliminar categoría',
        removeCategory
    );
}

/**
 * Carga las pestañas de categorías
 */
function loadCategoryTabs() {
    const categoryTabs = document.getElementById('category-tabs');
    if (!categoryTabs) return;
    
    categoryTabs.innerHTML = '';

    const createTab = (label, count, isActive, onSelect, color = '') => {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = `category-tab${isActive ? ' active' : ''}`;
        tab.setAttribute('aria-pressed', String(isActive));
        tab.onclick = onSelect;
        if (isActive && color) {
            tab.style.borderColor = color;
            tab.style.backgroundColor = color;
        }
        tab.innerHTML = `<span>${escapeHtml(label)}</span><span class="category-count">${count}</span>`;
        categoryTabs.appendChild(tab);
    };

    // Los conteos son de lo que se puede vender (sin productos desactivados).
    const sellable = getSellableProducts();
    createTab('Todas', sellable.length, activeCategory === 'Todas', () => filterByCategory('Todas'));
    categories.forEach(category => {
        const count = sellable.filter(p => p.category === category.name).length;
        createTab(category.name, count, activeCategory === category.name, () => filterByCategory(category.name), category.color);
    });

    // Crear categorías es tarea del administrador; al cajero no se le muestra.
    if (adminSession?.role === 'admin') {
        const newTab = document.createElement('button');
        newTab.type = 'button';
        newTab.className = 'category-tab new-category';
        newTab.onclick = () => promptNewCategory();
        newTab.textContent = '+ Nueva categoría';
        categoryTabs.appendChild(newTab);
    }
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
    noCategoryOption.value = NO_CATEGORY;
    noCategoryOption.textContent = NO_CATEGORY;
    selector.appendChild(noCategoryOption);
}

/**
 * Muestra el formulario para crear nueva categoría
 */
function showNewCategoryForm() {
    document.getElementById('new-category-form').hidden = false;
    document.getElementById('new-category-name').focus();
}

/**
 * Oculta el formulario para crear nueva categoría
 */
function hideNewCategoryForm() {
    document.getElementById('new-category-form').hidden = true;
    document.getElementById('new-category-name').value = '';
    document.getElementById('new-category-color').value = '#722F37';
}

/**
 * Crea una nueva categoría desde el formulario
 */
async function createNewCategory() {
    const name = document.getElementById('new-category-name').value.trim();
    const color = document.getElementById('new-category-color').value;

    if (!name) {
        alert(' El nombre de la categoría es obligatorio');
        return;
    }

    const newCategory = await createCategory(name, color);
    if (newCategory) {
        hideNewCategoryForm();
        
        // Seleccionar la nueva categoría
        document.getElementById('product-category').value = newCategory.name;
        alert(` Categoría "${newCategory.name}" creada exitosamente!`);
    }
}

/**
 * Pide el nombre de una nueva categoría desde las pestañas de Venta
 */
async function promptNewCategory() {
    const name = prompt('Nombre de la nueva categoría:');
    if (!name) return;

    const newCategory = await createCategory(name);
    if (newCategory) {
alert(` Categoría "${newCategory.name}" creada exitosamente!`);
    }
}

/**
 * Agregar categoría desde el formulario principal
 * @param {Event} event - Evento del formulario
 */
async function addCategoryFromForm(event) {
    event.preventDefault();
    
    const name = document.getElementById('category-name').value.trim();
    const color = document.getElementById('category-color').value;
    
    if (!name) {
        alert(' El nombre de la categoría es obligatorio');
        return;
    }
    
    const newCategory = await createCategory(name, color);
    if (newCategory) {
        // Limpiar formulario
        document.getElementById('add-category-form').reset();
        document.getElementById('category-color').value = '#722F37';
        
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
        list.innerHTML = '<p class="empty-state">No hay categorías registradas</p>';
        return;
    }

    categories.forEach(category => {
        const productsInCategory = products.filter(p => p.category === category.name).length;

        const item = document.createElement('div');
        item.className = 'category-list-item';

        item.innerHTML = `
            <div class="category-info">
                <span class="category-color-indicator" style="background: ${escapeHtml(category.color)}" aria-hidden="true"></span>
                <div>
                    <strong>${escapeHtml(category.name)}</strong>
                    <small>${productsInCategory} producto(s)</small>
                </div>
            </div>
            <div class="row-actions">
                <button class="btn btn-secondary" type="button" onclick="editCategory(${category.id})">Editar</button>
                <button class="btn btn-danger" type="button" onclick="deleteCategory(${category.id})">Eliminar</button>
            </div>
        `;

        list.appendChild(item);
    });
}

/**
 * Editar categoría existente
 * @param {number} categoryId - ID de la categoría a editar
 */
async function editCategory(categoryId) {
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
    const updatedName = newName.trim();

    try {
        await updateCategoryInApi(categoryId, { name: updatedName });
    } catch (error) {
        console.error('Error al renombrar categoría:', error);
        showNotification(`No se pudo renombrar la categoría: ${error.message}`);
        return;
    }

    // La categoría activa se actualiza antes de redibujar para que siga marcada.
    if (activeCategory === oldName) {
        activeCategory = updatedName;
    }
    // El servidor ya trae los productos con el nombre nuevo de su categoría.
    await refreshCatalog();

    alert(`Categoría renombrada de "${oldName}" a "${updatedName}"`);
}

/**
 * Establece el color seleccionado en el formulario
 * @param {string} color - Color en formato hexadecimal
 */
function setColor(color) {
    document.getElementById('category-color').value = color;
    document.querySelectorAll('.color-preset').forEach(preset => {
        const isSelected = preset.dataset.color === color;
        preset.classList.toggle('active', isSelected);
        preset.setAttribute('aria-pressed', String(isSelected));
    });
}
