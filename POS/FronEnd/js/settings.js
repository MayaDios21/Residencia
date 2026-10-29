/*
 * CONFIGURACIÓN
 * Tipo de cambio y porcentaje de IVA. Ambos viven en el servidor
 * (/api/configuracion/): los dos roles los leen y solo el administrador los cambia.
 */

/**
 * Toma el IVA y el tipo de cambio de una respuesta de la API y refresca las
 * vistas que los usan (configuración y totales del carrito).
 * @param {{tax_rate: string, exchange_rate: string}} settings
 */
function applySettings(settings) {
    TAX_RATE = Number(settings.tax_rate);
    exchangeRate = Number(settings.exchange_rate);
    displayExchangeRate();
    displayTaxRate();
    updateCart();
}

/** Pide la configuración al servidor (se llama al iniciar sesión). */
async function loadSettings() {
    applySettings(await getSettingsFromApi());
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
            alert('Ingresa un tipo de cambio válido');
            return;
        }
        openActionModal(
            'Guardar tipo de cambio',
            `El tipo de cambio se actualizará a $${newRate.toFixed(2)} MXN por USD.`,
            'Confirmar tipo de cambio',
            async () => {
                try {
                    applySettings(await updateSettingsInApi({ exchange_rate: newRate.toFixed(4) }));
                    showNotification(`Tipo de cambio actualizado a $${exchangeRate.toFixed(2)}`);
                } catch (error) {
                    console.error('Error al guardar el tipo de cambio:', error);
                    showNotification(`No se pudo guardar el tipo de cambio: ${error.message}`);
                }
            }
        );
    } catch (error) {
        console.error('Error al actualizar tipo de cambio:', error);
        alert('Error al actualizar el tipo de cambio');
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
            alert('Ingresa un porcentaje de IVA válido (0-100)');
            return;
        }
        openActionModal(
            'Guardar configuración de IVA',
            `El IVA se actualizará a ${newTaxPercent.toFixed(2)}%.`,
            'Confirmar IVA',
            async () => {
                try {
                    // La API guarda el IVA como fracción: 8 % → 0.0800.
                    applySettings(await updateSettingsInApi({ tax_rate: (newTaxPercent / 100).toFixed(4) }));
                    showNotification(`IVA actualizado a ${newTaxPercent.toFixed(2)}%`);
                } catch (error) {
                    console.error('Error al guardar el IVA:', error);
                    showNotification(`No se pudo guardar el IVA: ${error.message}`);
                }
            }
        );
    } catch (error) {
        console.error('Error al actualizar tasa de IVA:', error);
        alert('Error al actualizar la tasa de IVA');
    }
}
