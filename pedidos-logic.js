// =========================================================
// Adonay — Notas de Pedido (lógica)
// Extraído de pedidos.html para la SPA. Se carga UNA vez en
// index.html — la conexión a Firebase queda viva todo el tiempo,
// sin importar qué vista esté mostrándose en pantalla.
//
// IMPORTANTE: 3 funciones se renombraron porque su nombre chocaba
// con las mismas de Stock (toggleSelectionMode, setSelectionMode,
// outsideClose) — al convivir ambas páginas en el mismo documento,
// la que cargara última "pisaba" a la otra silenciosamente.
//   toggleSelectionMode → toggleClienteSelectionMode
//   setSelectionMode    → setClienteSelectionMode
//   outsideClose(e)     → outsideCloseCliente(e)
// =========================================================

let clientsCache = [];
let editingRuc    = '';
let isNewClient   = false;
let selectedClientRucs = new Set();
// RUC de la ficha (Ver) abierta actualmente — lo usa el botón "Crear
// nota" del pie del modal (ver clientDetailModal en pedidos-view.html).
let clientDetailRucActual = '';

// Mismo criterio que Stock: se pinta de a CLIENTS_PAGE_SIZE y se
// carga más al llegar cerca del final del scroll — la búsqueda sigue
// filtrando sobre TODO clientsCache (ya en memoria).
const CLIENTS_PAGE_SIZE = 20;
let clientsRenderLimit  = CLIENTS_PAGE_SIZE;
let clientsScrollObserver = null;

const clientSelection = createSelectionMode({
  containers: ['.table-wrap table', '.topbar-actions'],
  buttonId: 'btnSelectMode',
  labelId: 'selectModeLabel',
  onExit: () => {
    selectedClientRucs.clear();
    document.querySelectorAll('.client-check').forEach(cb => { cb.checked = false; });
    const master = document.getElementById('checkAllClientes');
    if (master) master.checked = false;
    updateBulkClientes();
  }
});

function getFilteredClients() {
  const q = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
  if (!q) return clientsCache;
  return clientsCache.filter(c => {
    const search = `${c.ruc || ''} ${c.nombre || ''} ${c.ciudad || ''}`.toLowerCase();
    return search.includes(q);
  });
}

function clientRowHtml(c) {
  const escapedRuc    = escapeJsAttr(c.ruc);
  const isChecked = selectedClientRucs.has(c.ruc) ? 'checked' : '';
  return `
    <tr data-ruc="${escapeHtml(c.ruc)}" class="${isChecked ? 'row-selected' : ''}">
      <td class="col-check"><input type="checkbox" class="row-checkbox client-check" data-ruc="${escapeHtml(c.ruc)}" ${isChecked} onchange="onClientCheckToggle(this)"></td>
      <td data-label="RUC"><span class="ruc-num">${escapeHtml(c.ruc)}</span></td>
      <td data-label="Cliente"><div class="client-name">${escapeHtml(c.nombre)}</div></td>
      <td data-label="Ciudad"><span class="city-cell">${c.ciudad ? escapeHtml(c.ciudad) : '—'}</span></td>
      <td data-label="">
        <div class="actions-cell" style="display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap">
          <button class="btn btn-ghost btn-ver-cliente" style="height:30px;font-size:12px;padding:0 10px"
            onclick="openClientDetail('${escapedRuc}')">
            <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            Ver
          </button>
          <button class="btn btn-ghost btn-crear-nota" style="height:30px;font-size:12px;padding:0 10px"
            onclick="Router.go('nueva-nota', {params:{clienteRuc:'${escapedRuc}'}})">
            <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
            Crear nota
          </button>
          <button class="btn btn-ghost btn-edit-client admin-only-action" style="height:30px;font-size:12px;padding:0 10px"
            onclick="openEdit('${escapedRuc}')">
            <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            Editar
          </button>
        </div>
      </td>
    </tr>
  `;
}

/* Vuelve a armar la página visible (0..clientsRenderLimit) a partir
   del listado ya filtrado. Se usa al cargar/cambiar datos, al
   tipear en el buscador, y al llegar al final del scroll. */
