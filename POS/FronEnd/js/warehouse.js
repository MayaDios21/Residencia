/*
 * ALMACÉN
 * Existencias por producto y registro de entradas, salidas y ajustes.
 */

function loadWarehouse() {
    const list = document.getElementById('warehouse-list');
    const selector = document.getElementById('movement-product');
    if (!list || !selector) return;

    const search = (document.getElementById('warehouse-search')?.value || '').trim().toLowerCase();
    const onlyLowStock = document.getElementById('warehouse-low-stock')?.checked;
    const visibleProducts = products.filter(product => {
        const stock = getProductStock(product);
        const matchesSearch = product.name.toLowerCase().includes(search);
        const isLowStock = stock !== null && stock <= getProductMinimumStock(product);
        return matchesSearch && (!onlyLowStock || isLowStock);
    });

    document.getElementById('warehouse-product-count').textContent = `${visibleProducts.length} productos`;
    list.innerHTML = visibleProducts.length === 0
        ? '<tr><td colspan="5" class="table-empty">No hay productos que coincidan.</td></tr>'
        : visibleProducts.map(product => {
            const stock = getProductStock(product);
            const minimum = getProductMinimumStock(product);
            const status = stock === null ? 'Sin registrar' : stock <= minimum ? 'Stock bajo' : 'Disponible';
            const statusClass = stock === null ? 'unknown' : stock <= minimum ? 'low' : 'available';
            return `
                <tr>
                    <td>${escapeHtml(product.name)}</td>
                    <td>${escapeHtml(product.category || 'Sin categoría')}</td>
                    <td class="num">${stock === null ? '—' : stock}</td>
                    <td class="num">${minimum}</td>
                    <td><span class="warehouse-status ${statusClass}">${status}</span></td>
                </tr>
            `;
        }).join('');

    selector.innerHTML = products.length === 0
        ? '<option value="">No hay productos</option>'
        : products.map(product => `<option value="${product.id}">${escapeHtml(product.name)}</option>`).join('');
}

async function registerInventoryMovement(event) {
    event.preventDefault();
    const productId = Number(document.getElementById('movement-product').value);
    const type = document.getElementById('movement-type').value;
    const quantity = Number(document.getElementById('movement-quantity').value);
    const reason = document.getElementById('movement-reason').value.trim();
    const product = products.find(item => item.id === productId);

    if (!product || !Number.isInteger(quantity) || quantity <= 0) {
        showNotification('⚠️ Selecciona un producto y una cantidad válida.');
        return;
    }

    const movement = { product_id: productId, type, quantity, reason };
    try {
        if (USE_API) {
            const response = await createInventoryMovementInApi(movement);
            if (Number.isFinite(response?.stock_remaining)) product.stock = response.stock_remaining;
        } else {
            const currentStock = getProductStock(product) || 0;
            const change = type === 'entrada' ? quantity : -quantity;
            if (currentStock + change < 0) {
                showNotification('⚠️ El movimiento no puede dejar el stock en negativo.');
                return;
            }
            product.stock = currentStock + change;
            product.minimum_stock = getProductMinimumStock(product);
            saveProducts();
        }

        document.getElementById('inventory-movement-form').reset();
        loadWarehouse();
        showNotification('✓ Movimiento de inventario registrado.');
    } catch (error) {
        showNotification('⚠️ No se pudo registrar el movimiento.');
        console.error('Error al registrar movimiento:', error);
    }
}
