/*
 * CAJA Y JORNADA
 * Fondo inicial, bloqueo de pantallas hasta abrir la jornada (solo cajero),
 * cierre e historial de cierres con exportación a CSV. La caja vive en el
 * servidor (/api/caja/): abrirla o cerrarla en un dispositivo se ve en todos.
 */

/** Pide al servidor el estado de la caja de hoy. */
async function loadCashBoxState() {
    cashBoxState = await getCurrentCashBoxFromApi();
}

/**
 * Jornada que se puede cerrar: una de otro día que quedó abierta (tiene
 * prioridad, el servidor no deja abrir la de hoy sin cerrarla) o la de hoy.
 * @returns {Object|null}
 */
function getOpenCashSession() {
    if (cashBoxState.pending_session) return cashBoxState.pending_session;
    return cashBoxState.status === 'abierta' ? cashBoxState.session : null;
}

/** Indica si hoy todavía no se abre la caja ni se registra el cierre. */
function shouldOpenCashBoxForToday() {
    return cashBoxState.status === 'sin_abrir';
}

/** Lleva el cursor al campo del fondo inicial y lo hace visible. */
function focusOpeningCashField() {
    const initialFund = document.getElementById('initial-fund');
    if (initialFund) {
        initialFund.focus();
        initialFund.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

/** Si hoy no se ha abierto la caja, manda al cajero a registrar el fondo inicial. */
function openDailyStartIfNeeded() {
    if (!shouldOpenCashBoxForToday()) return;
    showTab('cashbox');
    if (cashBoxState.pending_session) {
        showNotification(`La caja del ${formatBusinessDate(cashBoxState.pending_session.business_date)} sigue abierta: ciérrala antes de abrir la de hoy.`);
        return;
    }
    focusOpeningCashField();
    showNotification('Nueva jornada: registra el fondo inicial para comenzar.');
}

/**
 * Indica si ya se registró el cierre de caja de hoy.
 * @returns {boolean}
 */
function isCashBoxClosedForToday() {
    return cashBoxState.status === 'cerrada';
}

/**
 * Revisa si todavía se puede vender hoy; avisa si la jornada ya se cerró.
 * @returns {boolean}
 */
function canSellToday() {
    if (isCashBoxClosedForToday()) {
        showNotification('La jornada ya fue cerrada. No puedes vender más productos.');
        return false;
    }
    return true;
}

/**
 * Convierte una fecha de jornada (AAAA-MM-DD) a DD/MM/AAAA.
 * @param {string} dateKey
 * @returns {string}
 */
function formatBusinessDate(dateKey) {
    const [year, month, day] = dateKey.split('-');
    return `${day}/${month}/${year}`;
}

/**
 * Registra el fondo inicial de la jornada después de confirmarlo en el modal.
 * @param {Event} event - Envío del formulario de apertura.
 */
function openCashBox(event) {
    event.preventDefault();
    const amount = parseFloat(document.getElementById('initial-fund').value);
    if (isNaN(amount) || amount <= 0) {
        alert('Ingresa un fondo inicial mayor que $0.00.');
        return;
    }
    if (isCashBoxClosedForToday()) {
        alert('El cierre de hoy ya fue registrado. No puedes abrir una nueva caja para esta jornada.');
        return;
    }
    openActionModal(
        'Guardar fondo de apertura',
        `Se abrirá la caja con un fondo protegido de $${amount.toFixed(2)}.`,
        'Confirmar apertura',
        async () => {
            try {
                await openCashBoxInApi(amount);
                await loadCashBoxState();
            } catch (error) {
                console.error('Error al abrir la caja:', error);
                showNotification(`No se pudo abrir la caja: ${error.message}`);
                // Otro dispositivo pudo haberla abierto o cerrado: se muestra el estado real.
                await refreshCashBoxView();
                return;
            }
            renderCashBoxTab();
            loadProducts();
            showNotification(`Fondo de apertura guardado: $${amount.toFixed(2)}`);
        }
    );
}

/** Muestra el fondo inicial de la jornada abierta en el formulario y en el resumen. */
function updateOpeningCashDisplay() {
    const session = getOpenCashSession();
    const amount = session ? Number(session.opening_amount) : 0;
    const input = document.getElementById('initial-fund');
    const display = document.getElementById('opening-fund-value');
    if (input && amount > 0) input.value = amount.toFixed(2);
    if (display) display.textContent = `$${amount.toFixed(2)}`;
}

/** Muestra el paso de cierre de caja solo cuando hay una jornada abierta. */
function updateCashBoxClosingVisibility() {
    const isOpen = getOpenCashSession() !== null;
    const closingStep = document.getElementById('cashbox-closing-step');
    const closingForm = document.getElementById('cashbox-form');
    if (closingStep) closingStep.hidden = !isOpen;
    if (closingForm) closingForm.hidden = !isOpen;
    if (!isOpen) document.getElementById('cashbox-results').hidden = true;
}

/**
 * Ventas de la jornada abierta según el servidor. De una jornada pendiente de
 * otro día no se tiene el total hasta cerrarla.
 * @returns {number}
 */
function getOpenSessionSalesTotal() {
    if (cashBoxState.pending_session || !cashBoxState.sales_today) return 0;
    return Number(cashBoxState.sales_today.total);
}

/**
 * Muestra el resumen del cierre antes de guardarlo.
 * @param {Event} event - Evento del formulario
 */
function calculateCashBox(event) {
    event.preventDefault();

    const session = getOpenCashSession();
    if (!session) {
        alert('Primero registra el fondo de apertura de la caja.');
        return;
    }
    const initialFund = Number(session.opening_amount);
    const dailySales = getOpenSessionSalesTotal();
    const expectedCash = initialFund + dailySales;

    currentCashBoxCalculation = {
        initialFund: initialFund,
        dailySales: dailySales,
        minorExpenses: 0,
        totalInCash: expectedCash,
        netSales: dailySales,
        countedCash: expectedCash,
        retainedFund: initialFund,
        expectedCash: expectedCash,
        difference: 0
    };

    document.getElementById('retained-cash').textContent = `$${initialFund.toFixed(2)}`;
    document.getElementById('total-cashbox').textContent = `$${dailySales.toFixed(2)}`;
    document.getElementById('net-sales').textContent = `$${expectedCash.toFixed(2)}`;

    const resultsPanel = document.getElementById('cashbox-results');
    resultsPanel.hidden = false;
    resultsPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/** Regresa el cálculo del cierre a ceros. */
function resetCashBoxCalculation() {
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
}

/**
 * Registra el cierre en el servidor. El servidor calcula las ventas y el
 * efectivo esperado con lo que tiene registrado y cierra las ventas del día.
 */
async function saveCashBoxRecord() {
    const session = getOpenCashSession();
    if (!session) {
        alert('No hay una caja abierta para cerrar.');
        return;
    }

    let closed;
    try {
        closed = await closeCashBoxInApi();
    } catch (error) {
        console.error('Error al cerrar la caja:', error);
        showNotification(`No se pudo cerrar la caja: ${error.message}`);
        await refreshCashBoxView();
        return;
    }

    // Mientras las ventas sigan en el navegador (bloque 3) se cierran también aquí.
    closeSalesForDate(closed.business_date, closed.closed_at);

    document.getElementById('cashbox-form').reset();
    document.getElementById('cashbox-results').hidden = true;
    resetCashBoxCalculation();

    await refreshCashBoxView();
    loadProducts();
    loadSalesHistoryTab();
    alert(`Cierre del ${formatBusinessDate(closed.business_date)} guardado: ${closed.sales_count} ventas por $${Number(closed.sales_total).toFixed(2)}. Esperado en caja: $${Number(closed.expected_cash).toFixed(2)}.`);
}

/** Pide confirmación antes de guardar el cierre de jornada ya calculado. */
function confirmCashBoxRecord() {
    if (!currentCashBoxCalculation.initialFund) {
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

/** Dibuja la pantalla de caja con el estado que ya se tiene en memoria. */
function renderCashBoxTab() {
    // El administrador no abre ni cierra caja: solo consulta el historial de cierres.
    const isAdmin = adminSession?.role === 'admin';
    document.getElementById('cashbox-operation').hidden = isAdmin;
    // El historial de cierres solo lo da la API al administrador.
    document.getElementById('cashbox-history').hidden = !isAdmin;
    document.getElementById('cashbox-eyebrow').textContent = isAdmin ? 'Consulta' : 'Inicio de jornada';
    document.getElementById('cashbox-title').textContent = isAdmin ? 'Cierres de caja' : 'Apertura y cierre de caja';
    const pending = cashBoxState.pending_session;
    document.getElementById('cashbox-subtitle').textContent = isAdmin
        ? 'Revisa los cierres de jornada registrados por los cajeros.'
        : pending
            ? `La caja del ${formatBusinessDate(pending.business_date)} quedó abierta. Ciérrala para poder abrir la de hoy.`
            : 'Primero registra únicamente el fondo inicial. Al terminar el día podrás revisar y guardar el cierre.';

    const dailySalesInput = document.getElementById('daily-sales');
    if (dailySalesInput) dailySalesInput.value = getOpenSessionSalesTotal().toFixed(2);
    updateOpeningCashDisplay();
    updateCashBoxClosingVisibility();
    const status = document.getElementById('cashbox-status');
    if (status) {
        const isClosed = isCashBoxClosedForToday();
        status.textContent = isClosed ? 'Cierre de hoy registrado' : 'Sin cierre de hoy';
        status.classList.toggle('closed', isClosed);
    }
    if (isAdmin) loadCashBoxTable();
}

/**
 * Vuelve a pedir al servidor el estado de la caja (y los cierres, si es
 * administrador) y redibuja la pantalla. Así se ve lo que hizo otro dispositivo.
 */
async function refreshCashBoxView() {
    try {
        await loadCashBoxState();
        if (adminSession?.role === 'admin') cashBoxClosings = await getCashBoxClosingsFromApi();
    } catch (error) {
        console.error('Error al consultar la caja:', error);
        showNotification(`No se pudo consultar la caja: ${error.message}`);
    }
    renderCashBoxTab();
}

/**
 * Carga la pestaña de control de caja: dibuja lo que ya se tiene y lo
 * actualiza con el servidor.
 */
function loadCashBoxTab() {
    renderCashBoxTab();
    refreshCashBoxView();
}

/**
 * Carga y muestra la tabla de historial de caja
 */
function loadCashBoxTable() {
    const tbody = document.getElementById('cashbox-tbody');

    if (cashBoxClosings.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="table-empty">No hay cierres registrados</td></tr>';
        return;
    }

    tbody.innerHTML = '';

    cashBoxClosings.forEach(closing => {
        const formattedDate = new Date(closing.closed_at).toLocaleDateString('es-MX', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
        const countedCash = Number(closing.counted_cash);
        const retainedFund = Number(closing.retained_fund);
        const withdrawal = countedCash - retainedFund;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formattedDate}</td>
            <td class="num">$${Number(closing.opening_amount).toFixed(2)}</td>
            <td class="num">$${Number(closing.sales_total).toFixed(2)}</td>
            <td class="num">$${Number(closing.minor_expenses).toFixed(2)}</td>
            <td class="num"><strong>$${countedCash.toFixed(2)}</strong></td>
            <td class="num">$${retainedFund.toFixed(2)}</td>
            <td class="num"><strong class="amount-positive">$${withdrawal.toFixed(2)}</strong></td>
            <td>${escapeHtml(closing.closed_by || '')}</td>
        `;

        tbody.appendChild(row);
    });
}

/**
 * Descarga el historial de cierres en CSV (lo genera el servidor).
 */
async function exportCashBoxHistory() {
    if (cashBoxClosings.length === 0) {
        alert(' No hay registros para exportar');
        return;
    }
    try {
        await downloadFileFromApi('/caja/cierres/exportar/', `cierres_de_caja_${getLocalDateKey()}.csv`);
        const count = cashBoxClosings.length;
        showNotification(`Se ${count === 1 ? 'exportó 1 cierre' : `exportaron ${count} cierres`}`);
    } catch (error) {
        console.error('Error al exportar cierres:', error);
        showNotification(`No se pudo exportar: ${error.message}`);
    }
}
