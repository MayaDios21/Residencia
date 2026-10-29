/*
 * CARRITO Y VENTA
 * Productos seleccionados, cantidades, totales con IVA y confirmación de la
 * venta, que se registra en el servidor.
 */

/**
 * Agrega un producto al carrito
 * @param {Object} product - Producto a agregar
 */
function addToCart(product) {
    if (!canSellToday()) return;

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
    showNotification(`${product.name} agregado al carrito`, 'cart');
}

/**
 * Ajusta el carrito guardado al catálogo del servidor: quita lo que ya no se
 * vende (o que venía del catálogo viejo del navegador, con otros IDs) y toma
 * los precios actuales.
 */
function syncCartWithCatalog() {
    const itemsBefore = cart.length;
    cart = cart.filter(item => getSellableProducts().some(product =>
        product.id === item.id && product.name === item.name
    ));
    cart.forEach(item => {
        item.price = products.find(product => product.id === item.id).price;
    });
    if (cart.length !== itemsBefore) {
        showNotification('Se quitaron del carrito productos que ya no están disponibles.');
    }
    updateCart();
}

/**
 * Actualiza la visualización del carrito
 */
function updateCart() {
    const cartItems = document.getElementById('cart-items');
    const cartTotal = document.getElementById('cart-total');
    // Conserva el carrito en curso si se recarga la página.
    saveCart();

    if (cart.length === 0) {
        cartItems.innerHTML = `
            <div class="empty-cart">
                <p>Carrito vacío<br>Toca un producto para comenzar</p>
            </div>
        `;
        cartTotal.hidden = true;
        return;
    }

    cartItems.innerHTML = '';
    cartTotal.hidden = false;

    cart.forEach(item => {
        const cartItem = document.createElement('div');
        cartItem.className = 'cart-item';

        const itemTotalMXN = item.price * item.quantity;
        const itemPriceUSD = convertToUSD(item.price);
        const itemTotalUSD = convertToUSD(itemTotalMXN);
        const itemName = escapeHtml(item.name);

        cartItem.innerHTML = `
            <div class="item-info">
                <div class="item-name">${itemName}</div>
                <div class="item-price">$${item.price.toFixed(2)} MXN / USD $${itemPriceUSD.toFixed(2)} c/u</div>
                <div class="quantity-controls">
                    <button class="qty-btn" type="button" onclick="updateQuantity(${item.id}, -1)" aria-label="Quitar uno de ${itemName}">−</button>
                    <span class="quantity" aria-live="polite">${item.quantity}</span>
                    <button class="qty-btn" type="button" onclick="updateQuantity(${item.id}, 1)" aria-label="Agregar uno de ${itemName}">+</button>
                </div>
            </div>
            <div class="item-side">
                <strong class="item-total">$${itemTotalMXN.toFixed(2)} MXN<br>USD $${itemTotalUSD.toFixed(2)}</strong>
                <button class="remove-btn" type="button" onclick="removeFromCart(${item.id})">Eliminar</button>
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
    
    if (item) {
        openActionModal(
            'Eliminar del carrito',
            `¿Eliminar "${item.name}" del carrito?`,
            'Eliminar producto',
            () => {
                cart = cart.filter(item => item.id !== productId);
                updateCart();
                showNotification(`Producto eliminado del carrito`);
            }
        );
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
    
    document.getElementById('tax-label').textContent = `IVA (${Number((TAX_RATE * 100).toFixed(2))}%)`;
    document.getElementById('subtotal').textContent = `$${subtotal.toFixed(2)} MXN / USD $${subtotalUSD.toFixed(2)}`;
    document.getElementById('tax').textContent = `$${tax.toFixed(2)} MXN / USD $${taxUSD.toFixed(2)}`;
    document.getElementById('total').textContent = `$${total.toFixed(2)} MXN / USD $${totalUSD.toFixed(2)}`;
}

/**
 * Procesa la venta
 */
function checkout() {
    if (!canSellToday()) return;

    if (cart.length === 0) {
        alert(' El carrito está vacío');
        return;
    }

    const unavailableProduct = cart.find(item => {
        // El carrito no guarda existencias: se consultan en el catálogo.
        const product = products.find(productItem => productItem.id === item.id);
        const stock = product ? getProductStock(product) : null;
        return stock !== null && item.quantity > stock;
    });
    if (unavailableProduct) {
        showNotification(`No hay existencias suficientes de ${unavailableProduct.name}.`);
        return;
    }
    
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const tax = subtotal * TAX_RATE;
    const total = subtotal + tax;
    const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    
    pendingSale = {
        items: cart.map(item => ({ ...item })),
        subtotal,
        tax,
        total,
        itemCount
    };
    openSaleModal();
}

/** Muestra el modal de confirmación con el detalle y los totales de la venta pendiente. */
function openSaleModal() {
    if (!pendingSale) return;
    const itemsContainer = document.getElementById('sale-modal-items');
    itemsContainer.innerHTML = pendingSale.items.map(item => `
        <div class="sale-modal-item">
            <div>
                <strong>${escapeHtml(item.name)}</strong>
                <span>${item.quantity} × $${item.price.toFixed(2)}</span>
            </div>
            <strong>$${(item.price * item.quantity).toFixed(2)}</strong>
        </div>
    `).join('');
    document.getElementById('sale-modal-subtotal').textContent = `$${pendingSale.subtotal.toFixed(2)}`;
    document.getElementById('sale-modal-tax').textContent = `$${pendingSale.tax.toFixed(2)}`;
    document.getElementById('sale-modal-total').textContent = `$${pendingSale.total.toFixed(2)}`;
    const modal = document.getElementById('sale-confirmation-modal');
    modal.hidden = false;
    document.body.classList.add('modal-open');
    document.querySelector('.sale-confirm-btn').focus();
}

/** Cierra el modal de confirmación y descarta la venta pendiente. */
function closeSaleModal() {
    const modal = document.getElementById('sale-confirmation-modal');
    if (modal) modal.hidden = true;
    document.body.classList.remove('modal-open');
    pendingSale = null;
}

/**
 * Registra la venta confirmada en el servidor, que calcula precios, IVA y
 * total y descuenta existencias. Sin respuesta del servidor la venta no se
 * registra: se avisa y el carrito se queda como estaba para reintentar.
 */
async function confirmSale() {
    if (!pendingSale) return;
    const sale = pendingSale;
    const confirmButton = document.querySelector('.sale-confirm-btn');
    if (confirmButton) confirmButton.disabled = true;

    try {
        const apiSale = await createSaleInApi({
            items: sale.items.map(item => ({
                product_id: item.id,
                quantity: item.quantity
            })),
            payment: 'Efectivo'
        });

        // El servidor devuelve cuánto quedó de cada producto controlado.
        apiSale.items.forEach(item => {
            const product = products.find(productItem => productItem.id === item.product_id);
            if (product && Number.isFinite(item.stock_remaining)) {
                product.stock = item.stock_remaining;
            }
        });

        cart = [];
        updateCart();
        closeSaleModal();
        showNotification(`Venta #${apiSale.id} registrada por $${Number(apiSale.total).toFixed(2)} MXN`);
        showTab('pos');
        updateTodaySalesSummary();
    } catch (error) {
        console.error('Error al registrar venta en el servidor:', error);
        if (error.status) {
            // 409: sin caja abierta o sin existencias; 400: producto no disponible.
            showNotification(`No se registró la venta: ${error.message}`);
            if (error.status === 409) {
                // Otro dispositivo pudo cerrar la caja o vender lo último: se toma el estado real.
                Promise.all([refreshCatalog(), loadCashBoxState()])
                    .then(() => loadProducts())
                    .catch(reloadError => console.error('Error al recargar datos:', reloadError));
            }
        } else {
            showNotification('Sin conexión con el servidor: la venta NO se registró. Intenta de nuevo.');
        }
    } finally {
        if (confirmButton) confirmButton.disabled = false;
    }
}
