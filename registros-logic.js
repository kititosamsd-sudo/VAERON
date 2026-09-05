// =========================================================
// Registros — gestión de cuentas del equipo (solo admin)
// =========================================================
// El acceso a esta pantalla ya lo bloquea el router (ver router.js)
// para cualquiera que no sea admin, y las reglas de Firebase
// bloquean también la escritura en tiendas/{tiendaId}/usuarios si no
// es admin de esa misma tienda — así que aunque alguien lograra abrir
// esta página, no podría cambiar nada fuera de su propia tienda.

let usersCache = [];

async function loadRegistros() {
  const tbody = document.getElementById('regTableBody');
  const footer = document.getElementById('regFooterInfo');
  const empty = document.getElementById('regEmptyState');
  footer.textContent = 'Cargando…';

  try {
    usersCache = await getAllUsers();
  } catch (err) {
    footer.textContent = 'No se pudo cargar la lista.';
    console.error(err);
    return;
  }

  if (usersCache.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = '';
    footer.textContent = '0 cuentas';
    return;
  }
  empty.style.display = 'none';
  renderRegistros();
}

function renderRegistros() {
  const tbody = document.getElementById('regTableBody');
  const footer = document.getElementById('regFooterInfo');

  tbody.innerHTML = usersCache.map(u => {
    const esUno = u.uid === currentUserUid;
    const activo = u.activo !== false;
    return `
      <tr data-uid="${escapeHtml(u.uid)}">
        <td>${escapeHtml(u.nombre || '—')}${esUno ? ' <span style="color:var(--text-3);font-size:11px">(tú)</span>' : ''}</td>
        <td style="color:var(--text-3);font-size:12.5px">${escapeHtml(u.rol === 'admin' ? (u.correo || '—') : (u.usuario || '—'))}</td>
        <td class="col-city"><span class="reg-role-badge ${u.rol === 'admin' ? 'admin' : ''}">${u.rol === 'admin' ? 'Admin' : 'Tienda'}</span></td>
        <td class="col-city">
          <div class="reg-status-cell">
            <label class="status-toggle">
              <input type="checkbox" ${activo ? 'checked' : ''} ${esUno ? 'disabled' : ''}
                onchange="onToggleActivo('${escapeJsAttr(u.uid)}', this.checked)">
              <span class="status-toggle-track"></span>
            </label>
            <span class="reg-status-label ${activo ? 'activo' : 'inactivo'}">${activo ? 'Activo' : 'Inactivo'}</span>
          </div>
        </td>
        <td class="col-acts">
          ${u.rol === 'vendedor' ? `<button class="btn btn-ghost btn-sm" onclick="openEditVendor('${escapeJsAttr(u.uid)}')" title="Editar cuenta" style="display:inline-flex;align-items:center;gap:5px;margin-right:6px">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Editar
        </button>` : ''}${esUno ? '' : `<button class="btn-reg-delete" onclick="onDeleteUser('${escapeJsAttr(u.uid)}', '${escapeJsAttr(u.nombre || u.usuario || '')}')" title="Eliminar cuenta" style="display:inline-flex;align-items:center;gap:5px">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
          Eliminar
        </button>`}</td>
      </tr>
    `;
  }).join('');

  footer.textContent = `${usersCache.length} cuenta${usersCache.length === 1 ? '' : 's'} · ${contarVendedores()}/${limitePlan('maxVendedores') === Infinity ? '∞' : limitePlan('maxVendedores')} vendedores (plan ${nombrePlan()})`;
}

async function onToggleActivo(uid, activo) {
  const row = document.querySelector(`tr[data-uid="${CSS.escape(uid)}"]`);
  const checkbox = row ? row.querySelector('input[type="checkbox"]') : null;
  if (checkbox) checkbox.disabled = true;

  try {
    await setUserActive(uid, activo);
    const u = usersCache.find(x => x.uid === uid);
    if (u) u.activo = activo;
    renderRegistros();
  } catch (err) {
    alert('No se pudo actualizar: ' + (err.message || err));
    renderRegistros(); // vuelve a pintar el estado real (revierte el switch si falló)
  }
}

