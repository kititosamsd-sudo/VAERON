// =========================================================
// VAERON — Nueva Nota de Pedido
// Se llega acá desde Pedidos (botón "Nueva nota" del topbar, o
// "Crear nota" de un cliente puntual) vía Router.go('nueva-nota', {params}).
// Reutiliza clientsCache (pedidos-logic.js) y productsCache (stock.js)
// que ya están vivos en memoria — no vuelve a pedirle nada a Firebase.
// =========================================================

let notaCliente = null;   // { ruc, nombre, ciudad } o null si no se eligió todavía
let notaItems   = [];     // [{ codigo, nombre, cantidad, precio }]
let notaProductoSeleccionado = null; // { codigo, nombre } — el que está en el mini-formulario de "Agregar artículo"
let notaDescuentoPct = 0;
let notaGuardando = false;
let notaNumero = null;    // correlativo ya reservado al entrar a la vista (ver init)
let notaAnio = null;

// "NP-2026-187". El correlativo se reserva ni bien se abre la
// pantalla (ver init) para poder mostrarlo de entrada en el badge del
// topbar, tal como se pidió — la contra de eso es que si el usuario
// entra y se va sin guardar, ese número queda "quemado" y no se
// vuelve a usar (igual que un talonario de facturas de papel).
function formatNotaNumero(numero, anio) {
  return `NP-${anio}-${numero}`;
}

// ── Cliente ──────────────────────────────────────────────
function buscarClienteNota(q) {
  const box = document.getElementById('notaClienteResultados');
  q = q.trim().toLowerCase();
  if (!q) { box.style.display = 'none'; box.innerHTML = ''; return; }

  const matches = (typeof clientsCache !== 'undefined' ? clientsCache : [])
    .filter(c => `${c.ruc} ${c.nombre} ${c.ciudad || ''}`.toLowerCase().includes(q))
    .slice(0, 8);

  box.innerHTML = matches.length
    ? matches.map(c => `
        <div class="nota-autocomplete-item" onclick="seleccionarClienteNota('${escapeJsAttr(c.ruc)}')">
          ${escapeHtml(c.nombre)}
          <span>RUC ${escapeHtml(c.ruc)}${c.ciudad ? ' · ' + escapeHtml(c.ciudad) : ''}</span>
        </div>`).join('')
    : `<div class="nota-autocomplete-empty">Sin clientes que coincidan.</div>`;
  box.style.display = 'block';
}

function seleccionarClienteNota(ruc) {
  const c = (typeof clientsCache !== 'undefined' ? clientsCache : []).find(c => c.ruc === ruc);
  if (!c) return;
  notaCliente = { ruc: c.ruc, nombre: c.nombre, ciudad: c.ciudad || '' };
  document.getElementById('notaClienteBuscador').style.display = 'none';
  document.getElementById('notaClienteResultados').style.display = 'none';
  document.getElementById('notaClienteSearch').value = '';
  document.getElementById('notaClienteNombre').textContent = c.nombre;
  document.getElementById('notaClienteRuc').textContent = c.ruc;
  document.getElementById('notaClienteInfo').style.display = 'flex';
}

function quitarClienteNota() {
  notaCliente = null;
  document.getElementById('notaClienteInfo').style.display = 'none';
  document.getElementById('notaClienteBuscador').style.display = 'block';
}

// ── Agregar artículo (buscar → completa el mini-formulario → Añadir) ──
function buscarProductoNota(q) {
  const box = document.getElementById('notaProductoResultados');
  q = q.trim().toLowerCase();
  if (!q) { box.style.display = 'none'; box.innerHTML = ''; return; }

  const matches = (typeof productsCache !== 'undefined' ? productsCache : [])
    .filter(p => `${displayProductCode(p.code || '')} ${p.name || ''}`.toLowerCase().includes(q))
    .slice(0, 8);

  box.innerHTML = matches.length
    ? matches.map(p => `
        <div class="nota-autocomplete-item" onclick="elegirProductoNota('${escapeJsAttr(p.code)}')">
          ${escapeHtml(p.name || '')}
          <span>${escapeHtml(displayProductCode(p.code || ''))} · S/ ${fmtPrice(p.price)}</span>
        </div>`).join('')
    : `<div class="nota-autocomplete-empty">Sin productos que coincidan.</div>`;
  box.style.display = 'block';
}

