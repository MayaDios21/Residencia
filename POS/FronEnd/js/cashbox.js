/*
 * CAJA Y JORNADA
 * Fondo inicial, bloqueo de pantallas hasta abrir la jornada (solo cajero),
 * cálculo y registro del cierre, historial de cierres y exportación a CSV.
 */

/** Indica si hoy todavía no se abre la caja ni se registra el cierre. */
function shouldOpenCashBoxForToday() {
    const today = getLocalDateKey();
    const hasOpening = openingCash.dateKey === today && openingCash.amount > 0;
    const hasClosing = cashBoxRecords.some(record => record.dateKey === today);
    return !hasOpening && !hasClosing;
}

function focusOpeningCashField() {
    const initialFund = document.getElementById('initial-fund');
    if (initialFund) {
        initialFund.focus();
        initialFund.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function openDailyStartIfNeeded() {
    if (!shouldOpenCashBoxForToday()) return;
    showTab('cashbox');
    focusOpeningCashField();
    showNotification('📅 Nueva jornada: registra el fondo inicial para comenzar.');
}

function isCashBoxClosedForToday() {
    return cashBoxRecords.some(record => record.dateKey === getLocalDateKey());
}

function canSellToday() {
    if (isCashBoxClosedForToday()) {
        showNotification('🚫 La jornada ya fue cerrada. No puedes vender más productos.');
        return false;
    }
    return true;
}

function openCashBox(event) {
    event.preventDefault();
    const amount = parseFloat(document.getElementById('initial-fund').value);
    if (isNaN(amount) || amount <= 0) {
        alert('Ingresa un fondo inicial mayor que $0.00.');
        return;
    }
    const today = getLocalDateKey();
    if (cashBoxRecords.some(record => record.dateKey === today)) {
        alert('El cierre de hoy ya fue registrado. No puedes abrir una nueva caja para esta jornada.');
        return;
    }
    openActionModal(
        'Guardar fondo de apertura',
        `Se abrirá la caja con un fondo protegido de $${amount.toFixed(2)}.`,
        'Confirmar apertura',
        () => {
            openingCash = { amount, dateKey: today };
            localStorage.setItem('pos_opening_cash', JSON.stringify(openingCash));
            updateOpeningCashDisplay();
            updateCashBoxClosingVisibility();
            showNotification(`✓ Fondo de apertura guardado: $${amount.toFixed(2)}`);
        }
    );
}

function updateOpeningCashDisplay() {
    const today = getLocalDateKey();
    const amount = openingCash.dateKey === today ? openingCash.amount : 0;
    const input = document.getElementById('initial-fund');
    const display = document.getElementById('opening-fund-value');
    if (input && amount > 0) input.value = amount.toFixed(2);
    if (display) display.textContent = `$${amount.toFixed(2)}`;
}

function updateCashBoxClosingVisibility() {
    const isOpen = openingCash.dateKey === getLocalDateKey() && openingCash.amount > 0;
    const closingStep = document.getElementById('cashbox-closing-step');
    const closingForm = document.getElementById('cashbox-form');
    if (closingStep) closingStep.hidden = !isOpen;
    if (closingForm) closingForm.hidden = !isOpen;
}

/**
 * Calcula los totales de caja
 * @param {Event} event - Evento del formulario
 */
function calculateCashBox(event) {
    event.preventDefault();
    
    // Obtener valores del formulario
    const dailySales = parseFloat(document.getElementById('daily-sales').value);
    const initialFund = openingCash.dateKey === getLocalDateKey() ? openingCash.amount : 0;
    
    // Validaciones
    if (initialFund <= 0) {
        alert('Primero registra el fondo de apertura de la caja.');
        return;
    }
    const expectedCash = initialFund + dailySales;
    const withdrawal = dailySales;
    
    // Almacenar en objeto actual
    currentCashBoxCalculation = {
        initialFund: initialFund,
        dailySales: dailySales,
        minorExpenses: 0,
        totalInCash: expectedCash,
        netSales: withdrawal,
        countedCash: expectedCash,
        retainedFund: initialFund,
        expectedCash: expectedCash,
        difference: 0
    };
    
    // Mostrar resultados
    document.getElementById('retained-cash').textContent = `$${initialFund.toFixed(2)}`;
    document.getElementById('total-cashbox').textContent = `$${withdrawal.toFixed(2)}`;
    document.getElementById('net-sales').textContent = `$${expectedCash.toFixed(2)}`;
    
    const resultsPanel = document.getElementById('cashbox-results');
    resultsPanel.hidden = false;
    resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/**
 * Guarda el registro actual de caja en el historial
 */
function saveCashBoxRecord() {
    if (!currentCashBoxCalculation.dailySales && !currentCashBoxCalculation.initialFund) {
        alert(' Debes calcular primero antes de guardar');
        return;
    }

    const today = getLocalDateKey();
    if (cashBoxRecords.some(record => record.dateKey === today)) {
        alert('Ya existe un cierre registrado para hoy. Elimina el anterior si necesitas corregirlo.');
        return;
    }
    
    const record = {
        id: nextCashBoxId++,
        date: new Date().toISOString(),
        initialFund: currentCashBoxCalculation.initialFund,
        dailySales: currentCashBoxCalculation.dailySales,
        minorExpenses: currentCashBoxCalculation.minorExpenses,
        totalInCash: currentCashBoxCalculation.totalInCash,
        netSales: currentCashBoxCalculation.netSales,
        countedCash: currentCashBoxCalculation.countedCash,
        retainedFund: currentCashBoxCalculation.retainedFund,
        expectedCash: currentCashBoxCalculation.expectedCash,
        difference: currentCashBoxCalculation.difference,
        dateKey: today,
        type: 'cierre'
    };
    
    // Agregar al inicio del array (más reciente primero)
    cashBoxRecords.unshift(record);

    // El cierre de caja también cierra todas las ventas de esta jornada.
    closeSalesForDate(today, record.date);
    
    // Guardar en localStorage
    saveCashBoxRecords();
    
    // Limpiar formulario
    document.getElementById('cashbox-form').reset();
    localStorage.removeItem('pos_opening_cash');
    openingCash = { amount: 0, dateKey: null };
    
    // Ocultar resultados
    document.getElementById('cashbox-results').hidden = true;
    
    // Resetear cálculo actual
    currentCashBoxCalculation = {
        initialFund: 0,
        dailySales: 0,
        minorExpenses: 0,
        totalInCash: 0,
        netSales: 0,
        countedCash: 0,
        retainedFund: 0,
        expectedCash: 0,
        difference: 0
    };

    loadCashBoxTab();
    loadSalesHistoryTab();
    alert(' Registro guardado exitosamente!');
}

function confirmCashBoxRecord() {
    if (!currentCashBoxCalculation.dailySales && !currentCashBoxCalculation.initialFund) {
        alert(' Debes calcular primero antes de guardar');
        return;
    }
    openActionModal(
        'Finalizar jornada',
        `Se registrará el cierre con $${currentCashBoxCalculation.dailySales.toFixed(2)} en ventas y se conservará un fondo de $${currentCashBoxCalculation.initialFund.toFixed(2)}.`,
        'Confirmar cierre',
        saveCashBoxRecord
    );
}

/**
 * Carga la pestaña de control de caja
 */
function loadCashBoxTab() {
    const today = getTodaySalesSummary();
    const dailySalesInput = document.getElementById('daily-sales');
    if (dailySalesInput) dailySalesInput.value = today.total.toFixed(2);
    updateOpeningCashDisplay();
    updateCashBoxClosingVisibility();
    const status = document.getElementById('cashbox-status');
    if (status) {
        status.textContent = cashBoxRecords.some(record => record.dateKey === getLocalDateKey())
            ? '✓ Cierre de hoy registrado'
            : 'Sin cierre de hoy';
        status.classList.toggle('closed', status.textContent.includes('registrado'));
    }
    loadCashBoxTable();
}

/**
 * Carga y muestra la tabla de historial de caja
 */
function loadCashBoxTable() {
    const tbody = document.getElementById('cashbox-tbody');

    if (cashBoxRecords.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="table-empty">No hay cierres registrados</td></tr>';
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
        const countedCash = record.countedCash ?? record.totalInCash ?? 0;
        const retainedFund = record.retainedFund ?? record.initialFund ?? 0;
        const withdrawal = record.netSales ?? ((record.totalInCash || 0) - retainedFund);
        row.innerHTML = `
            <td>${formattedDate}</td>
            <td class="num">$${record.initialFund.toFixed(2)}</td>
            <td class="num">$${record.dailySales.toFixed(2)}</td>
            <td class="num">$${record.minorExpenses.toFixed(2)}</td>
            <td class="num"><strong>$${countedCash.toFixed(2)}</strong></td>
            <td class="num">$${retainedFund.toFixed(2)}</td>
            <td class="num"><strong class="amount-positive">$${withdrawal.toFixed(2)}</strong></td>
            <td>
                <button class="btn btn-danger btn-compact" type="button" onclick="deleteCashBoxRecord(${record.id})">Eliminar</button>
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
    openActionModal(
        'Eliminar cierre de caja',
        `¿Eliminar el registro del ${date}? Fondo: $${record.initialFund.toFixed(2)} | Ventas: $${record.dailySales.toFixed(2)}`,
        'Eliminar registro',
        () => {
            cashBoxRecords = cashBoxRecords.filter(r => r.id !== recordId);
            saveCashBoxRecords();
            loadCashBoxTable();
            showNotification('✅ Registro eliminado exitosamente');
        }
    );
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
    
    openActionModal(
        'Borrar historial de caja',
        confirmMsg,
        'Continuar',
        () => openActionModal(
            'Última confirmación',
            'Se borrará TODO el historial de caja. Esta acción es irreversible.',
            'Borrar definitivamente',
            () => {
            cashBoxRecords = [];
            nextCashBoxId = 1;
            saveCashBoxRecords();
            loadCashBoxTable();
            showNotification('✅ Historial de caja borrado completamente');
            }
        )
    );
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
    let csvContent = 'Fecha y Hora,Fondo Inicial,Ventas del Día,Gastos o Retiros,Efectivo Contado,Fondo Retenido,Retiro\n';
    
    cashBoxRecords.forEach(record => {
        const date = new Date(record.date).toLocaleDateString('es-MX') + ' ' + 
                     new Date(record.date).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
        
        const countedCash = record.countedCash ?? record.totalInCash ?? 0;
        const retainedFund = record.retainedFund ?? record.initialFund ?? 0;
        const withdrawal = record.netSales ?? ((record.totalInCash || 0) - retainedFund);
        csvContent += `"${date}",${record.initialFund.toFixed(2)},${record.dailySales.toFixed(2)},${record.minorExpenses.toFixed(2)},${countedCash.toFixed(2)},${retainedFund.toFixed(2)},${withdrawal.toFixed(2)}\n`;
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
