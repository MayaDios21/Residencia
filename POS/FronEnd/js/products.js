/*
 * PRODUCTOS
 * Catálogo de la pantalla de Venta (tarjetas táctiles) y administración de
 * productos: alta, edición, eliminación e imágenes comprimidas. El catálogo
 * vive en el servidor: se carga de la API después de iniciar sesión y cada
 * cambio del administrador se guarda ahí.
 */

const NO_CATEGORY = 'Sin Categoría';

/**
 * Convierte un producto de la API al formato que usa la interfaz: precio como
 * número y la categoría por nombre (con su id aparte para mandarla de vuelta).
 * @param {Object} apiProduct - Producto tal como lo devuelve /api/productos/.
 * @returns {Object}
 */
function productFromApi(apiProduct) {
    return {
        id: apiProduct.id,
        name: apiProduct.name,
        price: Number(apiProduct.price),
        category: apiProduct.category_name || NO_CATEGORY,
        category_id: apiProduct.category,
        image: apiProduct.image || null,
        is_active: apiProduct.is_active,
        track_inventory: apiProduct.track_inventory,
        stock: apiProduct.stock,
        minimum_stock: apiProduct.minimum_stock
    };
}

/**
 * Devuelve el id de una categoría a partir de su nombre ("Sin Categoría" → null).
 * @param {string} categoryName
 * @returns {number|null}
 */
function getCategoryIdByName(categoryName) {
    return categories.find(category => category.name === categoryName)?.id ?? null;
}

/**
 * Carga categorías y productos desde la API. Si la categoría activa ya no
 * existe vuelve a "Todas", y el carrito se ajusta al catálogo nuevo.
 */
async function loadCatalog() {
    const [apiCategories, apiProducts] = await Promise.all([
        getCategoriesFromApi(),
        getProductsFromApi()
    ]);
    categories = apiCategories.map(({ id, name, color, is_active }) => ({ id, name, color, is_active }));
    products = apiProducts.map(productFromApi);
    if (activeCategory !== 'Todas' && !categories.some(category => category.name === activeCategory)) {
        activeCategory = 'Todas';
    }
    syncCartWithCatalog();
}

/** Vuelve a pedir el catálogo al servidor y redibuja todas las vistas que lo usan. */
async function refreshCatalog() {
    await loadCatalog();
    refreshCategoryViews();
    loadWarehouse();
}

/**
 * Productos que se pueden vender: los desactivados (con historial que no se
 * pudo borrar) solo aparecen en la administración.
 * @returns {Object[]}
 */
function getSellableProducts() {
    return products.filter(product => product.is_active !== false);
}

/**
 * Obtiene productos filtrados por categoría
 * @param {string} categoryName - Nombre de la categoría ("Todas" para todos)
 */
function getProductsByCategory(categoryName) {
    const sellable = getSellableProducts();
    if (categoryName === "Todas") {
        return sellable;
    }
    return sellable.filter(product => product.category === categoryName);
}

/**
 * Devuelve la ruta de la imagen del producto: la que subió el usuario (base64)
 * o la ruta de las imágenes del menú (../Public/assets/imagenes/...).
 */
function getProductImageUrl(product) {
    if (!product) return null;

    const imageValue = String(product.image || '').trim();
    if (!imageValue) return null;

    if (imageValue.startsWith('data:') || imageValue.startsWith('http://') || imageValue.startsWith('https://')) {
        return imageValue;
    }

    if (imageValue.startsWith('/')) {
        return imageValue;
    }

    if (imageValue.startsWith('./') || imageValue.startsWith('../Public/')) {
        return imageValue;
    }

    if (imageValue.startsWith('assets/')) {
        return `../Public/${imageValue}`;
    }

    return `../Public/assets/imagenes/${imageValue}`;
}