async function onDeleteUser(uid, nombre) {
  if (uid === currentUserUid) return; // salvaguarda extra, aunque el botón ni se pinta para uno mismo
  if (!confirm(`¿Eliminar a "${nombre || 'este usuario'}"? Pierde acceso a la app de inmediato. Esta acción no se puede deshacer.`)) return;

  const row = document.querySelector(`tr[data-uid="${CSS.escape(uid)}"]`);
  const btn = row ? row.querySelector('.btn-reg-delete') : null;
  if (btn) btn.disabled = true;

  try {
    await deleteUserProfile(uid);
    usersCache = usersCache.filter(u => u.uid !== uid);
    renderRegistros();
  } catch (err) {
    alert('No se pudo eliminar: ' + (err.message || err));
    if (btn) btn.disabled = false;
  }
}

// ── Modal: nuevo vendedor ──────────────────────────────
// El plan de la tienda limita cuántas cuentas de vendedor puede
// tener (ver plan-limits.js: Básico = 1, Medio = 2, Premium = sin
// límite). El admin de la tienda (la primera cuenta, la que la creó)
// no cuenta para este tope — solo las cuentas rol:'vendedor'.
// Un vendedor desactivado (activo === false) libera su cupo de
// inmediato: no cuenta contra el límite hasta que lo vuelvan a
// activar. Decisión confirmada: desactivar sí libera el cupo (no
// hace falta borrar la cuenta para poder crear una nueva).
function contarVendedores() {
  return usersCache.filter(u => u.rol === 'vendedor' && u.activo !== false).length;
}

function openNewVendor() {
  const max = limitePlan('maxVendedores');
  if (contarVendedores() >= max) {
    alert(
      `Tu plan (${nombrePlan()}) permite hasta ${max} cuenta${max === 1 ? '' : 's'} de vendedor. ` +
      `Para agregar más, hace falta subir de plan.`
    );
    return;
  }
  document.getElementById('newVendorNombre').value = '';
  document.getElementById('newVendorUsuario').value = '';
  document.getElementById('newVendorEmail').value = '';
  document.getElementById('newVendorPassword').value = '';
  document.getElementById('newVendorError').style.display = 'none';
  document.getElementById('newVendorOverlay').classList.add('open');
}
function closeNewVendor() {
  document.getElementById('newVendorOverlay').classList.remove('open');
}

