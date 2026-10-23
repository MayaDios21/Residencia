/*
 * USUARIOS (solo administrador)
 * Alta de usuarios, cambio de rol, activación y restablecimiento de contraseña.
 * Siempre trabaja contra la API: los usuarios solo existen en el backend.
 */

let managedUsers = [];

const ROLE_LABELS = { admin: 'Administrador', cashier: 'Cajero' };

/**
 * Indica si el usuario de la lista es quien tiene la sesión abierta.
 * @param {Object} user
 * @returns {boolean}
 */
function isCurrentUser(user) {
    return user.username === adminSession?.displayName;
}

/**
 * Da formato a la fecha del último acceso.
 * @param {string|null} value - Fecha ISO o null.
 * @returns {string} Fecha legible o 'Nunca'.
 */
function formatLastLogin(value) {
    if (!value) return 'Nunca';
    return new Date(value).toLocaleString('es-MX', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/** Descarga los usuarios del servidor y vuelve a dibujar la pantalla. */
async function loadUsers() {
    const list = document.getElementById('users-list');
    if (!list) return;
    list.innerHTML = '<tr><td colspan="6" class="table-empty">Cargando usuarios…</td></tr>';
    try {
        managedUsers = await getUsersFromApi();
        renderUsers();
    } catch (error) {
        list.innerHTML = '<tr><td colspan="6" class="table-empty">No se pudieron cargar los usuarios.</td></tr>';
        showNotification(`${error.message}`);
        console.error('Error al cargar usuarios:', error);
    }
}

/** Dibuja la tabla de usuarios (con o sin inactivos) y el contador de activos. */
function renderUsers() {
    const list = document.getElementById('users-list');
    const count = document.getElementById('users-count');
    const showInactive = document.getElementById('users-show-inactive')?.checked;
    const visibleUsers = managedUsers.filter(user => showInactive || user.is_active);

    if (count) {
        const active = managedUsers.filter(user => user.is_active).length;
        count.textContent = `${active} ${active === 1 ? 'activo' : 'activos'}`;
    }

    list.innerHTML = visibleUsers.length === 0
        ? '<tr><td colspan="6" class="table-empty">No hay usuarios que mostrar.</td></tr>'
        : visibleUsers.map(user => {
            const fullName = `${user.first_name} ${user.last_name}`.trim() || '—';
            const isSelf = isCurrentUser(user);
            const nextRole = user.role === 'admin' ? 'cashier' : 'admin';
            // Nadie puede quitarse el rol de administrador ni desactivarse a sí mismo.
            const selfLock = isSelf ? 'disabled title="No puedes cambiar tu propia cuenta"' : '';
            return `
                <tr class="${user.is_active ? '' : 'row-inactive'}">
                    <td><strong>${escapeHtml(user.username)}</strong>${isSelf ? ' <small class="field-help">(tú)</small>' : ''}</td>
                    <td>${escapeHtml(fullName)}</td>
                    <td>${ROLE_LABELS[user.role] || escapeHtml(user.role)}</td>
                    <td><span class="warehouse-status ${user.is_active ? 'available' : 'unknown'}">${user.is_active ? 'Activo' : 'Inactivo'}</span></td>
                    <td>${formatLastLogin(user.last_login)}</td>
                    <td>
                        <div class="table-actions">
                            <button class="btn btn-secondary btn-compact" type="button" onclick="confirmUserRoleChange(${user.id})" ${selfLock}>
                                Hacer ${ROLE_LABELS[nextRole].toLowerCase()}
                            </button>
                            <button class="btn ${user.is_active ? 'btn-danger' : 'btn-secondary'} btn-compact" type="button" onclick="confirmUserActiveChange(${user.id})" ${selfLock}>
                                ${user.is_active ? 'Desactivar' : 'Activar'}
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

    loadPasswordResetSelector();
}

/** Llena el selector de usuarios del formulario de restablecer contraseña. */
function loadPasswordResetSelector() {
    const selector = document.getElementById('reset-password-user');
    if (!selector) return;
    const selected = selector.value;
    selector.innerHTML = managedUsers.length === 0
        ? '<option value="">No hay usuarios</option>'
        : managedUsers.map(user => `
            <option value="${user.id}">${escapeHtml(user.username)} · ${ROLE_LABELS[user.role] || ''}${user.is_active ? '' : ' (inactivo)'}</option>
        `).join('');
    if (selected) selector.value = selected;
}

/**
 * Revisa que la contraseña y su confirmación coincidan.
 * @param {string} passwordId - ID del campo de contraseña.
 * @param {string} confirmId - ID del campo de confirmación.
 * @returns {boolean}
 */
function passwordsMatch(passwordId, confirmId) {
    const password = document.getElementById(passwordId).value;
    const confirmation = document.getElementById(confirmId).value;
    if (password !== confirmation) {
        showNotification('Las contraseñas no coinciden.');
        document.getElementById(confirmId).focus();
        return false;
    }
    return true;
}

/**
 * Crea un usuario con los datos del formulario y recarga la lista.
 * @param {Event} event - Envío del formulario de alta.
 */
async function createUser(event) {
    event.preventDefault();
    const form = document.getElementById('user-create-form');
    if (!form.reportValidity() || !passwordsMatch('user-password', 'user-password-confirm')) return;

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    try {
        const user = await createUserInApi({
            username: document.getElementById('user-username').value.trim(),
            first_name: document.getElementById('user-first-name').value.trim(),
            last_name: document.getElementById('user-last-name').value.trim(),
            role: document.getElementById('user-role').value,
            password: document.getElementById('user-password').value
        });
        form.reset();
        showNotification(`Usuario ${user.username} creado como ${ROLE_LABELS[user.role].toLowerCase()}.`);
        await loadUsers();
    } catch (error) {
        showNotification(`${error.message}`);
    } finally {
        submitButton.disabled = false;
    }
}

/**
 * Pide confirmación para cambiar a un usuario entre cajero y administrador.
 * @param {number} userId
 */
function confirmUserRoleChange(userId) {
    const user = managedUsers.find(item => item.id === userId);
    if (!user) return;
    const nextRole = user.role === 'admin' ? 'cashier' : 'admin';
    openActionModal(
        'Cambiar rol',
        `${user.username} pasará de ${ROLE_LABELS[user.role]} a ${ROLE_LABELS[nextRole]}. Tendrá que iniciar sesión de nuevo.`,
        'Cambiar rol',
        () => applyUserChange(user, { role: nextRole }, `${user.username} ahora es ${ROLE_LABELS[nextRole].toLowerCase()}.`)
    );
}

/**
 * Pide confirmación para activar o desactivar a un usuario.
 * @param {number} userId
 */
function confirmUserActiveChange(userId) {
    const user = managedUsers.find(item => item.id === userId);
    if (!user) return;
    const activate = !user.is_active;
    openActionModal(
        activate ? 'Activar usuario' : 'Desactivar usuario',
        activate
            ? `${user.username} podrá volver a iniciar sesión.`
            : `${user.username} ya no podrá iniciar sesión y se cerrará su sesión abierta. Sus ventas y movimientos se conservan.`,
        activate ? 'Activar' : 'Desactivar',
        () => applyUserChange(user, { is_active: activate }, `${user.username} ${activate ? 'activado' : 'desactivado'}.`)
    );
}

/**
 * Envía el cambio de un usuario a la API y recarga la lista.
 * @param {Object} user - Usuario a modificar.
 * @param {Object} changes - Campos a cambiar.
 * @param {string} successMessage - Aviso que se muestra si sale bien.
 */
async function applyUserChange(user, changes, successMessage) {
    try {
        await updateUserInApi(user.id, changes);
        showNotification(successMessage);
        await loadUsers();
    } catch (error) {
        showNotification(`${error.message}`);
    }
}

/**
 * Restablece la contraseña del usuario elegido en el formulario.
 * @param {Event} event - Envío del formulario de restablecer contraseña.
 */
async function resetUserPassword(event) {
    event.preventDefault();
    const form = document.getElementById('reset-password-form');
    if (!form.reportValidity() || !passwordsMatch('reset-password', 'reset-password-confirm')) return;

    const userId = Number(document.getElementById('reset-password-user').value);
    const user = managedUsers.find(item => item.id === userId);
    if (!user) return;

    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    try {
        await resetUserPasswordInApi(userId, document.getElementById('reset-password').value);
        form.reset();
        // El servidor cierra las sesiones del usuario al cambiar su contraseña.
        if (isCurrentUser(user)) {
            showNotification('Contraseña actualizada. Inicia sesión con la nueva contraseña.');
            await logoutSession();
            return;
        }
        loadPasswordResetSelector();
        showNotification(`Contraseña de ${user.username} actualizada.`);
    } catch (error) {
        showNotification(`${error.message}`);
    } finally {
        submitButton.disabled = false;
    }
}