/** Dibuja las tarjetas de producto de la categoría activa en la pantalla de Venta. */
function loadProducts() {
    const grid = document.getElementById('products-grid');
    if (!grid) return;

    grid.innerHTML = '';

    if (isCashBoxClosedForToday()) {
        grid.innerHTML = `
            <div class="empty-state empty-state-boxed">
                <strong>Jornada cerrada</strong>
                <span>No puedes vender más productos porque la caja ya fue cerrada hoy.</span>
            </div>
        `;
        return;
    }

    const filteredProducts = getProductsByCategory(activeCategory);

    if (filteredProducts.length === 0) {
        const message = activeCategory === 'Todas'
            ? 'No hay productos disponibles'
            : `No hay productos en la categoría "${escapeHtml(activeCategory)}"`;
        grid.innerHTML = `<p class="empty-state">${message}</p>`;
        return;
    }

    filteredProducts.forEach(product => {
        // Botón real: se puede tocar, enfocar y activar con teclado.
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'product-card';
        card.onclick = () => addToCart(product);

        const productImageUrl = getProductImageUrl(product);
        const imageHTML = productImageUrl
            ? `<img src="${encodeURI(productImageUrl)}" alt="" class="product-card-image" width="160" height="110" loading="lazy">`
            : `<span class="product-card-placeholder">Sin imagen</span>`;

        card.innerHTML = `
            ${imageHTML}
            <span class="product-name">${escapeHtml(product.name)}</span>
            <span class="product-price">$${product.price.toFixed(2)}</span>
        `;

        grid.appendChild(card);
    });
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
 * Comprime la imagen elegida en el formulario, si hay una.
 * @returns {Promise<string|undefined>} Imagen en base64, o undefined si no se eligió archivo.
 * @throws {Error} Si la imagen no se pudo procesar (ya avisa al usuario).
 */
async function readProductImageFromForm() {
    const file = document.getElementById('product-image').files[0];
    if (!file) return undefined;
    try {
        return await compressImage(file);
    } catch (error) {
        console.error('Error al comprimir imagen:', error);
        alert('Error al procesar la imagen. Intenta con otra imagen.');
        throw error;
    }
}

/** Limpia el formulario de productos y lo regresa al modo "Agregar". */
function resetProductForm() {
    const form = document.getElementById('add-product-form');
    form.reset();
    delete form.dataset.editingProductId;
    const submitButton = document.querySelector("#add-product-form button[type='submit']");
    submitButton.textContent = "Agregar producto";
    submitButton.classList.remove('is-editing');
}

/**
 * Agrega un nuevo producto al sistema
 * @param {Event} event - Evento del formulario
 */
async function addProduct(event) {
    event.preventDefault();

    const name = document.getElementById('product-name').value.trim();
    const price = parseFloat(document.getElementById('product-price').value);
    const category = document.getElementById('product-category').value.trim();
    const trackInventory = document.getElementById('product-track-inventory').checked;
    const form = document.getElementById("add-product-form");
    const editingProductId = form.dataset.editingProductId;

    // Validaciones
    if (!name) {
        alert('El nombre del producto es obligatorio');
        return;
    }

    if (price < 0) {
        alert('El precio no puede ser negativo');
        return;
    }

    if (isNaN(price)) {
        alert('Ingresa un precio válido');
        return;
    }

    if (!category) {
        alert('Selecciona una categoría');
        return;
    }

    // Verificar si ya existe un producto con el mismo nombre (excepto si es el mismo que estamos editando)
    const existingProduct = products.find(p =>
        p.name.toLowerCase() === name.toLowerCase() && p.id !== parseInt(editingProductId || -1)
    );

    if (existingProduct) {
        alert('Ya existe un producto con ese nombre');
        return;
    }

    // Si estamos editando, usar saveProductChanges en su lugar
    if (editingProductId) {
        saveProductChanges(parseInt(editingProductId));
        return;
    }

    let image;
    try {
        image = await readProductImageFromForm();
    } catch (error) {
        return;
    }

    try {
        await createProductInApi({
            name,
            price: price.toFixed(2),
            category: getCategoryIdByName(category),
            track_inventory: trackInventory,
            image: image || ''
        });
        resetProductForm();
        await refreshCatalog();
        alert(`Producto "${name}" agregado exitosamente!`);
    } catch (error) {
        console.error('Error al crear producto:', error);
        showNotification(`No se pudo agregar el producto: ${error.message}`);
    }
}

/**
 * Elimina todos los productos del sistema (y vacía el carrito). Los que tienen
 * historial de inventario no se pueden borrar y se quedan.
 */
function deleteAllProducts() {
    if (products.length === 0) {
        alert('No hay productos para eliminar');
        return;
    }

    const confirmMsg = `¿Estás seguro de eliminar TODOS los productos (${products.length})?\n\nEsta acción no se puede deshacer.\n\nSe eliminarán todos los productos del sistema.`;

    openActionModal(
        'Eliminar productos',
        confirmMsg,
        'Eliminar productos',
        async () => {
            const results = await Promise.allSettled(products.map(product => deleteProductInApi(product.id)));
            const kept = results.filter(result => result.status === 'rejected').length;
            cart = [];
            updateCart();
            try {
                await refreshCatalog();
            } catch (error) {
                console.error('Error al recargar el catálogo:', error);
            }

            showNotification(kept === 0
                ? 'Todos los productos han sido eliminados'
                : `Se eliminaron ${results.length - kept} productos. ${kept} tienen historial de inventario y no se pueden borrar: desactívalos.`);
        }
    );
}

/**
 * Activa o desactiva un producto. Uno desactivado no aparece en Venta, pero
 * conserva su historial.
 * @param {number} productId - ID del producto.
 * @param {boolean} isActive - true para activarlo, false para desactivarlo.
 */
async function setProductActive(productId, isActive) {
    try {
        await updateProductInApi(productId, { is_active: isActive });
        await refreshCatalog();
        showNotification(isActive ? 'Producto activado' : 'Producto desactivado');
    } catch (error) {
        console.error('Error al cambiar el estado del producto:', error);
        showNotification(`No se pudo actualizar el producto: ${error.message}`);
    }
}

/**
 * Elimina un producto del sistema. Si tiene historial de inventario el
 * servidor no lo deja borrar (409) y se ofrece desactivarlo.
 * @param {number} productId - ID del producto a eliminar
 */
function deleteProduct(productId) {
    const product = products.find(p => p.id === productId);

    if (!product) {
        alert(' Producto no encontrado');
        return;
    }

    openActionModal(
        'Eliminar producto',
        `¿Eliminar "${product.name}"? Esta acción no se puede deshacer.`,
        'Eliminar producto',
        async () => {
            try {
                await deleteProductInApi(productId);
            } catch (error) {
                if (error.status === 409) {
                    openActionModal(
                        'Desactivar producto',
                        `${error.message}\n\nUn producto desactivado ya no aparece en Venta y conserva su historial.`,
                        'Desactivar producto',
                        () => setProductActive(productId, false)
                    );
                    return;
                }
                console.error('Error al eliminar producto:', error);
                showNotification(`No se pudo eliminar el producto: ${error.message}`);
                return;
            }

            await refreshCatalog();
            showNotification('Producto eliminado exitosamente');
        }
    );
}

/**
 * Carga la lista de productos en el panel de administración
 */
function loadProductList() {
    const list = document.getElementById('product-list');
    if (!list) return;
    list.innerHTML = '';

    if (products.length === 0) {
        list.innerHTML = '<p class="empty-state">No hay productos registrados</p>';
        return;
    }

    products.forEach(product => {
        const item = document.createElement('div');
        item.className = 'product-list-item';
        const isActive = product.is_active !== false;

        const categoryBadge = product.category && product.category !== NO_CATEGORY
            ? `<span class="badge">${escapeHtml(product.category)}</span>`
            : '';
        const inventoryBadge = isInventoryTracked(product) ? '<span class="badge">En almacén</span>' : '';
        const inactiveBadge = isActive ? '' : '<span class="badge">Desactivado</span>';

        // Imagen local, en base64 o un recuadro "Sin imagen".
        const imageSrc = getProductImageUrl(product);
        const imageHTML = imageSrc
            ? `<img src="${encodeURI(imageSrc)}" alt="" class="product-image" width="64" height="64" loading="lazy">`
            : '<span class="product-image product-image-empty">Sin imagen</span>';

        // Un producto desactivado no se borra (tiene historial): se puede volver a activar.
        const secondaryAction = isActive
            ? `<button class="btn btn-danger" type="button" onclick="deleteProduct(${product.id})">Eliminar</button>`
            : `<button class="btn btn-secondary" type="button" onclick="setProductActive(${product.id}, true)">Activar</button>`;

        item.innerHTML = `
            ${imageHTML}
            <div class="product-list-info">
                <strong>${escapeHtml(product.name)}</strong>
                <span class="product-list-meta">${categoryBadge}${inventoryBadge}${inactiveBadge}<span class="product-list-price">$${product.price.toFixed(2)}</span></span>
            </div>
            <div class="row-actions">
                <button class="btn btn-secondary" type="button" onclick="editProduct(${product.id})">Editar</button>
                ${secondaryAction}
            </div>
        `;

        list.appendChild(item);
    });
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
    document.getElementById("product-track-inventory").checked = isInventoryTracked(product);

    // Desplazar hacia el formulario
    document.querySelector('.admin-section').scrollIntoView({ behavior: 'smooth' });

    // Guardar el ID del producto en edición
    document.getElementById("add-product-form").dataset.editingProductId = productId;

    // Cambiar el texto del botón para indicar que se está editando
    const submitButton = document.querySelector("#add-product-form button[type='submit']");
    submitButton.textContent = "Guardar cambios";
    submitButton.classList.add('is-editing');
}

/**
 * Guarda los cambios de un producto editado
 * @param {number} productId - ID del producto a actualizar
 */
async function saveProductChanges(productId) {
    // Obtener los datos actualizados del formulario
    const updatedName = document.getElementById("product-name").value.trim();
    const updatedPrice = parseFloat(document.getElementById("product-price").value);
    const updatedCategory = document.getElementById("product-category").value.trim();
    const updatedTrackInventory = document.getElementById("product-track-inventory").checked;

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

    if (!products.some(p => p.id === productId)) {
        alert("Producto no encontrado");
        return;
    }

    let image;
    try {
        image = await readProductImageFromForm();
    } catch (error) {
        return;
    }

    const changes = {
        name: updatedName,
        price: updatedPrice.toFixed(2),
        category: getCategoryIdByName(updatedCategory),
        track_inventory: updatedTrackInventory
    };
    // Sin imagen nueva se conserva la anterior.
    if (image !== undefined) changes.image = image;

    try {
        await updateProductInApi(productId, changes);
        resetProductForm();
        // También se refresca la pantalla de Venta para que muestre el precio nuevo.
        await refreshCatalog();
        alert(` Producto \"${updatedName}\" actualizado exitosamente!`);
    } catch (error) {
        console.error('Error al actualizar producto:', error);
        showNotification(`No se pudo actualizar el producto: ${error.message}`);
    }
}
