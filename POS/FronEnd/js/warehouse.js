/*
 * ALMACÉN
 * Solo consumibles que se cuentan por pieza: productos de venta marcados con
 * "Controlar en almacén" (refrescos, aguas…) e insumos que no se venden
 * (vasos, platos, cucharas…). La comida no se contabiliza aquí.
 * Registra entradas, salidas y ajustes de existencias.
 */

/**
 * Junta en una sola lista los artículos que se cuentan en el almacén.
 * @returns {{key: string, kind: 'product'|'supply', item: Object}[]} Cada entrada
 *   trae una clave única ("product:7" o "supply:3"), su tipo y el objeto original.
 */
function getWarehouseItems() {
    const trackedProducts = products
        .filter(isInventoryTracked)
        .map(product => ({ key: `product:${product.id}`, kind: 'product', item: product }));
    const supplyItems = supplies
        .map(supply => ({ key: `supply:${supply.id}`, kind: 'supply', item: supply }));
    return [...trackedProducts, ...supplyItems];
}

/**
 * Busca un artículo del almacén por su clave.
 * @param {string} key - Clave del selector, por ejemplo "product:7" o "supply:3".
 * @returns {{key: string, kind: 'product'|'supply', item: Object}|null}
 */
function findWarehouseItem(key) {
    return getWarehouseItems().find(entry => entry.key === key) || null;
}

/**
 * Dibuja la tabla de existencias (aplicando búsqueda y filtro de stock bajo)
 * y llena el selector de artículos del formulario de movimientos.
 */
function loadWarehouse() {
    const list = document.getElementById('warehouse-list');
    const selector = document.getElementById('movement-product');
    if (!list || !selector) return;

    const allItems = getWarehouseItems();
    const search = (document.getElementById('warehouse-search')?.value || '').trim().toLowerCase();
    const onlyLowStock = document.getElementById('warehouse-low-stock')?.checked;
    const visibleItems = allItems.filter(({ item }) => {
        const stock = getProductStock(item);
        const matchesSearch = item.name.toLowerCase().includes(search);
        const isLowStock = stock !== null && stock <= getProductMinimumStock(item);
        return matchesSearch && (!onlyLowStock || isLowStock);
    });

    document.getElementById('warehouse-product-count').textContent =
        `${visibleItems.length} ${visibleItems.length === 1 ? 'artículo' : 'artículos'}`;
    list.innerHTML = visibleItems.length === 0
        ? `<tr><td colspan="6" class="table-empty">${allItems.length === 0
            ? 'Marca refrescos y aguas con "Controlar en almacén" en Productos, o agrega insumos como vasos y platos.'
            : 'No hay artículos que coincidan.'}</td></tr>`
        : visibleItems.map(({ kind, item }) => {
            const stock = getProductStock(item);
            const minimum = getProductMinimumStock(item);
            const status = stock === null ? 'Sin registrar' : stock <= minimum ? 'Stock bajo' : 'Disponible';
            const statusClass = stock === null ? 'unknown' : stock <= minimum ? 'low' : 'available';
            const action = kind === 'supply'
                ? `<button class="btn btn-ghost btn-compact" type="button" onclick="deleteSupply(${item.id})" aria-label="Eliminar ${escapeHtml(item.name)}">Eliminar</button>`
                : '';
            return `
                <tr>
                    <td>${escapeHtml(item.name)}</td>
                    <td>${kind === 'supply' ? 'Insumo' : 'Venta'}</td>
                    <td class="num">${stock === null ? '—' : stock}</td>
                    <td class="num">${minimum}</td>
                    <td><span class="warehouse-status ${statusClass}">${status}</span></td>
                    <td>${action}</td>
                </tr>
            `;
        }).join('');

    selector.innerHTML = allItems.length === 0
        ? '<option value="">No hay artículos</option>'
        : allItems.map(({ key, item }) => `<option value="${key}">${escapeHtml(item.name)}</option>`).join('');
}