function renderClientsPage() {
  const body = document.getElementById('tableBody');
  if (!body) return; // la vista de Pedidos no está montada ahora mismo

  const filtered = getFilteredClients();
  const page = filtered.slice(0, clientsRenderLimit);
  body.innerHTML = page.map(clientRowHtml).join('');

  if (currentUserRole !== 'vendedor') {
    body.querySelectorAll('tr[data-ruc]').forEach(row => wireSelectableRow(row, clientSelection, onClientCheckToggle));
  }

  const empty  = document.getElementById('emptyState');
  const footer = document.getElementById('footerInfo');
  if (empty)  empty.style.display = filtered.length === 0 ? 'block' : 'none';
  if (footer) footer.textContent = '';

  applyPedidosRoleRestrictions();
  setupClientsInfiniteScroll(filtered.length);
  updateBulkClientes();
}

/* Observa un centinela al final de la tabla; cuando entra en
   pantalla, se cargan 20 clientes más — sin volver a pedirle nada
   a Firebase, ya están todos en clientsCache. root apunta a
   main.main (el contenedor que realmente scrollea desde ≤1280px —
   antes era .page-content, pero desde que main.main pasó a manejar
   el scroll completo, root:'.page-content' quedó apuntando a un
   contenedor que ya no scrollea) en vez de la ventana completa —
   root:null nunca detectaba el final porque el scroll real no pasa
   en la ventana. En escritorio (>1280px) .page-content sigue siendo
   el que scrollea, pero main.main sigue siendo un ancestro válido
   igual (el spec de IntersectionObserver ya resuelve la intersección
   contra el scrollport real cuando root no es el que clippa). */
function setupClientsInfiniteScroll(totalFiltered) {
  if (clientsScrollObserver) { clientsScrollObserver.disconnect(); clientsScrollObserver = null; }
  if (clientsRenderLimit >= totalFiltered) return; // ya está todo cargado

  const tbody = document.getElementById('tableBody');
  if (!tbody) return;

  const sentinel = document.createElement('div');
  sentinel.id = 'clientsScrollSentinel';
  sentinel.style.height = '1px';
  const tr = document.createElement('tr');
  const td = document.createElement('td');
  td.colSpan = 5;
  td.appendChild(sentinel);
  tr.appendChild(td);
  tbody.appendChild(tr);

  clientsScrollObserver = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) {
      clientsRenderLimit += CLIENTS_PAGE_SIZE;
      renderClientsPage();
    }
  }, { root: tbody.closest('main.main'), rootMargin: '400px' });
  clientsScrollObserver.observe(sentinel);
}

// ── Render dinámico de la tabla a partir de Firebase ──────
// Si la vista de Pedidos no está montada en este momento (el
// usuario está viendo Stock, por ejemplo), #tableBody no existe —
// no hay nada que pintar todavía. Cuando vuelva a Pedidos,
// Pedidos.init() llama a renderClients() de nuevo con los datos
// ya en caché, sin esperar a Firebase otra vez.
function renderClients() {
  clientsRenderLimit = CLIENTS_PAGE_SIZE; // el catálogo cambió (Firebase) — se vuelve a empezar desde la primera página
  renderClientsPage();
}

// Suscripción en tiempo real a Firebase — se conecta UNA sola vez,
// apenas la app abre (no en cada visita a la sección).
// El súper-admin no pertenece a ninguna tienda (currentTiendaId
// queda null a propósito, ver auth-guard.js) — sin este chequeo,
// scopedRef() tronaba apenas cargaba la página, aunque el
// súper-admin nunca llegara a abrir Pedidos: este script se carga
// igual en toda la app, no solo cuando se navega a esta sección.
authReady.then(() => {
  // Envuelto en try/catch a propósito: si por una carrera de Firebase
  // Auth (común al abrir con doble clic, file://) currentTiendaId
  // todavía no quedó puesto cuando esto corre, que quede como un
  // aviso silencioso en consola y no como un error sin capturar.
  try {
    if (!currentTiendaId) return;
    watchClients(list => {
      clientsCache = list.sort((a, b) => a.nombre.localeCompare(b.nombre));
      renderClients();
    });
  } catch (err) {
    console.warn('[Pedidos] No se pudo iniciar la escucha de clientes:', err.message);
  }
});

