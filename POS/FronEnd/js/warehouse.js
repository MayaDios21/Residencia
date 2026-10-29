/*
 * ALMACÉN
 * Solo consumibles que se cuentan por pieza: productos de venta marcados con
 * "Controlar en almacén" (refrescos, aguas…) e insumos que no se venden
 * (vasos, platos, cucharas…). La comida no se contabiliza aquí.
 * Registra entradas, salidas y ajustes de existencias. Todo vive en el
 * servidor (/api/inventario/), así que lo ven todos los dispositivos.
 */

/** Pide los insumos al servidor (solo el administrador tiene acceso). */
async function loadSupplies() {
    supplies = await getSuppliesFromApi();
}

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
            const isActive = item.is_active !== false;
            const status = stock === null ? 'Sin registrar' : stock <= minimum ? 'Stock bajo' : 'Disponible';
            const statusClass = stock === null ? 'unknown' : stock <= minimum ? 'low' : 'available';
            // Un insumo con historial no se borra: se desactiva y se puede volver a activar.
            let action = '';
            if (kind === 'supply') {
                action = isActive
                    ? `<button class="btn btn-ghost btn-compact" type="button" onclick="deleteSupply(${item.id})" aria-label="Eliminar ${escapeHtml(item.name)}">Eliminar</button>`
                    : `<button class="btn btn-ghost btn-compact" type="button" onclick="setSupplyActive(${item.id}, true)" aria-label="Activar ${escapeHtml(item.name)}">Activar</button>`;
            }
            return `
                <tr>
                    <td>${escapeHtml(item.name)}${isActive ? '' : ' (desactivado)'}</td>
                    <td>${kind === 'supply' ? 'Insumo' : 'Venta'}</td>
                    <td class="num">${stock === null ? '—' : stock}</td>
                    <td class="num">${minimum}</td>
                    <td><span class="warehouse-status ${statusClass}">${status}</span></td>
                    <td>${action}</td>
                </tr>
            `;
        }).join('');

    // Solo se registran movimientos de artículos activos.
    const selectableItems = allItems.filter(({ item }) => item.is_active !== false);
    selector.innerHTML = selectableItems.length === 0
        ? '<option value="">No hay artículos</option>'
        : selectableItems.map(({ key, item }) => `<option value="${key}">${escapeHtml(item.name)}</option>`).join('');
}

/** Vuelve a pedir los insumos al servidor y redibuja el almacén. */
async function refreshSupplies() {
    await loadSupplies();
    loadWarehouse();
}

/**
 * Al abrir el almacén: dibuja lo que ya se tiene y lo actualiza con el
 * servidor (existencias que movieron ventas u otro dispositivo).
 */
function openWarehouseTab() {
    loadWarehouse();
    Promise.all([refreshCatalog(), loadSupplies()])
        .then(() => loadWarehouse())
        .catch(error => {
            console.error('Error al actualizar el almacén:', error);
            showNotification(`No se pudo actualizar el almacén: ${error.message}`);
        });
}

/**
 * Da de alta un insumo nuevo sin existencias; el stock se registra después
 * con una entrada de mercancía.
 * @param {Event} event - Envío del formulario "Agregar insumo".
 */
async function addSupply(event) {
    event.preventDefault();
    const name = document.getElementById('supply-name').value.trim();
    const minimum = Number(document.getElementById('supply-minimum').value);

    if (!name || !Number.isInteger(minimum) || minimum < 0) {
        showNotification('Escribe un nombre y un stock mínimo válido.');
        return;
    }
    const isDuplicate = getWarehouseItems().some(({ item }) => item.name.toLowerCase() === name.toLowerCase());
    if (isDuplicate) {
        showNotification('Ya existe un artículo con ese nombre en el almacén.');
        return;
    }

    try {
        await createSupplyInApi({ name, minimum_stock: minimum });
        document.getElementById('supply-form').reset();
        await refreshSupplies();
        showNotification(`Insumo "${name}" agregado. Registra una entrada para darle existencias.`);
    } catch (error) {
        console.error('Error al agregar insumo:', error);
        showNotification(`No se pudo agregar el insumo: ${error.message}`);
    }
}

/**
 * Activa o desactiva un insumo. Uno desactivado no se puede elegir para
 * movimientos, pero conserva su historial.
 * @param {number} supplyId - ID del insumo.
 * @param {boolean} isActive - true para activarlo, false para desactivarlo.
 */
async function setSupplyActive(supplyId, isActive) {
    try {
        await updateSupplyInApi(supplyId, { is_active: isActive });
        await refreshSupplies();
        showNotification(isActive ? 'Insumo activado' : 'Insumo desactivado');
    } catch (error) {
        console.error('Error al cambiar el estado del insumo:', error);
        showNotification(`No se pudo actualizar el insumo: ${error.message}`);
    }
}

/**
 * Elimina un insumo del almacén después de confirmarlo en el modal. Si tiene
 * historial el servidor no lo deja borrar (409) y se ofrece desactivarlo.
 * @param {number} supplyId - ID del insumo a eliminar.
 */
function deleteSupply(supplyId) {
    const supply = supplies.find(item => item.id === supplyId);
    if (!supply) return;
    openActionModal(
        'Eliminar insumo',
        `Se eliminará "${supply.name}" del almacén junto con sus existencias.`,
        'Eliminar',
        async () => {
            try {
                await deleteSupplyInApi(supplyId);
            } catch (error) {
                if (error.status === 409) {
                    openActionModal(
                        'Desactivar insumo',
                        `${error.message}\n\nUn insumo desactivado ya no se puede elegir para movimientos y conserva su historial.`,
                        'Desactivar insumo',
                        () => setSupplyActive(supplyId, false)
                    );
                    return;
                }
                console.error('Error al eliminar insumo:', error);
                showNotification(`No se pudo eliminar el insumo: ${error.message}`);
                return;
            }
            await refreshSupplies();
            showNotification(`Insumo "${supply.name}" eliminado.`);
        }
    );
}

/**
 * Registra una entrada, salida o ajuste de existencias de un producto o insumo.
 * Una entrada suma, una salida resta y un ajuste fija el stock contado. El
 * servidor aplica el movimiento y devuelve el stock que quedó.
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
        showNotification('Selecciona un artículo y una cantidad válida.');
        return;
    }

    const { kind, item } = entry;
    const movement = kind === 'product'
        ? { product_id: item.id, type, quantity, reason }
        : { supply_id: item.id, type, quantity, reason };
    try {
        const response = await createInventoryMovementInApi(movement);
        if (Number.isFinite(response?.stock_remaining)) item.stock = response.stock_remaining;

        document.getElementById('inventory-movement-form').reset();
        loadWarehouse();
        showNotification('Movimiento de inventario registrado.');
    } catch (error) {
        console.error('Error al registrar movimiento:', error);
        showNotification(error.status === 409
            ? 'El movimiento no puede dejar el stock en negativo.'
            : `No se pudo registrar el movimiento: ${error.message}`);
    }
}
