// =========================================================
// Adonay — Tiendas (panel súper-admin)
// =========================================================
window.Tiendas = {
  async init() {
    await renderTiendas();
  }
};

function fmtFecha(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function estadoBadgeHtml(estado) {
  const activa = estado !== 'suspendida';
  const cls = activa ? 'badge-estado-activa' : 'badge-estado-suspendida';
  const label = activa ? 'Activa' : 'Suspendida';
  return `<span class="${cls}">${label}</span>`;
}

let tiendasCache = [];

async function renderTiendas() {
  const tbody = document.getElementById('tiendaTableBody');
  const empty = document.getElementById('tiendaEmptyState');
  if (!tbody) return;

  let tiendas = [];
  try {
    tiendas = await listarTiendas();
  } catch (err) {
    tbody.innerHTML = '';
    if (empty) { empty.style.display = 'block'; empty.querySelector('p').textContent = 'No se pudo cargar la lista de tiendas.'; }
    return;
  }
  tiendasCache = tiendas;

  document.getElementById('statTiendaTotal').textContent = tiendas.length;
  document.getElementById('statTiendaActivas').textContent = tiendas.filter(t => t.estado !== 'suspendida').length;
  document.getElementById('statTiendaSuspendidas').textContent = tiendas.filter(t => t.estado === 'suspendida').length;

  if (empty) empty.style.display = tiendas.length ? 'none' : 'block';

  tbody.innerHTML = tiendas.map(t => {
    const suspender = t.estado === 'suspendida';
    const contacto = [t.telefono, t.ciudad].filter(Boolean).join(' — ') || '—';
    const proyectoLabel = (FIREBASE_PROJECTS[t.proyecto] && FIREBASE_PROJECTS[t.proyecto].label) || t.proyecto;
    return `
      <tr>
        <td data-label="Tienda"><span><strong>${escapeHtml(t.nombre)}</strong><br><span class="badge-proyecto">${escapeHtml(proyectoLabel)}</span></span></td>
        <td data-label="Contacto">${escapeHtml(contacto)}</td>
        <td data-label="Usuarios">${t.totalUsuarios}</td>
        <td data-label="Alta">${fmtFecha(t.creadoEn)}</td>
        <td data-label="Estado">${estadoBadgeHtml(t.estado)}</td>
        <td data-label="" style="text-align:right">
          <div class="actions-cell">
            <button class="btn btn-ghost btn-sm" onclick="openEditTienda('${t.tiendaId}')">
              Editar
            </button>
            <button class="btn btn-ghost btn-sm" onclick="toggleTiendaEstado('${t.tiendaId}','${suspender ? 'activa' : 'suspendida'}','${t.proyecto}')">
              ${suspender ? 'Reactivar' : 'Suspender'}
            </button>
            <button class="btn btn-ghost btn-sm" style="color:var(--red)" onclick="onEliminarTienda('${t.tiendaId}','${escapeJsAttr(t.nombre)}','${t.proyecto}')">
              Eliminar
            </button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

async function onEliminarTienda(tiendaId, nombre, proyecto) {
  const confirmado = confirm(
    `¿Eliminar la tienda "${nombre}" por completo?\n\n` +
    'Esto borra la tienda, sus usuarios, productos y clientes. ' +
    'No se puede deshacer.'
  );
  if (!confirmado) return;

  try {
    await eliminarTienda(tiendaId, proyecto);
    await renderTiendas();
  } catch (err) {
    alert('No se pudo eliminar: ' + (err.message || err));
  }
}

async function toggleTiendaEstado(tiendaId, nuevoEstado, proyecto) {
  const confirmMsg = nuevoEstado === 'suspendida'
    ? '¿Suspender esta tienda? Sus usuarios no podrán entrar hasta que la reactives (ej. por falta de pago).'
    : '¿Reactivar esta tienda?';
  if (!confirm(confirmMsg)) return;
  await setTiendaEstado(tiendaId, nuevoEstado, proyecto);
  await renderTiendas();
}

let editingTiendaId = null;

function openEditTienda(tiendaId) {
  const t = tiendasCache.find(x => x.tiendaId === tiendaId);
  if (!t) return;
  editingTiendaId = tiendaId;
  document.getElementById('tiendaEditError').style.display = 'none';
  document.getElementById('editTiendaNombre').value = t.nombre || '';
  document.getElementById('editTiendaTelefono').value = t.telefono || '';
  document.getElementById('editTiendaCiudad').value = t.ciudad || '';
  document.getElementById('editTiendaDireccion').value = t.direccion || '';
  document.getElementById('editTiendaAdminNombre').value = t.adminNombre || '';
  document.getElementById('editTiendaAdminCorreo').value = t.adminCorreo || '';
  openModal('tiendaEditModal');
}

async function guardarEdicionTienda() {
  if (!editingTiendaId) return;
  const t = tiendasCache.find(x => x.tiendaId === editingTiendaId);
  const nombre = document.getElementById('editTiendaNombre').value.trim();
  const telefono = document.getElementById('editTiendaTelefono').value.trim();
  const ciudad = document.getElementById('editTiendaCiudad').value.trim();
  const direccion = document.getElementById('editTiendaDireccion').value.trim();
  const adminNombre = document.getElementById('editTiendaAdminNombre').value.trim();
  const errorBox = document.getElementById('tiendaEditError');
  const btn = document.getElementById('btnGuardarEdicionTienda');

  errorBox.style.display = 'none';
  if (!nombre) {
    errorBox.textContent = 'El nombre de la tienda no puede quedar vacío.';
    errorBox.style.display = 'block';
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Guardando…';
  try {
    await editarTienda(editingTiendaId, { nombre, telefono, ciudad, direccion }, t.proyecto);
    if (t && t.adminUid && adminNombre && adminNombre !== t.adminNombre) {
      await editarAdminNombre(editingTiendaId, t.adminUid, adminNombre, t.proyecto);
    }
    closeModal('tiendaEditModal');
    editingTiendaId = null;
    await renderTiendas();
  } catch (err) {
    errorBox.textContent = err.message || 'No se pudieron guardar los cambios.';
    errorBox.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Guardar cambios';
  }
}

async function crearTiendaDesdeForm() {
  const nombreTienda = document.getElementById('tiendaNombre').value.trim();
  const nombreAdmin  = document.getElementById('tiendaAdminNombre').value.trim();
  const correoAdmin  = document.getElementById('tiendaAdminCorreo').value.trim();
  const password     = document.getElementById('tiendaAdminPassword').value;
  const errorBox = document.getElementById('tiendaError');
  const btn = document.getElementById('btnCrearTienda');

  errorBox.style.display = 'none';

  if (!nombreTienda || !nombreAdmin || !correoAdmin || !password) {
    errorBox.textContent = 'Completa todos los campos.';
    errorBox.style.display = 'block';
    return;
  }
  if (password.length < 6) {
    errorBox.textContent = 'La contraseña debe tener al menos 6 caracteres.';
    errorBox.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Creando…';
  try {
    await crearTienda(nombreTienda, nombreAdmin, correoAdmin, password, {});
    closeModal('tiendaModal');
    document.getElementById('tiendaNombre').value = '';
    document.getElementById('tiendaAdminNombre').value = '';
    document.getElementById('tiendaAdminCorreo').value = '';
    document.getElementById('tiendaAdminPassword').value = '';
    await renderTiendas();
  } catch (err) {
    errorBox.textContent = /already-in-use|in use/i.test(err.message || '')
      ? 'Ese correo ya tiene una cuenta.'
      : (err.message || 'No se pudo crear la tienda.');
    errorBox.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Crear tienda';
  }
}
