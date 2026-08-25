// =========================================================
// Adonay — Facturación (panel súper-admin)
// =========================================================
// Vista de gestión comercial: qué plan y monto paga cada tienda, y
// si está al día. Separada de "Tiendas" (que es alta/estado activo-
// suspendido) porque son decisiones distintas: una tienda puede
// estar "pendiente" de pago unos días sin que eso implique
// suspenderla — esa decisión la sigue tomando el súper-admin a mano
// desde Tiendas.
window.Facturacion = {
  async init() {
    await renderFacturacion();
  }
};

let facturacionTiendaActual = null;
let facturacionProyectoActual = null;

function fmtMoneda(monto) {
  return 'S/ ' + (Number(monto) || 0).toFixed(2);
}

function fmtFechaCorta(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function estadoPagoBadgeHtml(estado) {
  const map = {
    al_dia:    { cls: 'badge-estado-activa',      label: 'Al día' },
    pendiente: { cls: 'badge-estado-suspendida',  label: 'Pendiente' },
    vencido:   { cls: 'badge-estado-suspendida',  label: 'Vencido' }
  };
  const cfg = map[estado] || map.al_dia;
  return `<span class="${cfg.cls}">${cfg.label}</span>`;
}

function planLabel(plan) {
  return { basico: 'Básico', medio: 'Medio', premium: 'Premium' }[plan] || 'Básico';
}

async function renderFacturacion() {
  const tbody = document.getElementById('facturacionTableBody');
  const empty = document.getElementById('facturacionEmptyState');
  if (!tbody) return;

  let tiendas = [];
  try {
    tiendas = await listarTiendas();
  } catch (err) {
    tbody.innerHTML = '';
    if (empty) { empty.style.display = 'block'; empty.querySelector('p').textContent = 'No se pudo cargar la facturación.'; }
    return;
  }

  const ingresoMensual = tiendas
    .filter(t => t.estado !== 'suspendida')
    .reduce((sum, t) => sum + (Number(t.montoMensual) || 0), 0);
  const alDia = tiendas.filter(t => t.estadoPago === 'al_dia').length;
  const pendientes = tiendas.filter(t => t.estadoPago !== 'al_dia').length;

  document.getElementById('statFactIngreso').textContent = fmtMoneda(ingresoMensual);
  document.getElementById('statFactAlDia').textContent = alDia;
  document.getElementById('statFactPendientes').textContent = pendientes;

  if (empty) empty.style.display = tiendas.length ? 'none' : 'block';

  tbody.innerHTML = tiendas.map(t => `
    <tr>
      <td data-label="Tienda"><strong>${escapeHtml(t.nombre)}</strong></td>
      <td data-label="Plan">${planLabel(t.plan)}</td>
      <td data-label="Monto mensual" class="text-mono">${fmtMoneda(t.montoMensual)}</td>
      <td data-label="Próximo cobro">${fmtFechaCorta(t.proximoCobro)}</td>
      <td data-label="Estado de pago">${estadoPagoBadgeHtml(t.estadoPago)}</td>
      <td data-label="" style="text-align:right">
        <div class="actions-cell">
          <button class="btn btn-ghost btn-sm" onclick="abrirFacturacionModal('${t.tiendaId}','${escapeJsAttr(t.nombre)}','${t.plan}',${Number(t.montoMensual) || 0},${t.proximoCobro || 'null'},'${t.estadoPago}','${t.proyecto}')">
            Editar
          </button>
        </div>
      </td>
    </tr>`).join('');
}

function abrirFacturacionModal(tiendaId, nombre, plan, monto, proximoCobro, estadoPago, proyecto) {
  facturacionTiendaActual = tiendaId;
  facturacionProyectoActual = proyecto;
  document.getElementById('facturacionModalTienda').textContent = nombre;
  document.getElementById('facturacionPlan').value = plan || 'basico';
  document.getElementById('facturacionMonto').value = monto || 0;
  document.getElementById('facturacionProximoCobro').value = proximoCobro
    ? new Date(proximoCobro).toISOString().slice(0, 10)
    : '';
  document.getElementById('facturacionEstadoPago').value = estadoPago || 'al_dia';
  openModal('facturacionModal');
}

async function guardarFacturacionDesdeForm() {
  if (!facturacionTiendaActual) return;
  const plan = document.getElementById('facturacionPlan').value;
  const monto = document.getElementById('facturacionMonto').value;
  const fechaStr = document.getElementById('facturacionProximoCobro').value;
  const estadoPago = document.getElementById('facturacionEstadoPago').value;

  await actualizarFacturacion(facturacionTiendaActual, {
    plan,
    montoMensual: monto,
    estadoPago,
    proximoCobro: fechaStr ? new Date(fechaStr + 'T00:00:00').getTime() : null
  }, facturacionProyectoActual);

  closeModal('facturacionModal');
  facturacionTiendaActual = null;
  facturacionProyectoActual = null;
  await renderFacturacion();
}