async function submitNewVendor() {
  const nombre = document.getElementById('newVendorNombre').value.trim();
  const usuario = document.getElementById('newVendorUsuario').value.trim();
  const correo = document.getElementById('newVendorEmail').value.trim();
  const password = document.getElementById('newVendorPassword').value;
  const errorEl = document.getElementById('newVendorError');
  const submitBtn = document.getElementById('newVendorSubmit');
  errorEl.style.display = 'none';

  if (!nombre || !usuario || !password) {
    errorEl.textContent = 'Completa nombre, usuario y contraseña.';
    errorEl.style.display = 'block';
    return;
  }
  if (normalizeUsername(usuario).length === 0) {
    errorEl.textContent = 'El usuario debe tener al menos una letra o número.';
    errorEl.style.display = 'block';
    return;
  }
  if (password.length < 6) {
    errorEl.textContent = 'La contraseña debe tener al menos 6 caracteres (mínimo que exige Firebase).';
    errorEl.style.display = 'block';
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Creando…';
  try {
    await createVendorAccount(usuario, password, nombre, correo);
    closeNewVendor();
    await loadRegistros();
  } catch (err) {
    errorEl.textContent = traducirErrorNuevoVendedor(err.code) || err.message || 'No se pudo crear la cuenta.';
    errorEl.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Crear cuenta';
  }
}

function traducirErrorNuevoVendedor(code) {
  const map = {
    'auth/email-already-in-use': 'Ese usuario ya existe — elige otro.',
    'auth/invalid-email': 'Ese usuario tiene caracteres que no se pueden usar. Prueba solo con letras y números.',
    'auth/weak-password': 'La contraseña es muy débil — usa al menos 6 caracteres.',
  };
  return map[code];
}

// ── Modal: editar cuenta (solo vendedores — el admin edita su
// propio perfil desde la pantalla de Perfil, que usa correo real en
// vez de usuario/contraseña-en-texto-plano) ───────────────────────
let editVendorUid = null;

function openEditVendor(uid) {
  const u = usersCache.find(x => x.uid === uid);
  if (!u) return;
  editVendorUid = uid;
  document.getElementById('editVendorNombre').value = u.nombre || '';
  document.getElementById('editVendorEmail').value = u.correo || '';
  document.getElementById('editVendorCurrentPass').value = u.passwordActual || '';
  document.getElementById('editVendorCurrentPass').type = 'password';
  document.getElementById('editVendorEyeIcon').innerHTML = '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
  document.getElementById('editVendorPassword').value = '';
  document.getElementById('editVendorError').style.display = 'none';
  document.getElementById('editVendorOverlay').classList.add('open');
}
function closeEditVendor() {
  document.getElementById('editVendorOverlay').classList.remove('open');
  editVendorUid = null;
}

function toggleEditVendorPasswordVisibility() {
  const input = document.getElementById('editVendorCurrentPass');
  const icon = document.getElementById('editVendorEyeIcon');
  const oculto = input.type === 'password';
  input.type = oculto ? 'text' : 'password';
  icon.innerHTML = oculto
    ? '<path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
    : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
}

async function submitEditVendor() {
  if (!editVendorUid) return;
  const u = usersCache.find(x => x.uid === editVendorUid);
  if (!u) return;

  const nombre = document.getElementById('editVendorNombre').value.trim();
  const correo = document.getElementById('editVendorEmail').value.trim();
  const nuevaPassword = document.getElementById('editVendorPassword').value;
  const errorEl = document.getElementById('editVendorError');
  const submitBtn = document.getElementById('editVendorSubmit');
  errorEl.style.display = 'none';

  if (!nombre) {
    errorEl.textContent = 'El nombre no puede quedar vacío.';
    errorEl.style.display = 'block';
    return;
  }
  if (nuevaPassword && nuevaPassword.length < 6) {
    errorEl.textContent = 'La contraseña debe tener al menos 6 caracteres (mínimo que exige Firebase).';
    errorEl.style.display = 'block';
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Guardando…';
  try {
    await updateVendorAccount(editVendorUid, u.usuario, u.passwordActual, nombre, correo, nuevaPassword || null);
    closeEditVendor();
    await loadRegistros();
  } catch (err) {
    errorEl.textContent = traducirErrorNuevoVendedor(err.code) || err.message || 'No se pudo guardar los cambios.';
    errorEl.style.display = 'block';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Guardar cambios';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.getElementById('newVendorOverlay');
  if (overlay) {
    overlay.addEventListener('click', e => { if (e.target === overlay) closeNewVendor(); });
  }
  const editOverlay = document.getElementById('editVendorOverlay');
  if (editOverlay) {
    editOverlay.addEventListener('click', e => { if (e.target === editOverlay) closeEditVendor(); });
  }
});

// Punto de entrada que llama el router. La navegación (nav.js) ya
// oculta este enlace para vendedor, pero esto es la barrera real:
// si alguien de todos modos llega a #registros (escribiendo la URL
// a mano), se lo manda de vuelta sin cargar nada.
window.Registros = {
  init: function () {
    if (typeof isAdmin === 'function' && !isAdmin()) {
      if (window.Router) Router.go('pedidos', { force: true });
      return;
    }
    loadRegistros();
  }
};
