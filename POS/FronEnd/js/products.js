/*
 * PRODUCTOS
 * Catálogo de la pantalla de Venta (tarjetas táctiles) y administración de
 * productos: alta, edición, eliminación e imágenes comprimidas.
 */

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

/**
 * Devuelve la ruta de la imagen del producto. La imagen que subió el usuario
 * tiene prioridad; la del menú por defecto solo se usa como respaldo.
 */
function getProductImageUrl(product) {
    if (!product) return null;

    const fallbackImage = product.image || defaultProductImages[product.name];
    const imageValue = String(fallbackImage || '').trim();
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

/** Asigna a cada producto su imagen guardada o la imagen por defecto según su nombre. */
function normalizeProductImages() {
    products = products.map(product => {
        if (!product) return product;
        const imageFromName = defaultProductImages[product.name];
        const productImage = product.image || imageFromName;
        return {
            ...product,
            image: productImage || null
        };
    });
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
            : `<span class="product-card-placeholder" aria-hidden="true">🍽️</span>`;

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
 * Agrega un nuevo producto al sistema
 * @param {Event} event - Evento del formulario
 */
function addProduct(event) {
    event.preventDefault();
    
    
    const name = document.getElementById('product-name').value.trim();
    const price = parseFloat(document.getElementById('product-price').value);
    const category = document.getElementById('product-category').value.trim();
    const trackInventory = document.getElementById('product-track-inventory').checked;
    const productImage = document.getElementById("product-image").files[0];
    const form = document.getElementById("add-product-form");
    const editingProductId = form.dataset.editingProductId;
    
    
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
                    track_inventory: trackInventory,
                    image: compressedImage // Guardar imagen comprimida en base64
                };
                
                products.push(newProduct);
                saveProducts();
                document.getElementById('add-product-form').reset();
                
                // Recargar todas las vistas
                loadProducts();
                loadProductList();
                loadCategoryTabs();
                
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
            track_inventory: trackInventory,
            image: null
        };
        
        products.push(newProduct);
        saveProducts();
        document.getElementById('add-product-form').reset();
        
        // Recargar todas las vistas
        loadProducts();
        loadProductList();
        loadCategoryTabs();
        
        alert(`✅ Producto "${name}" agregado exitosamente!`);
    }
}

/** Elimina todos los productos del sistema (y vacía el carrito). */
function deleteAllProducts() {
    if (products.length === 0) {
        alert('⚠️ No hay productos para eliminar');
        return;
    }

    const confirmMsg = `¿Estás seguro de eliminar TODOS los productos (${products.length})?\n\n⚠️ Esta acción no se puede deshacer.\n\nSe eliminarán todos los productos del sistema.`;

    openActionModal(
        'Eliminar productos',
        confirmMsg,
        'Eliminar productos',
        () => {
            products = [];
            cart = [];
            saveProducts();

            loadProducts();
            loadProductList();
            loadCategoryTabs();
            updateCart();

            showNotification('✅ Todos los productos han sido eliminados');
        }
    );
}

/**
 * Elimina un producto del sistema
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
        () => {
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
        
        showNotification('✅ Producto eliminado exitosamente');
        }
    );
}

/**
 * Carga la lista de productos en el panel de administración
 */
function loadProductList() {
    const list = document.getElementById('product-list');
    list.innerHTML = '';
    
    if (products.length === 0) {
        list.innerHTML = '<p class="empty-state">No hay productos registrados</p>';
        return;
    }

    products.forEach(product => {
        const item = document.createElement('div');
        item.className = 'product-list-item';

        const categoryBadge = product.category && product.category !== 'Sin Categoría'
            ? `<span class="badge">${escapeHtml(product.category)}</span>`
            : '';
        const inventoryBadge = isInventoryTracked(product) ? '<span class="badge">En almacén</span>' : '';

        // Imagen local, en base64 o un recuadro "Sin imagen".
        const imageSrc = getProductImageUrl(product);
        const imageHTML = imageSrc
            ? `<img src="${encodeURI(imageSrc)}" alt="" class="product-image" width="64" height="64" loading="lazy">`
            : '<span class="product-image product-image-empty">Sin imagen</span>';

        item.innerHTML = `
            ${imageHTML}
            <div class="product-list-info">
                <strong>${escapeHtml(product.name)}</strong>
                <span class="product-list-meta">${categoryBadge}${inventoryBadge}<span class="product-list-price">$${product.price.toFixed(2)}</span></span>
            </div>
            <div class="row-actions">
                <button class="btn btn-secondary" type="button" onclick="editProduct(${product.id})">Editar</button>
                <button class="btn btn-danger" type="button" onclick="deleteProduct(${product.id})">Eliminar</button>
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
    submitButton.textContent = "✓ Guardar cambios";
    submitButton.classList.add('is-editing');
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
    const updatedTrackInventory = document.getElementById("product-track-inventory").checked;
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
            track_inventory: updatedTrackInventory,
            image: imageData !== undefined ? imageData : products[productIndex].image
        };

        saveProducts();
        document.getElementById("add-product-form").reset();
        delete document.getElementById("add-product-form").dataset.editingProductId;
        
        const submitButton = document.querySelector("#add-product-form button[type='submit']");
        submitButton.textContent = "Agregar producto";
        submitButton.classList.remove('is-editing');

        // También se refresca la pantalla de Venta para que muestre el precio nuevo.
        loadProducts();
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
