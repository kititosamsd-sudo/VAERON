// =========================================================
// VAERON — Historial de Notas de Pedido
// Lista de solo lectura de todo lo guardado en /orders (ver
// saveOrder en firebase.js, usado desde nueva-nota-logic.js).
// =========================================================

let historialNotasCache = [];

function historialNotaRowHtml(n) {
  const cliente = n.cliente || {};
  const fecha = n.creadoEn ? new Date(n.creadoEn).toLocaleDateString('es-PE') : '—';
  const numeroTexto = n.numeroFormateado || (n.numero !== undefined ? String(n.numero) : '—');
  return `
    <tr>
      <td data-label="N°"><span class="ruc-num">${escapeHtml(numeroTexto)}</span></td>
      <td data-label="Fecha">${escapeHtml(fecha)}</td>
      <td data-label="Cliente"><div class="client-name">${escapeHtml(formatClienteOrden(cliente))}</div></td>
      <td data-label="Ítems">${(n.items || []).length}</td>
      <td data-label="Total"><strong class="text-mono">S/ ${fmtPrice(n.total !== undefined ? n.total : 0)}</strong></td>
      <td data-label="Vendedor">${escapeHtml(n.vendedorNombre || '—')}</td>
      <td data-label="Acciones"><button type="button" class="btn-ver-detalle" onclick="abrirVerNotaHistorial('${escapeJsAttr(n.id)}')">Ver</button></td>
    </tr>`;
}

// Vuelve a armar el PDF de una nota ya guardada, a pedido — antes
// esto se disparaba solo al confirmar el pedido (ver guardarNota en
// nueva-nota-logic.js), lo cual forzaba una descarga en cada nota
// aunque el usuario no la quisiera en ese momento.
function descargarPdfHistorial(id) {
  const n = historialNotasCache.find(x => x.id === id);
  if (!n) return;
  const numeroTexto = n.numeroFormateado || (n.numero !== undefined ? String(n.numero) : '');
  generarPdfNota(numeroTexto, n.cliente || {}, n.items || [], n.descuentoPct || 0, n.subtotal || 0, n.total || 0);
}

function renderHistorialStats(list) {
  const cantidadEl = document.getElementById('statHistorialCantidad');
  if (!cantidadEl) return;

  const total = list.reduce((sum, n) => sum + (Number(n.total) || 0), 0);
  const promedio = list.length ? total / list.length : 0;

  cantidadEl.textContent = list.length;
  document.getElementById('statHistorialTotal').textContent = `S/ ${fmtPrice(total)}`;
  document.getElementById('statHistorialPromedio').textContent = `S/ ${fmtPrice(promedio)}`;
}

function renderHistorialNotas(list) {
  const body = document.getElementById('historialNotasBody');
  const empty = document.getElementById('historialNotasEmpty');
  if (!body) return; // la vista no está montada

  body.innerHTML = list.map(historialNotaRowHtml).join('');
  body.closest('.table-wrap').style.display = list.length ? 'block' : 'none';
  empty.style.display = list.length ? 'none' : 'flex';
  renderHistorialStats(list);
}

function filtrarHistorialNotas(q) {
  q = q.trim().toLowerCase();
  const filtradas = !q ? historialNotasCache : historialNotasCache.filter(n => {
    const c = n.cliente || {};
    const numeroTexto = n.numeroFormateado || String(n.numero || '');
    return `${numeroTexto} ${c.nombre || ''} ${c.ruc || ''} ${c.dni || ''}`.toLowerCase().includes(q);
  });
  renderHistorialNotas(filtradas);
}

let verNotaActualId = null;

