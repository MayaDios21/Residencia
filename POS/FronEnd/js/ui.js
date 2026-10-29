/*
 * INTERFAZ COMPARTIDA
 * Avisos temporales, modal de confirmación de acciones, modal para pedir un
 * dato (en lugar de prompt()) y escape de texto para insertar datos del
 * usuario en HTML.
 */

const MAX_VISIBLE_TOASTS = 2;
const TOAST_DURATION_MS = 2600;

/**
 * Abre el modal de confirmación de una acción.
 * @param {string} eyebrow - Texto pequeño sobre el título.
 * @param {string} message - Explicación de lo que va a pasar.
 * @param {string} confirmLabel - Texto del botón de confirmar.
 * @param {Function} callback - Se ejecuta solo si el usuario confirma.
 */
function openActionModal(eyebrow, message, confirmLabel, callback) {
    pendingAction = callback;
    document.getElementById('action-modal-eyebrow').textContent = eyebrow;
    document.getElementById('action-modal-title').textContent = 'Revisar cambio';
    document.getElementById('action-modal-message').textContent = message;
    const confirmButton = document.querySelector('#action-confirmation-modal .sale-confirm-btn');
    confirmButton.textContent = confirmLabel;
    document.getElementById('action-confirmation-modal').hidden = false;
    document.body.classList.add('modal-open');
    confirmButton.focus();
}

/** Cierra el modal de confirmación sin ejecutar la acción pendiente. */
function closeActionModal() {
    document.getElementById('action-confirmation-modal').hidden = true;
    document.body.classList.remove('modal-open');
    pendingAction = null;
}

/** Cierra el modal y ejecuta la acción que el usuario confirmó. */
function confirmActionModal() {
    const callback = pendingAction;
    closeActionModal();
    if (callback) callback();
}

// Modal para pedir un dato: guarda la promesa pendiente y la validación activa.
let inputModalResolve = null;
let inputModalValidate = null;

/**
 * Abre el modal para pedir un dato, con el mismo diseño que el de confirmar
 * (en lugar de la ventana prompt() del navegador).
 * @param {Object} options
 * @param {string} options.eyebrow - Texto pequeño sobre el título.
 * @param {string} options.title - Título del modal.
 * @param {string} [options.message] - Explicación debajo del título.
 * @param {string} options.label - Etiqueta del campo.
 * @param {string} [options.value] - Valor inicial.
 * @param {string} [options.type] - Tipo del campo: 'text' (por defecto) o 'number'.
 * @param {number} [options.maxLength] - Largo máximo del texto.
 * @param {string} [options.confirmLabel] - Texto del botón de guardar.
 * @param {boolean} [options.danger] - true pinta el botón de rojo (acciones que no se deshacen).
 * @param {Function} [options.validate] - Recibe el valor y devuelve un mensaje de error o ''.
 * @returns {Promise<string|null>} El valor escrito, o null si se canceló.
 */
function openInputModal({ eyebrow, title, message = '', label, value = '', type = 'text', maxLength, confirmLabel = 'Guardar', danger = false, validate = null }) {
    // Si había otro abierto, se cancela.
    closeInputModal(null);

    document.getElementById('input-modal-eyebrow').textContent = eyebrow;
    document.getElementById('input-modal-title').textContent = title;
    const messageEl = document.getElementById('input-modal-message');
    messageEl.textContent = message;
    messageEl.hidden = !message;
    document.getElementById('input-modal-label').textContent = label;

    const input = document.getElementById('input-modal-input');
    input.type = type;
    input.value = value;
    if (maxLength) input.maxLength = maxLength; else input.removeAttribute('maxlength');
    if (type === 'number') {
        input.min = '0';
        input.step = '1';
        input.inputMode = 'numeric';
    } else {
        input.removeAttribute('min');
        input.removeAttribute('step');
        input.inputMode = 'text';
    }

    const confirmButton = document.getElementById('input-modal-confirm');
    confirmButton.textContent = confirmLabel;
    confirmButton.classList.toggle('btn-success', !danger);
    confirmButton.classList.toggle('btn-danger', danger);

    showInputModalError('');
    inputModalValidate = validate;
    document.getElementById('input-modal').hidden = false;
    document.body.classList.add('modal-open');
    input.focus();
    input.select();

    return new Promise(resolve => { inputModalResolve = resolve; });
}

/**
 * Muestra (o limpia) el mensaje de error debajo del campo del modal.
 * @param {string} message - Mensaje; vacío para ocultarlo.
 */
function showInputModalError(message) {
    const error = document.getElementById('input-modal-error');
    error.textContent = message;
    error.hidden = !message;
    document.getElementById('input-modal-input').setAttribute('aria-invalid', String(Boolean(message)));
}

/**
 * Cierra el modal de dato y entrega el resultado a quien lo abrió.
 * @param {string|null} result - Valor escrito, o null si se canceló.
 */
function closeInputModal(result) {
    const modal = document.getElementById('input-modal');
    if (modal.hidden && !inputModalResolve) return;
    modal.hidden = true;
    document.body.classList.remove('modal-open');
    const resolve = inputModalResolve;
    inputModalResolve = null;
    inputModalValidate = null;
    if (resolve) resolve(result);
}

/**
 * Guardar del modal de dato (botón o Enter): valida y, si está bien, lo cierra.
 * @param {Event} event - Envío del formulario.
 */
function submitInputModal(event) {
    event.preventDefault();
    const value = document.getElementById('input-modal-input').value.trim();
    const error = inputModalValidate ? inputModalValidate(value) : '';
    if (error) {
        showInputModalError(error);
        document.getElementById('input-modal-input').focus();
        return;
    }
    closeInputModal(value);
}

// Esc cierra el modal de dato sin guardar.
document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !document.getElementById('input-modal').hidden) {
        closeInputModal(null);
    }
});

/**
 * Escapa caracteres HTML para prevenir XSS
 * @param {string} text - Texto a escapar
 * @returns {string} Texto escapado
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Muestra un aviso temporal abajo al centro, donde no tapa el encabezado.
 * Si llegan muchos seguidos solo se conservan los más recientes.
 * @param {string} message - Mensaje a mostrar
 * @param {string} [key] - Avisos con la misma clave se reemplazan entre sí
 *   (por ejemplo, "agregado al carrito" al tocar varios productos rápido).
 */
function showNotification(message, key = '') {
    const region = document.getElementById('toast-region');
    if (!region) return;

    if (key) {
        region.querySelectorAll(`.toast[data-key="${key}"]`).forEach(toast => toast.remove());
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    if (key) toast.dataset.key = key;
    toast.textContent = message;
    region.appendChild(toast);

    while (region.children.length > MAX_VISIBLE_TOASTS) {
        region.firstElementChild.remove();
    }

    requestAnimationFrame(() => toast.classList.add('is-visible'));
    setTimeout(() => {
        toast.classList.remove('is-visible');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
        // Respaldo por si no hay transición (movimiento reducido).
        setTimeout(() => toast.remove(), 400);
    }, TOAST_DURATION_MS);
}

// Mantiene los avisos del sistema dentro de la interfaz, sin diálogos nativos.
window.alert = function(message) {
    showNotification(String(message));
};
