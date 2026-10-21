/*
 * CONFIGURACIÓN
 * Tipo de cambio, porcentaje de IVA y reinicio completo del sistema.
 */

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
        openActionModal(
            'Guardar tipo de cambio',
            `El tipo de cambio se actualizará a $${newRate.toFixed(2)} MXN por USD.`,
            'Confirmar tipo de cambio',
            () => {
                exchangeRate = newRate;
                localStorage.setItem('pos_exchangeRate', exchangeRate.toString());
                displayExchangeRate();
                showNotification(`✓ Tipo de cambio actualizado a $${exchangeRate.toFixed(2)}`);
            }
        );
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
        openActionModal(
            'Guardar configuración de IVA',
            `El IVA se actualizará a ${newTaxPercent.toFixed(2)}%.`,
            'Confirmar IVA',
            () => {
                TAX_RATE = newTaxPercent / 100;
                localStorage.setItem('pos_taxRate', TAX_RATE.toString());
                displayTaxRate();
                showNotification(`✓ IVA actualizado a ${newTaxPercent.toFixed(2)}%`);
            }
        );
    } catch (error) {
        console.error('Error al actualizar tasa de IVA:', error);
        alert('❌ Error al actualizar la tasa de IVA');
    }
}

/**
 * Limpia el localStorage completamente y reinicia con datos por defecto
 */
function resetSystem() {

    openActionModal(
        'Reiniciar sistema',
        'Esto eliminará TODOS los datos guardados y cargará los productos por defecto.',
        'Reiniciar sistema',
        () => {
        try {
            // Limpiar localStorage completamente
            localStorage.clear();
            
            // Reiniciar todas las variables globales
            products = [];
            categories = [];
            cart = [];
            activeCategory = 'Todas';
            nextProductId = 9;
            nextCategoryId = 5;
            
            // Cargar valores por defecto
            products = JSON.parse(JSON.stringify(defaultProducts));
            categories = JSON.parse(JSON.stringify(defaultCategories));
            
            // Asegurar que todos los productos tengan imagen
            products.forEach(p => {
                if (!p.hasOwnProperty('image')) p.image = null;
            });
            
            // Guardar en localStorage
            saveProducts();
            saveCategories();
            saveCart();
            
            
            showNotification('✅ Sistema reiniciado correctamente. Recargando página...');
            window.location.reload();
        } catch (error) {
            console.error('❌ Error al reiniciar:', error);
            showNotification('Error al reiniciar el sistema. Revisa la consola para más detalles.');
        }
        }
    );
}