// ── Modal "Ver nota" ──────────────────────────────────────
function abrirVerNotaHistorial(id) {
  const n = historialNotasCache.find(x => x.id === id);
  if (!n) return;
  verNotaActualId = id;

  const cliente = n.cliente || {};
  const items = n.items || [];
  const subtotal = n.subtotal !== undefined ? n.subtotal : items.reduce((s, it) => s + it.cantidad * it.precio * (1 - (it.descPct || 0) / 100), 0);
  const total = n.total !== undefined ? n.total : subtotal * (1 - (n.descuentoPct || 0) / 100);

  document.getElementById('verNotaEmpresa').textContent = (typeof currentTiendaNombre !== 'undefined' && currentTiendaNombre) || 'VAERON';
  document.getElementById('verNotaNum').textContent = n.numeroFormateado || String(n.numero || '—');
  document.getElementById('verNotaFecha').textContent = n.creadoEn ? new Date(n.creadoEn).toLocaleString('es-PE') : '—';
  document.getElementById('verNotaNombre').textContent = formatClienteOrden(cliente);
  document.getElementById('verNotaRuc').textContent = cliente.ruc || cliente.dni || '—';
  const vendedorRow = document.getElementById('verNotaVendedorRow');
  if (n.vendedorNombre) {
    vendedorRow.style.display = 'block';
    document.getElementById('verNotaVendedor').textContent = n.vendedorNombre;
  } else {
    vendedorRow.style.display = 'none';
  }

  document.getElementById('verNotaBody').innerHTML = items.map(it => {
    const desc = it.descPct || 0;
    const itemSubtotal = it.cantidad * it.precio * (1 - desc / 100);
    return `<tr>
      <td>${escapeHtml(displayProductCode(it.codigo || ''))}</td>
      <td>${escapeHtml(it.nombre || '')}</td>
      <td class="right">S/ ${fmtPrice(it.precio)}</td>
      <td class="right">${it.cantidad}</td>
      <td class="right">${desc > 0 ? desc + '%' : '—'}</td>
      <td class="right">S/ ${fmtPrice(itemSubtotal)}</td>
    </tr>`;
  }).join('');

  let totalesHtml = `Subtotal: S/ ${fmtPrice(subtotal)}<br>`;
  if (n.descuentoPct) totalesHtml += `Descuento (${n.descuentoPct}%): −S/ ${fmtPrice(subtotal - total)}<br>`;
  totalesHtml += `<strong>Total: S/ ${fmtPrice(total)}</strong>`;
  document.getElementById('verNotaTotales').innerHTML = totalesHtml;

  document.getElementById('verNotaDescargaMenu').classList.remove('open');
  document.getElementById('historialVerOverlay').classList.add('open');
}

function cerrarVerNotaHistorial() {
  document.getElementById('historialVerOverlay').classList.remove('open');
  verNotaActualId = null;
}

function toggleVerNotaDescargaMenu(event) {
  event.stopPropagation();
  document.getElementById('verNotaDescargaMenu').classList.toggle('open');
}
document.addEventListener('click', () => {
  const menu = document.getElementById('verNotaDescargaMenu');
  if (menu) menu.classList.remove('open');
});

function descargarPdfDesdeVerNota() {
  if (!verNotaActualId) return;
  descargarPdfHistorial(verNotaActualId);
}

// ── Editar ────────────────────────────────────────────────
// Reutiliza la pantalla de Nueva Nota en modo edición (ver
// NuevaNota.init en nueva-nota-logic.js) en vez de duplicar todo el
// formulario acá.
function editarNotaHistorial() {
  if (!verNotaActualId) return;
  const n = historialNotasCache.find(x => x.id === verNotaActualId);
  if (!n) return;
  cerrarVerNotaHistorial();
  Router.go('nueva-nota', { params: { editId: verNotaActualId, editNota: n } });
}

// ── Eliminar ──────────────────────────────────────────────
function eliminarNotaHistorial() {
  if (!verNotaActualId) return;
  const n = historialNotasCache.find(x => x.id === verNotaActualId);
  const numeroTexto = n ? (n.numeroFormateado || String(n.numero || '')) : 'esta nota';
  if (!confirm(`¿Eliminar la nota ${numeroTexto}? Esta acción no se puede deshacer.`)) return;

  const id = verNotaActualId;
  if (typeof deleteOrder !== 'function') {
    alert('No se pudo eliminar: falta la función deleteOrder.');
    return;
  }
  deleteOrder(id)
    .then(() => cerrarVerNotaHistorial())
    .catch(err => alert('No se pudo eliminar la nota: ' + err.message));
}