// Elegir un resultado solo completa el mini-formulario (cantidad y
// precio, editables) — el ítem recién se agrega a la lista al tocar
// "+ Añadir" (ver anadirItemNota).
function elegirProductoNota(code) {
  const p = (typeof productsCache !== 'undefined' ? productsCache : []).find(p => p.code === code);
  if (!p) return;
  notaProductoSeleccionado = { codigo: p.code, nombre: p.name || '' };
  document.getElementById('notaProductoSearch').value = p.name || displayProductCode(p.code);
  document.getElementById('notaProductoResultados').style.display = 'none';
  document.getElementById('notaCantidadInput').value = 1;
  document.getElementById('notaPrecioInput').value = Number(p.price) || 0;
}

function anadirItemNota() {
  if (!notaProductoSeleccionado) return alert('Busca y elige un producto primero.');
  const cantidad = Math.max(1, parseInt(document.getElementById('notaCantidadInput').value, 10) || 1);
  const precio   = Math.max(0, parseFloat(document.getElementById('notaPrecioInput').value) || 0);

  const existente = notaItems.find(it => it.codigo === notaProductoSeleccionado.codigo);
  if (existente) {
    existente.cantidad += cantidad;
    existente.precio = precio; // el precio de la fila queda con el último que se tecleó
  } else {
    notaItems.push({ codigo: notaProductoSeleccionado.codigo, nombre: notaProductoSeleccionado.nombre, cantidad, precio });
  }

  notaProductoSeleccionado = null;
  document.getElementById('notaProductoSearch').value = '';
  document.getElementById('notaCantidadInput').value = 1;
  document.getElementById('notaPrecioInput').value = '';
  renderNotaItems();
}

function actualizarCantidadNota(idx, valor) {
  notaItems[idx].cantidad = Math.max(1, Number(valor) || 1);
  renderNotaItems();
}

function actualizarPrecioNota(idx, valor) {
  notaItems[idx].precio = Math.max(0, Number(valor) || 0);
  renderNotaItems();
}

function quitarItemNota(idx) {
  notaItems.splice(idx, 1);
  renderNotaItems();
}

function notaItemRowHtml(item, idx) {
  const subtotal = item.cantidad * item.precio;
  return `
    <div class="nota-item-row">
      <div class="nota-item-info">
        <div class="nota-item-name">${escapeHtml(item.nombre)}</div>
        <div class="nota-item-code">${escapeHtml(displayProductCode(item.codigo))}</div>
      </div>
      <input type="number" min="1" step="1" class="form-input" value="${item.cantidad}" onchange="actualizarCantidadNota(${idx}, this.value)">
      <input type="number" min="0" step="0.01" class="form-input" value="${item.precio}" onchange="actualizarPrecioNota(${idx}, this.value)">
      <div class="nota-item-subtotal">S/ ${fmtPrice(subtotal)}</div>
      <div class="nota-item-remove" onclick="quitarItemNota(${idx})" title="Quitar">✕</div>
    </div>`;
}

// ── Descuento ────────────────────────────────────────────
function setDescuentoNota(pct) {
  notaDescuentoPct = Math.min(100, Math.max(0, Number(pct) || 0));
  document.getElementById('notaDescuentoInput').value = notaDescuentoPct;
  document.querySelectorAll('.nota-pill').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.pct) === notaDescuentoPct);
  });
  renderNotaItems();
}

