// =========================================================
// Adonay — Auditoría (panel súper-admin)
// =========================================================
// Muestra el log de eventos que registra firebase.js (registrarEvento)
// cada vez que se crea una tienda, se suspende/reactiva, o se cambia
// su facturación. Es de solo lectura: no se puede editar ni borrar
// un evento desde acá — es justamente lo que le da valor como rastro
// de auditoría.
window.Auditoria = {
  async init() {
    await renderAuditoria();
  }
};

const EVENTO_LABELS = {
  tienda_creada:      { label: 'Tienda creada',      icon: '🆕' },
  tienda_suspendida:  { label: 'Tienda suspendida',  icon: '⛔' },
  tienda_reactivada:  { label: 'Tienda reactivada',  icon: '✅' },
  facturacion:        { label: 'Facturación',        icon: '💳' }
};

function fmtFechaHora(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('es-PE', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

async function renderAuditoria() {
  const tbody = document.getElementById('auditoriaTableBody');
  const empty = document.getElementById('auditoriaEmptyState');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-3);padding:20px">Cargando…</td></tr>';

  let eventos = [];
  try {
    eventos = await obtenerEventos(100);
  } catch (err) {
    tbody.innerHTML = '';
    if (empty) { empty.style.display = 'block'; empty.querySelector('p').textContent = 'No se pudo cargar la auditoría.'; }
    return;
  }

  if (empty) empty.style.display = eventos.length ? 'none' : 'block';

  // Nombre de tienda resuelto en un solo pase para no pedir una a una.
  let nombresPorTienda = {};
  try {
    const tiendas = await listarTiendas();
    tiendas.forEach(t => { nombresPorTienda[t.tiendaId] = t.nombre; });
  } catch (err) { /* si falla, se muestra el ID crudo */ }

  tbody.innerHTML = eventos.map(ev => {
    const cfg = EVENTO_LABELS[ev.tipo] || { label: ev.tipo || 'Evento', icon: '•' };
    const tienda = ev.tiendaId ? (nombresPorTienda[ev.tiendaId] || ev.tiendaId) : '—';
    return `
      <tr>
        <td data-label="Fecha" class="text-mono" style="white-space:nowrap">${fmtFechaHora(ev.timestamp)}</td>
        <td data-label="Evento">${cfg.icon} ${escapeHtml(cfg.label)}</td>
        <td data-label="Detalle">${escapeHtml(ev.detalle || '')}</td>
        <td data-label="Tienda">${escapeHtml(tienda)}</td>
        <td data-label="Realizado por">${escapeHtml(ev.actor || '—')}</td>
      </tr>`;
  }).join('');
}