// ── Compartir ─────────────────────────────────────────────
// Usa el share nativo del navegador/celular cuando está disponible;
// si no, copia el resumen al portapapeles como respaldo.
function compartirNotaHistorial() {
  if (!verNotaActualId) return;
  const n = historialNotasCache.find(x => x.id === verNotaActualId);
  if (!n) return;
  const cliente = n.cliente || {};
  const numeroTexto = n.numeroFormateado || String(n.numero || '');
  const texto = `Nota ${numeroTexto} — ${formatClienteOrden(cliente)}\nTotal: S/ ${fmtPrice(n.total || 0)}`;

  if (navigator.share) {
    navigator.share({ title: `Nota ${numeroTexto}`, text: texto }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(texto).then(() => alert('Resumen de la nota copiado al portapapeles.'));
  } else {
    alert(texto);
  }
}

// ── Exportar a Excel ──────────────────────────────────────
// loadXlsxLib() y saveWorkbook() ya existen (stock.js / nav.js) y
// hacen exactamente lo que se necesita acá — se reutilizan tal cual.
async function descargarExcelDesdeVerNota() {
  if (!verNotaActualId) return;
  const n = historialNotasCache.find(x => x.id === verNotaActualId);
  if (!n) return;
  await loadXlsxLib();

  const cliente = n.cliente || {};
  const numeroTexto = n.numeroFormateado || String(n.numero || '');
  const filas = [
    ['Nota', numeroTexto],
    ['Cliente', formatClienteOrden(cliente)],
    ['RUC/DNI', cliente.ruc || cliente.dni || ''],
    ['Vendedor', n.vendedorNombre || ''],
    ['Fecha', n.creadoEn ? new Date(n.creadoEn).toLocaleString('es-PE') : ''],
    [],
    ['Código', 'Producto', 'Precio unit.', 'Cantidad', 'Desc. %', 'Subtotal']
  ];
  (n.items || []).forEach(it => {
    const desc = it.descPct || 0;
    filas.push([displayProductCode(it.codigo || ''), it.nombre || '', it.precio, it.cantidad, desc, it.cantidad * it.precio * (1 - desc / 100)]);
  });
  filas.push([], ['', '', '', '', 'Total', n.total || 0]);

  const ws = XLSX.utils.aoa_to_sheet(filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Nota');
  await saveWorkbook(wb, `nota-pedido-${numeroTexto}.xlsx`);
}

async function exportarHistorialExcel() {
  await loadXlsxLib();
  const filas = [['N°', 'Fecha', 'Cliente', 'RUC/DNI', 'Ítems', 'Total', 'Vendedor']];
  historialNotasCache.forEach(n => {
    const cliente = n.cliente || {};
    filas.push([
      n.numeroFormateado || String(n.numero || ''),
      n.creadoEn ? new Date(n.creadoEn).toLocaleDateString('es-PE') : '',
      formatClienteOrden(cliente),
      cliente.ruc || cliente.dni || '',
      (n.items || []).length,
      n.total || 0,
      n.vendedorNombre || ''
    ]);
  });
  const ws = XLSX.utils.aoa_to_sheet(filas);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Historial');
  const hoy = new Date().toISOString().slice(0, 10);
  await saveWorkbook(wb, `historial-notas-${hoy}.xlsx`);
}

window.HistorialNotas = {
  init() {
    const search = document.getElementById('historialNotasSearch');
    if (search) search.value = '';
    renderHistorialNotas([]);

    if (typeof watchOrders === 'function') {
      watchOrders(list => {
        // más reciente primero
        historialNotasCache = list.slice().sort((a, b) => (b.numero || 0) - (a.numero || 0));
        renderHistorialNotas(historialNotasCache);
      });
    }
  }
};
