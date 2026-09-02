// =========================================================
// VAERON — Nueva Nota de Pedido
// Se llega acá desde Pedidos (botón "Nueva nota" del topbar, o
// "Crear nota" de un cliente puntual) vía Router.go('nueva-nota', {params}).
// Reutiliza clientsCache (pedidos-logic.js) y productsCache (stock.js)
// que ya están vivos en memoria — no vuelve a pedirle nada a Firebase.
// =========================================================

let notaCliente = null;   // { ruc, nombre, ciudad } o null si no se eligió todavía
let notaItems   = [];     // [{ codigo, nombre, cantidad, precio }]
let notaGuardando = false;

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
  document.getElementById('notaClienteCiudad').textContent = c.ciudad || '—';
  document.getElementById('notaClienteInfo').style.display = 'flex';
}

function quitarClienteNota() {
  notaCliente = null;
  document.getElementById('notaClienteInfo').style.display = 'none';
  document.getElementById('notaClienteBuscador').style.display = 'block';
}

// ── Productos ────────────────────────────────────────────
function buscarProductoNota(q) {
  const box = document.getElementById('notaProductoResultados');
  q = q.trim().toLowerCase();
  if (!q) { box.style.display = 'none'; box.innerHTML = ''; return; }

  const matches = (typeof productsCache !== 'undefined' ? productsCache : [])
    .filter(p => `${displayProductCode(p.code || '')} ${p.name || ''}`.toLowerCase().includes(q))
    .slice(0, 8);

  box.innerHTML = matches.length
    ? matches.map(p => `
        <div class="nota-autocomplete-item" onclick="agregarItemNota('${escapeJsAttr(p.code)}')">
          ${escapeHtml(p.name || '')}
          <span>${escapeHtml(displayProductCode(p.code || ''))} · S/ ${fmtPrice(p.price)}</span>
        </div>`).join('')
    : `<div class="nota-autocomplete-empty">Sin productos que coincidan.</div>`;
  box.style.display = 'block';
}

function agregarItemNota(code) {
  const p = (typeof productsCache !== 'undefined' ? productsCache : []).find(p => p.code === code);
  if (!p) return;

  const existente = notaItems.find(it => it.codigo === code);
  if (existente) {
    existente.cantidad += 1;
  } else {
    notaItems.push({ codigo: p.code, nombre: p.name || '', cantidad: 1, precio: Number(p.price) || 0 });
  }

  document.getElementById('notaProductoSearch').value = '';
  document.getElementById('notaProductoResultados').style.display = 'none';
  renderNotaItems();
}

function actualizarCantidadNota(idx, valor) {
  const cantidad = Math.max(1, Number(valor) || 1);
  notaItems[idx].cantidad = cantidad;
  renderNotaItems();
}

function actualizarPrecioNota(idx, valor) {
  const precio = Math.max(0, Number(valor) || 0);
  notaItems[idx].precio = precio;
  renderNotaItems();
}

function quitarItemNota(idx) {
  notaItems.splice(idx, 1);
  renderNotaItems();
}

function notaItemRowHtml(item, idx) {
  const subtotal = item.cantidad * item.precio;
  return `
    <tr>
      <td data-label="Código"><span class="ruc-num">${escapeHtml(displayProductCode(item.codigo))}</span></td>
      <td data-label="Producto">${escapeHtml(item.nombre)}</td>
      <td data-label="Cant."><input type="number" min="1" step="1" value="${item.cantidad}" style="width:70px" onchange="actualizarCantidadNota(${idx}, this.value)"></td>
      <td data-label="Precio"><input type="number" min="0" step="0.01" value="${item.precio}" style="width:90px" onchange="actualizarPrecioNota(${idx}, this.value)"></td>
      <td data-label="Subtotal">S/ ${fmtPrice(subtotal)}</td>
      <td><button class="btn btn-ghost" style="height:28px;padding:0 10px" onclick="quitarItemNota(${idx})" title="Quitar">✕</button></td>
    </tr>`;
}

function renderNotaItems() {
  const body  = document.getElementById('notaItemsBody');
  const empty = document.getElementById('notaEmptyItems');
  if (!body) return; // la vista no está montada

  body.innerHTML = notaItems.map(notaItemRowHtml).join('');
  empty.style.display = notaItems.length === 0 ? 'block' : 'none';
  body.closest('.table-wrap').style.display = notaItems.length === 0 ? 'none' : 'block';

  const total = notaItems.reduce((sum, it) => sum + it.cantidad * it.precio, 0);
  document.getElementById('notaTotal').textContent = fmtPrice(total);
}

// ── Guardar + exportar PDF ───────────────────────────────
async function guardarNota() {
  if (notaGuardando) return;
  if (!notaCliente) return alert('Elige un cliente para la nota.');
  if (notaItems.length === 0) return alert('Agrega al menos un producto.');

  notaGuardando = true;
  const btn = document.getElementById('btnGuardarNota');
  const textoOriginal = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Guardando…';

  try {
    const numero = await siguienteCorrelativoNota();
    const total  = notaItems.reduce((sum, it) => sum + it.cantidad * it.precio, 0);

    await saveOrder({
      numero,
      cliente: notaCliente,
      items: notaItems,
      total,
      vendedorUid: (typeof currentUserUid !== 'undefined') ? currentUserUid : null,
      vendedorNombre: (typeof currentUserName !== 'undefined') ? currentUserName : null
    });

    await generarPdfNota(numero, notaCliente, notaItems, total);

    Router.go('pedidos', { force: true });
  } catch (err) {
    alert('No se pudo guardar la nota: ' + err.message);
  } finally {
    notaGuardando = false;
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
}

async function generarPdfNota(numero, cliente, items, total) {
  await loadScriptExport('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const marginX = 40;
  const numeroFmt = String(numero).padStart(6, '0');
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
    const subtotal = item.cantidad * item.precio;
    const valores = [
      displayProductCode(item.codigo), item.nombre, String(item.cantidad),
      'S/ ' + fmtPrice(item.precio), 'S/ ' + fmtPrice(subtotal)
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
  y += 20;
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

    document.getElementById('notaClienteBuscador').style.display = 'block';
    document.getElementById('notaClienteInfo').style.display = 'none';
    document.getElementById('notaClienteSearch').value = '';
    document.getElementById('notaClienteResultados').style.display = 'none';
    document.getElementById('notaProductoSearch').value = '';
    document.getElementById('notaProductoResultados').style.display = 'none';
    renderNotaItems();

    if (params && params.clienteRuc) {
      seleccionarClienteNota(params.clienteRuc);
    }
  }
};