// Los <select> de "Día" del cumpleaños se llenan una sola vez acá
// (1..31) — más simple que escribir 31 <option> a mano en el HTML.
function poblarDiasCumple() {
  const sel = document.getElementById('editCumpleDia');
  if (!sel || sel.options.length > 1) return; // ya poblado
  for (let d = 1; d <= 31; d++) {
    const opt = document.createElement('option');
    opt.value = String(d);
    opt.textContent = String(d);
    sel.appendChild(opt);
  }
}

function openEdit(ruc) {
  if (currentUserRole === 'vendedor') return; // editar cliente es exclusivo de admin
  const c = clientsCache.find(x => x.ruc === ruc);
  if (!c) return;
  poblarDiasCumple();
  isNewClient = false;
  editingRuc = ruc;
  document.getElementById('editModalTitle').textContent = 'Editar cliente';
  document.getElementById('editModalSubtitle').textContent = 'Modificar datos del cliente en la nota';
  document.getElementById('editCurrentInfo').style.display = 'flex';
  document.getElementById('btnDeleteClient').style.display = 'inline-flex';
  document.getElementById('editCurrentRuc').textContent = ruc;
  document.getElementById('editCurrentCity').textContent = c.ciudad || '—';
  document.getElementById('editRuc').value = ruc;
  document.getElementById('editNombre').value = c.nombre || '';
  document.getElementById('editCiudad').value = c.ciudad || '';
  document.getElementById('editTelefono').value = c.telefono || '';
  document.getElementById('editCorreo').value = c.correo || '';
  document.getElementById('editCumpleDia').value = c.cumpleDia || '';
  document.getElementById('editCumpleMes').value = c.cumpleMes || '';
  document.getElementById('editInteres').value = c.interes || '';
  document.getElementById('editNotas').value = c.notas || '';
  document.getElementById('editModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function openNewClient() {
  poblarDiasCumple();
  isNewClient = true;
  editingRuc = '';
  document.getElementById('editModalTitle').textContent = 'Nuevo cliente';
  document.getElementById('editModalSubtitle').textContent = 'Registrar cliente para emitir notas de pedido';
  document.getElementById('editCurrentInfo').style.display = 'none';
  document.getElementById('btnDeleteClient').style.display = 'none';
  document.getElementById('editRuc').value = '';
  document.getElementById('editNombre').value = '';
  document.getElementById('editCiudad').value = '';
  document.getElementById('editTelefono').value = '';
  document.getElementById('editCorreo').value = '';
  document.getElementById('editCumpleDia').value = '';
  document.getElementById('editCumpleMes').value = '';
  document.getElementById('editInteres').value = '';
  document.getElementById('editNotas').value = '';
  document.getElementById('editModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeEdit() {
  const modal = document.getElementById('editModal');
  if (!modal) return;
  modal.classList.remove('open');
  document.body.style.overflow = '';
}

// Renombrado de outsideClose(e) — ver nota al inicio del archivo.
function outsideCloseCliente(e) {
  if (e.target === document.getElementById('editModal')) closeEdit();
}

function saveEdit() {
  if (!isNewClient && currentUserRole === 'vendedor') return; // editar cliente es exclusivo de admin

  const ruc    = document.getElementById('editRuc').value.trim();
  const nombre = document.getElementById('editNombre').value.trim();
  const ciudad = document.getElementById('editCiudad').value.trim();
  const telefono = document.getElementById('editTelefono').value.trim();
  const correo   = document.getElementById('editCorreo').value.trim();
  const cumpleDia = document.getElementById('editCumpleDia').value;
  const cumpleMes = document.getElementById('editCumpleMes').value;
  const interes = document.getElementById('editInteres').value.trim();
  const notas   = document.getElementById('editNotas').value.trim();

  // RUC (11 dígitos, empresas) o DNI (8 dígitos, consumidor final) —
  // antes solo se aceptaba RUC, pensado para clientes B2B. Con el
  // CRM apuntando a cualquier rubro (no solo instrumentos musicales,
  // donde casi todo cliente tenía RUC), hace falta poder registrar
  // también a una persona natural con DNI.
  if (!/^\d{8}$/.test(ruc) && !/^\d{11}$/.test(ruc)) {
    return alert('El documento debe ser un DNI (8 dígitos) o un RUC (11 dígitos).');
  }
  if (!nombre) {
    return alert('Completa la razón social.');
  }
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) {
    return alert('El correo no parece válido.');
  }
  if ((isNewClient || ruc !== editingRuc) && clientsCache.some(c => c.ruc === ruc)) {
    return alert(`Ya existe un cliente registrado con el documento ${ruc}.`);
  }

  // null en vez de '' para los opcionales vacíos: saveClient() hace
  // refClients.child(ruc).set({...}) y Firebase omite del nodo
  // cualquier campo en null, en vez de guardar una cadena vacía que
  // después hay que estar filtrando en cada lectura.
  const data = {
    nombre, ciudad,
    telefono: telefono || null,
    correo: correo || null,
    cumpleDia: cumpleDia ? Number(cumpleDia) : null,
    cumpleMes: cumpleMes ? Number(cumpleMes) : null,
    interes: interes || null,
    notas: notas || null
  };
  const finish = () => closeEdit();

  if (!isNewClient && editingRuc && ruc !== editingRuc) {
    saveClient(ruc, data)
      .then(() => deleteClient(editingRuc))
      .then(finish)
      .catch(err => alert('No se pudo actualizar el cliente: ' + err.message));
  } else {
    saveClient(ruc, data).then(finish).catch(err => {
      alert('No se pudo guardar el cliente: ' + err.message);
    });
  }
}

// ── Ficha de cliente (Ver) — CRM: datos de contacto + historial de
// compras real. A diferencia de Editar, cualquier cuenta de la
// tienda puede abrirla (ver botón "Ver" en clientRowHtml, sin clase
// admin-only-action).
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function openClientDetail(ruc) {
  const c = clientsCache.find(x => x.ruc === ruc);
  if (!c) return;

  clientDetailRucActual = ruc;
  document.getElementById('clientDetailNombre').textContent = c.nombre || ruc;
  document.getElementById('clientDetailRuc').textContent = (ruc.length === 8 ? 'DNI ' : 'RUC ') + ruc;
  document.getElementById('clientDetailCiudad').textContent = c.ciudad || '—';
  document.getElementById('clientDetailTelefono').textContent = c.telefono || '—';
  document.getElementById('clientDetailCorreo').textContent = c.correo || '—';
  document.getElementById('clientDetailCumple').textContent =
    (c.cumpleDia && c.cumpleMes) ? `${c.cumpleDia} de ${MESES_CORTOS[c.cumpleMes - 1]}` : '—';

  const interesGroup = document.getElementById('clientDetailInteresGroup');
  if (c.interes) {
    interesGroup.style.display = '';
    document.getElementById('clientDetailInteres').textContent = c.interes;
  } else {
    interesGroup.style.display = 'none';
  }

  const notasGroup = document.getElementById('clientDetailNotasGroup');
  if (c.notas) {
    notasGroup.style.display = '';
    document.getElementById('clientDetailNotas').textContent = c.notas;
  } else {
    notasGroup.style.display = 'none';
  }

  const historialEl = document.getElementById('clientDetailHistorial');
  historialEl.innerHTML = '<p style="font-size:12.5px;color:var(--text-3);margin:0">Cargando…</p>';

  document.getElementById('clientDetailModal').classList.add('open');
  document.body.style.overflow = 'hidden';

  getOrders()
    .then(orders => {
      // Si mientras cargaba el usuario ya cerró la ficha o abrió la
      // de otro cliente, no pisa lo que esté mostrando ahora.
      if (clientDetailRucActual !== ruc) return;
      renderClientDetailHistorial(orders.filter(o => o.cliente && o.cliente.ruc === ruc));
    })
    .catch(() => {
      if (clientDetailRucActual !== ruc) return;
      historialEl.innerHTML = '<p style="font-size:12.5px;color:var(--red);margin:0">No se pudo cargar el historial.</p>';
    });
}

function renderClientDetailHistorial(ordenes) {
  const el = document.getElementById('clientDetailHistorial');
  if (!ordenes.length) {
    el.innerHTML = '<p style="font-size:12.5px;color:var(--text-3);margin:0">Todavía no tiene pedidos registrados.</p>';
    return;
  }
  ordenes.sort((a, b) => (b.creadoEn || 0) - (a.creadoEn || 0));
  const totalGastado = ordenes.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
  const filas = ordenes.map(o => {
    const fecha = o.creadoEn ? new Date(o.creadoEn).toLocaleDateString('es-PE') : '—';
    const numeroTexto = o.numeroFormateado || (o.numero !== undefined ? String(o.numero) : '—');
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--surface-2);border-radius:var(--r-sm);font-size:12.5px">
        <span>N° ${escapeHtml(numeroTexto)} · ${escapeHtml(fecha)}</span>
        <strong>S/ ${fmtPrice(Number(o.total) || 0)}</strong>
      </div>`;
  }).join('');
  el.innerHTML = `
    <p style="font-size:12px;color:var(--text-3);margin:0 0 2px">${ordenes.length} pedido${ordenes.length === 1 ? '' : 's'} · S/ ${fmtPrice(totalGastado)} en total</p>
    ${filas}`;
}

function closeClientDetail() {
  const modal = document.getElementById('clientDetailModal');
  if (!modal) return;
  modal.classList.remove('open');
  document.body.style.overflow = '';
  clientDetailRucActual = '';
}

function outsideCloseClientDetail(e) {
  if (e.target === document.getElementById('clientDetailModal')) closeClientDetail();
}

function deleteCurrentClient() {
  if (!editingRuc) return;
  if (currentUserRole === 'vendedor') return; // vendedor puede editar, no eliminar
  if (!confirm(`¿Eliminar al cliente con documento ${editingRuc}? Esta acción no se puede deshacer.`)) return;
  deleteClient(editingRuc).then(() => closeEdit())
    .catch(err => alert('No se pudo eliminar el cliente: ' + err.message));
}

function filterTable() {
  clientsRenderLimit = CLIENTS_PAGE_SIZE; // nueva búsqueda: se vuelve a la primera página de resultados
  renderClientsPage();
}

// El listener de Escape queda activo siempre (se cargó una vez);
// closeEdit() ya es seguro de llamar aunque la vista no exista.
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeEdit();
});

// ── Modo selección / checkboxes ─────────────────────────
function setClienteSelectionMode(on) { if (on && !isAdmin()) return; clientSelection.set(on); }
function toggleClienteSelectionMode() { if (!isAdmin()) return; clientSelection.toggle(); }

function onClientCheckToggle(cb) {
  const ruc = cb.dataset.ruc;
  if (cb.checked) selectedClientRucs.add(ruc); else selectedClientRucs.delete(ruc);
  updateBulkClientes();
}

function toggleAllClientes(master) {
  const filtered = getFilteredClients();
  if (master.checked) {
    filtered.forEach(c => selectedClientRucs.add(c.ruc));
  } else {
    filtered.forEach(c => selectedClientRucs.delete(c.ruc));
  }
  renderClientsPage();
}

function selectAllClientes() {
  getFilteredClients().forEach(c => selectedClientRucs.add(c.ruc));
  const master = document.getElementById('checkAllClientes');
  if (master) master.checked = true;
  renderClientsPage();
}

function updateBulkClientes() {
  document.querySelectorAll('#tableBody tr[data-ruc]').forEach(row => {
    row.classList.toggle('row-selected', selectedClientRucs.has(row.dataset.ruc));
  });

  const count = selectedClientRucs.size;
  const bar   = document.getElementById('bulkBarClientes');
  if (!bar) return;
  bar.classList.toggle('visible', count > 0);
  document.getElementById('bulkCountClientes').textContent =
    `${count} cliente${count !== 1 ? 's' : ''} seleccionado${count !== 1 ? 's' : ''}`;

  const total    = clientsCache.length;
  const filtered = getFilteredClients().length;
  const exportBtn = document.getElementById('exportClientesLabel');
  if (exportBtn) {
    if (count > 0)             exportBtn.textContent = `Exportar (${count} sel.)`;
    else if (filtered < total) exportBtn.textContent = `Exportar filtrado (${filtered})`;
    else                       exportBtn.textContent = `Exportar todo (${total})`;
  }
}

function deleteSelectedClientes() {
  if (!isAdmin()) return;
  const count = selectedClientRucs.size;
  if (count === 0) return;
  if (!confirm(`¿Eliminar ${count} cliente${count !== 1 ? 's' : ''}? Esta acción no se puede deshacer.`)) return;
  // allSettled: un RUC con problema no bloquea el borrado del resto
  // (mismo criterio que se aplicó en Stock).
  Promise.allSettled([...selectedClientRucs].map(ruc => deleteClient(ruc)))
    .then(results => {
      setClienteSelectionMode(false);
      const failed = results.filter(r => r.status === 'rejected').length;
      if (failed > 0) alert(`${count - failed} cliente(s) eliminado(s). ${failed} no se pudo(pudieron) eliminar.`);
    });
}

function deleteAllClientes() {
  if (!isAdmin()) return;
  const total = clientsCache.length;
  if (total === 0) return;
  if (!confirm(`¿Eliminar TODOS los ${total} clientes? Esta acción no se puede deshacer.`)) return;
  if (!confirm('Segunda confirmación: ¿estás seguro? Se borrarán todos los clientes.')) return;
  Promise.allSettled(clientsCache.map(c => deleteClient(c.ruc)))
    .then(results => {
      setClienteSelectionMode(false);
      const failed = results.filter(r => r.status === 'rejected').length;
      if (failed > 0) alert(`${total - failed} cliente(s) eliminado(s). ${failed} no se pudo(pudieron) eliminar.`);
    });
}

async function exportClientes() {
  let rows, filename;
  if (selectedClientRucs.size > 0) {
    rows = clientsCache.filter(c => selectedClientRucs.has(c.ruc));
    filename = `clientes-seleccionados-${today()}.xlsx`;
  } else {
    const filteredClients = getFilteredClients();
    const allVisible = filteredClients.length === clientsCache.length;
    // Solo se pregunta cuando el botón exporta TODO el catálogo
    // (sin filtro ni selección activa) — exportar una selección o
    // un filtro ya es una acción intencional y puntual, así que no
    // hace falta confirmarla también.
    if (allVisible && !confirm(`¿Exportar los ${filteredClients.length} clientes a Excel?`)) return;
    rows = filteredClients;
    filename = allVisible
      ? `clientes-todos-${today()}.xlsx`
      : `clientes-filtrados-${today()}.xlsx`;
  }

  // Ver comentario en loadXlsxLib() (stock.js) sobre por qué esto ya
  // no apunta a un CDN externo.
  await loadScriptExport('vendor/xlsx.full.min.js');

  const data = [
    ['RUC/DNI', 'Cliente', 'Ciudad'],
    ...rows.map(c => [c.ruc, sanitizeForExcel(c.nombre), sanitizeForExcel(c.ciudad || '')])
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 14 }, { wch: 36 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
  await saveWorkbook(wb, filename);
}

function loadScriptExport(url) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${url}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = url; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ── Restricciones de rol "vendedor" ─────────────────────
function applyPedidosRoleRestrictions() {
  if (currentUserRole !== 'vendedor') return;
  const btnImport = document.querySelector('.btn-import');
  if (btnImport) btnImport.style.display = 'none';
  const btnExport = document.getElementById('btnExportClientes');
  if (btnExport) btnExport.style.display = 'none';
  const btnSelect = document.getElementById('btnSelectMode');
  if (btnSelect) btnSelect.style.display = 'none';
  // El botón "Editar" de cada fila queda oculto para vendedor: no
  // puede modificar los datos del cliente (RUC, razón social,
  // ciudad) desde esta vista. Solo admin puede editar clientes.
  document.querySelectorAll('.btn-edit-client').forEach(btn => { btn.style.display = 'none'; });
}

// ── Punto de entrada que llama el Router cada vez que se
//    muestra esta vista (instantáneo: usa clientsCache ya cargado) ──
window.Pedidos = {
  init() {
    renderClients(); // ya reaplica las restricciones de rol adentro
  }
};