/**
 * Da de alta un insumo nuevo sin existencias; el stock se registra después
 * con una entrada de mercancía.
 * @param {Event} event - Envío del formulario "Agregar insumo".
 */
function addSupply(event) {
    event.preventDefault();
    const name = document.getElementById('supply-name').value.trim();
    const minimum = Number(document.getElementById('supply-minimum').value);

    if (!name || !Number.isInteger(minimum) || minimum < 0) {
        showNotification('⚠️ Escribe un nombre y un stock mínimo válido.');
        return;
    }
    const isDuplicate = getWarehouseItems().some(({ item }) => item.name.toLowerCase() === name.toLowerCase());
    if (isDuplicate) {
        showNotification('⚠️ Ya existe un artículo con ese nombre en el almacén.');
        return;
    }

    supplies.push({ id: nextSupplyId++, name, stock: null, minimum_stock: minimum });
    saveSupplies();
    document.getElementById('supply-form').reset();
    loadWarehouse();
    showNotification(`✓ Insumo "${name}" agregado. Registra una entrada para darle existencias.`);
}

/**
 * Elimina un insumo del almacén después de confirmarlo en el modal.
 * @param {number} supplyId - ID del insumo a eliminar.
 */
function deleteSupply(supplyId) {
    const supply = supplies.find(item => item.id === supplyId);
    if (!supply) return;
    openActionModal(
        'Eliminar insumo',
        `Se eliminará "${supply.name}" del almacén junto con sus existencias.`,
        'Eliminar',
        () => {
            supplies = supplies.filter(item => item.id !== supplyId);
            saveSupplies();
            loadWarehouse();
            showNotification(`✓ Insumo "${supply.name}" eliminado.`);
        }
    );
}

/**
 * Registra una entrada, salida o ajuste de existencias de un producto o insumo.
 * Una entrada suma, una salida resta y un ajuste fija el stock contado.
 * @param {Event} event - Envío del formulario "Actualizar existencias".
 */
async function registerInventoryMovement(event) {
    event.preventDefault();
    const entry = findWarehouseItem(document.getElementById('movement-product').value);
    const type = document.getElementById('movement-type').value;
    const quantity = Number(document.getElementById('movement-quantity').value);
    const reason = document.getElementById('movement-reason').value.trim();

    // Un ajuste fija el stock al valor indicado, por eso es el único que admite 0.
    const minimumQuantity = type === 'ajuste' ? 0 : 1;
    if (!entry || !Number.isInteger(quantity) || quantity < minimumQuantity) {
        showNotification('⚠️ Selecciona un artículo y una cantidad válida.');
        return;
    }

    const { kind, item } = entry;
    try {
        // La API solo conoce los productos de venta; los insumos viven en el navegador.
        if (USE_API && kind === 'product') {
            const movement = { product_id: item.id, type, quantity, reason };
            const response = await createInventoryMovementInApi(movement);
            if (Number.isFinite(response?.stock_remaining)) item.stock = response.stock_remaining;
        } else {
            const currentStock = getProductStock(item) || 0;
            const newStock = type === 'entrada' ? currentStock + quantity
                : type === 'ajuste' ? quantity
                : currentStock - quantity;
            if (newStock < 0) {
                showNotification('⚠️ El movimiento no puede dejar el stock en negativo.');
                return;
            }
            item.stock = newStock;
            item.minimum_stock = getProductMinimumStock(item);
            if (kind === 'supply') saveSupplies(); else saveProducts();
        }

        document.getElementById('inventory-movement-form').reset();
        loadWarehouse();
        showNotification('✓ Movimiento de inventario registrado.');
    } catch (error) {
        showNotification(error.status === 409
            ? '⚠️ El movimiento no puede dejar el stock en negativo.'
            : '⚠️ No se pudo registrar el movimiento.');
        console.error('Error al registrar movimiento:', error);
    }
}
