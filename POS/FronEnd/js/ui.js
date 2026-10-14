/*
 * INTERFAZ COMPARTIDA
 * Avisos temporales (toasts), modal de confirmación de acciones y escape de
 * texto para insertar datos del usuario en HTML.
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

function closeActionModal() {
    document.getElementById('action-confirmation-modal').hidden = true;
    document.body.classList.remove('modal-open');
    pendingAction = null;
}

function confirmActionModal() {
    const callback = pendingAction;
    closeActionModal();
    if (callback) callback();
}

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
