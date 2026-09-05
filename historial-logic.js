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
      <td data-label="Acciones"><button type="button" class="btn btn-ghost btn-sm" onclick="descargarPdfHistorial('${escapeJsAttr(n.id)}')">Descargar PDF</button></td>
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