function renderNotaItems() {
  const listEl  = document.getElementById('notaItemsList');
  const emptyEl = document.getElementById('notaEmptyItems');
  if (!listEl) return; // la vista no está montada

  listEl.innerHTML = notaItems.map(notaItemRowHtml).join('');
  const hayItems = notaItems.length > 0;
  listEl.style.display = hayItems ? 'block' : 'none';
  emptyEl.style.display = hayItems ? 'none' : 'flex';
  document.getElementById('notaItemCount').textContent = notaItems.length;

  const subtotal = notaItems.reduce((sum, it) => sum + it.cantidad * it.precio, 0);
  const total = subtotal * (1 - notaDescuentoPct / 100);
  document.getElementById('notaSubtotal').textContent = `S/ ${fmtPrice(subtotal)}`;
  document.getElementById('notaTotal').textContent = `S/ ${fmtPrice(total)}`;
}

// ── Guardar + exportar PDF ───────────────────────────────
async function guardarNota() {
  if (notaGuardando) return;
  if (!notaCliente) return alert('Elige un cliente para la nota.');
  if (notaItems.length === 0) return alert('Agrega al menos un producto.');
  if (notaNumero === null) return alert('No se pudo asignar un número de nota — vuelve a entrar a esta pantalla.');

  notaGuardando = true;
  const btn = document.getElementById('btnGuardarNota');
  const textoOriginal = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Guardando…';

  try {
    const subtotal = notaItems.reduce((sum, it) => sum + it.cantidad * it.precio, 0);
    const total = subtotal * (1 - notaDescuentoPct / 100);

    await saveOrder({
      numero: notaNumero,
      numeroFormateado: formatNotaNumero(notaNumero, notaAnio),
      cliente: notaCliente,
      items: notaItems,
      descuentoPct: notaDescuentoPct,
      subtotal,
      total,
      vendedorUid: (typeof currentUserUid !== 'undefined') ? currentUserUid : null,
      vendedorNombre: (typeof currentUserName !== 'undefined') ? currentUserName : null
    });

    await generarPdfNota(notaNumero, notaAnio, notaCliente, notaItems, notaDescuentoPct, subtotal, total);

    Router.go('pedidos', { force: true });
  } catch (err) {
    alert('No se pudo guardar la nota: ' + err.message);
  } finally {
    notaGuardando = false;
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
}

async function generarPdfNota(numero, anio, cliente, items, descuentoPct, subtotal, total) {
  await loadScriptExport('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const marginX = 40;
  const numeroFmt = formatNotaNumero(numero, anio);
  let y = 50;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text((typeof currentTiendaNombre !== 'undefined' && currentTiendaNombre) || 'Nota de pedido', marginX, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  y += 22;
  doc.text(`Nota de pedido N° ${numeroFmt}`, marginX, y);
  y += 14;
  doc.text(`Fecha: ${new Date().toLocaleDateString('es-PE')}`, marginX, y);
  if (typeof currentUserName !== 'undefined' && currentUserName) {
    y += 14;
    doc.text(`Vendedor: ${currentUserName}`, marginX, y);
  }

  y += 22;
  doc.setFont('helvetica', 'bold');
  doc.text('Cliente', marginX, y);
  doc.setFont('helvetica', 'normal');
  y += 14;
  doc.text(`${cliente.nombre}  ·  RUC ${cliente.ruc}${cliente.ciudad ? '  ·  ' + cliente.ciudad : ''}`, marginX, y);

  y += 28;
  const cols = [
    { label: 'Código',   w: 80 },
    { label: 'Producto', w: 215 },
    { label: 'Cant.',    w: 50 },
    { label: 'Precio',   w: 85 },
    { label: 'Subtotal', w: 85 }
  ];
  const anchoTabla = cols.reduce((s, c) => s + c.w, 0);

  doc.setFont('helvetica', 'bold');
  let x = marginX;
  cols.forEach(c => { doc.text(c.label, x, y); x += c.w; });
  y += 6;
  doc.setLineWidth(0.5);
  doc.line(marginX, y, marginX + anchoTabla, y);
  y += 16;

  doc.setFont('helvetica', 'normal');
  items.forEach(item => {
    if (y > 760) { doc.addPage(); y = 50; }
    const itemSubtotal = item.cantidad * item.precio;
    const valores = [
      displayProductCode(item.codigo), item.nombre, String(item.cantidad),
      'S/ ' + fmtPrice(item.precio), 'S/ ' + fmtPrice(itemSubtotal)
    ];
    x = marginX;
    valores.forEach((v, i) => {
      doc.text(doc.splitTextToSize(v, cols[i].w - 6), x, y);
      x += cols[i].w;
    });
    y += 16;
  });

  y += 8;
  doc.line(marginX, y, marginX + anchoTabla, y);
  y += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Subtotal: S/ ${fmtPrice(subtotal)}`, marginX + anchoTabla - 150, y);
  if (descuentoPct > 0) {
    y += 14;
    doc.text(`Descuento (${descuentoPct}%): -S/ ${fmtPrice(subtotal - total)}`, marginX + anchoTabla - 150, y);
  }
  y += 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`Total: S/ ${fmtPrice(total)}`, marginX + anchoTabla - 150, y);

  await guardarPdfArchivo(doc, `nota-pedido-${numeroFmt}.pdf`);
}

// Mismo criterio que saveWorkbook() (nav.js) para XLSX: dentro del
// APK de Capacitor, la descarga clásica del navegador no es
// confiable — se usan los plugins nativos Filesystem + Share.
async function guardarPdfArchivo(doc, filename) {
  const isNative = window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform();

  if (isNative) {
    try {
      const { Filesystem, Share } = Capacitor.Plugins;
      const base64 = doc.output('datauristring').split(',')[1];
      const result = await Filesystem.writeFile({ path: filename, data: base64, directory: 'CACHE' });
      await Share.share({ title: filename, url: result.uri, dialogTitle: 'Guardar o compartir' });
    } catch (err) {
      const msg = (err && err.message) || '';
      if (/cancel/i.test(msg)) return; // el usuario cerró el panel de compartir
      alert('No se pudo guardar el PDF: ' + (msg || 'error desconocido'));
    }
    return;
  }

  doc.save(filename); // navegador de escritorio
}

// loadScriptExport ya está definida en pedidos-logic.js (que se
// carga antes que este archivo — ver app.html) y hace exactamente lo
// mismo que necesitamos acá: cargar un script externo una sola vez.
// Se reutiliza tal cual, sin duplicarla.

// ── Punto de entrada del Router ──────────────────────────
// params.clienteRuc: si se llegó desde "Crear nota" de un cliente
// puntual (ver pedidos-logic.js), lo preselecciona.
window.NuevaNota = {
  init(params) {
    notaCliente = null;
    notaItems = [];
    notaProductoSeleccionado = null;
    notaDescuentoPct = 0;
    notaNumero = null;
    notaAnio = new Date().getFullYear();

    document.getElementById('notaClienteBuscador').style.display = 'block';
    document.getElementById('notaClienteInfo').style.display = 'none';
    document.getElementById('notaClienteSearch').value = '';
    document.getElementById('notaClienteResultados').style.display = 'none';
    document.getElementById('notaProductoSearch').value = '';
    document.getElementById('notaProductoResultados').style.display = 'none';
    document.getElementById('notaCantidadInput').value = 1;
    document.getElementById('notaPrecioInput').value = '';
    document.getElementById('notaDescuentoInput').value = 0;
    document.querySelectorAll('.nota-pill').forEach(btn => btn.classList.remove('active'));
    document.getElementById('notaSubtitulo').textContent = 'Nueva';
    renderNotaItems();

    if (params && params.clienteRuc) {
      seleccionarClienteNota(params.clienteRuc);
    }

    // El N° se reserva apenas se entra a la pantalla (ver comentario
    // en formatNotaNumero). Si todavía no hay tienda/autenticación
    // lista (carrera rara al abrir con doble clic), se deja "Nueva"
    // en el badge en vez de romper la pantalla.
    if (typeof siguienteCorrelativoNota === 'function') {
      siguienteCorrelativoNota().then(numero => {
        notaNumero = numero;
        document.getElementById('notaSubtitulo').textContent = formatNotaNumero(numero, notaAnio);
      }).catch(() => {});
    }
  }
};
