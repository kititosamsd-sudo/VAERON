// =========================================================
// VAERON — Nueva Nota de Pedido
// Se llega acá desde Pedidos (botón "Nueva nota" del topbar, o
// "Crear nota" de un cliente puntual) vía Router.go('nueva-nota', {params}).
// Reutiliza clientsCache (pedidos-logic.js) y productsCache (stock.js)
// que ya están vivos en memoria — no vuelve a pedirle nada a Firebase.
// =========================================================

let notaCliente = null;   // { ruc, nombre, ciudad } o null si no se eligió todavía
let notaItems   = [];     // [{ codigo, nombre, cantidad, precio, descPct }]
let notaProductoSeleccionado = null; // { codigo, nombre } — el que está en el mini-formulario de "Agregar artículo"
let notaDescuentoPct = 0;
let notaGuardando = false;
let notaNumero = null;    // correlativo ya reservado al entrar a la vista (ver init)
let notaAnio = null;
let notaEditandoId = null; // id de /orders si se entró a editar una nota ya guardada (ver Historial); null = nota nueva

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
  notaCliente = { ruc: c.ruc, nombre: c.nombre, dni: '', ciudad: c.ciudad || '' };
  document.getElementById('notaClienteBuscador').style.display = 'none';
  document.getElementById('notaClienteResultados').style.display = 'none';
  document.getElementById('notaClienteSearch').value = '';
  mostrarClienteInfoNota();
}

function quitarClienteNota() {
  notaCliente = null;
  document.getElementById('notaClienteInfo').style.display = 'none';
  document.getElementById('notaClienteBuscador').style.display = 'block';
  cancelarCrearClienteNota();
}

// ── Cliente "al vuelo": crear solo con nombre, RUC o DNI ──
// Para cuando no hay un cliente ya registrado en Pedidos — por
// ejemplo una venta puntual a alguien nuevo. Solo pide UN dato (el
// que se elija), no obliga a llenar los tres.
let notaTipoClienteNuevo = null; // 'nombre' | 'ruc' | 'dni'

function abrirCrearClienteNota() {
  document.getElementById('notaClienteCrearForm').style.display = 'block';
  document.getElementById('btnAbrirCrearClienteNota').style.display = 'none';
}

function cancelarCrearClienteNota() {
  document.getElementById('notaClienteCrearForm').style.display = 'none';
  document.getElementById('btnAbrirCrearClienteNota').style.display = 'inline-flex';
  notaTipoClienteNuevo = null;
  document.querySelectorAll('#notaClienteCrearForm .nota-pill').forEach(btn => btn.classList.remove('active'));
  const input = document.getElementById('notaClienteValorInput');
  input.value = '';
  input.disabled = true;
  input.placeholder = 'Elige un dato arriba primero…';
}

function setTipoClienteNota(tipo) {
  notaTipoClienteNuevo = tipo;
  document.querySelectorAll('#notaClienteCrearForm .nota-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tipo === tipo);
  });
  const input = document.getElementById('notaClienteValorInput');
  input.disabled = false;
  input.value = '';
  input.placeholder = tipo === 'nombre' ? 'Nombre completo…'
    : tipo === 'ruc' ? 'Número de RUC…'
    : 'Número de DNI…';
  input.focus();
}

function confirmarCrearClienteNota() {
  if (!notaTipoClienteNuevo) return alert('Elige si vas a usar nombre, RUC o DNI.');
  const valor = document.getElementById('notaClienteValorInput').value.trim();
  if (!valor) return alert('Ingresa el dato del cliente.');

  notaCliente = { nombre: '', ruc: '', dni: '', ciudad: '' };
  notaCliente[notaTipoClienteNuevo] = valor;

  document.getElementById('notaClienteBuscador').style.display = 'none';
  mostrarClienteInfoNota();
  cancelarCrearClienteNota(); // deja el mini-formulario limpio para la próxima vez que se abra
}

// Pinta el panel "cliente elegido" tanto si vino de la búsqueda
// (ruc + nombre + ciudad) como si vino de "Crear" (un solo dato).
function mostrarClienteInfoNota() {
  document.getElementById('notaClienteNombre').textContent =
    notaCliente.nombre || (notaCliente.ruc ? `RUC ${notaCliente.ruc}` : (notaCliente.dni ? `DNI ${notaCliente.dni}` : 'Cliente'));

  const sub = [];
  if (notaCliente.nombre && notaCliente.ruc) sub.push(`RUC: ${notaCliente.ruc}`);
  if (notaCliente.nombre && notaCliente.dni) sub.push(`DNI: ${notaCliente.dni}`);
  if (notaCliente.ciudad) sub.push(notaCliente.ciudad);
  if (sub.length === 0 && !notaCliente.nombre) sub.push('Sin más datos');
  document.getElementById('notaClienteSubinfo').textContent = sub.join(' · ');

  document.getElementById('notaClienteInfo').style.display = 'flex';
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
    ? matches.map(p => {
        // Cantidad disponible en stock total — mismo campo que usa
        // Stock (ver getDisplayStock en stock.js) para no vender por
        // encima de lo que realmente hay. Se muestra en rojo cuando
        // ya no queda nada.
        const cant = p.stock !== undefined ? p.stock : 0;
        const cantClase = cant > 0 ? '' : ' style="color:var(--red)"';
        return `
        <div class="nota-autocomplete-item" onclick="elegirProductoNota('${escapeJsAttr(p.code)}')">
          ${escapeHtml(p.name || '')}
          <span>${escapeHtml(displayProductCode(p.code || ''))} · S/ ${fmtPrice(p.price)} · <span${cantClase}>${cant} en stock</span></span>
        </div>`;
      }).join('')
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
  document.getElementById('notaProductoClear').style.display = 'flex';

  const cant = p.stock !== undefined ? p.stock : 0;
  const hint = document.getElementById('notaStockHint');
  hint.style.display = 'flex';
  hint.classList.toggle('sin-stock', cant <= 0);
  hint.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg><span>${cant} en stock</span>`;
}

// Limpia la selección actual del buscador de productos (botón × del
// campo) sin necesidad de borrar el texto letra por letra.
function limpiarProductoNota() {
  notaProductoSeleccionado = null;
  document.getElementById('notaProductoSearch').value = '';
  document.getElementById('notaProductoResultados').style.display = 'none';
  document.getElementById('notaProductoClear').style.display = 'none';
  document.getElementById('notaStockHint').style.display = 'none';
  document.getElementById('notaProductoSearch').focus();
}

function anadirItemNota() {
  if (!notaProductoSeleccionado) return alert('Busca y elige un producto primero.');
  const cantidad = Math.max(1, parseInt(document.getElementById('notaCantidadInput').value, 10) || 1);
  const precio   = Math.max(0, parseFloat(document.getElementById('notaPrecioInput').value) || 0);
  const descPct  = Math.min(100, Math.max(0, parseFloat(document.getElementById('notaDescInput').value) || 0));

  const existente = notaItems.find(it => it.codigo === notaProductoSeleccionado.codigo);
  if (existente) {
    existente.cantidad += cantidad;
    existente.precio = precio; // el precio de la fila queda con el último que se tecleó
    existente.descPct = descPct;
  } else {
    notaItems.push({ codigo: notaProductoSeleccionado.codigo, nombre: notaProductoSeleccionado.nombre, cantidad, precio, descPct });
  }

  notaProductoSeleccionado = null;
  document.getElementById('notaProductoSearch').value = '';
  document.getElementById('notaCantidadInput').value = 1;
  document.getElementById('notaPrecioInput').value = '';
  document.getElementById('notaDescInput').value = 0;
  document.getElementById('notaProductoClear').style.display = 'none';
  document.getElementById('notaStockHint').style.display = 'none';
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

function actualizarDescNota(idx, valor) {
  notaItems[idx].descPct = Math.min(100, Math.max(0, Number(valor) || 0));
  renderNotaItems();
}

function quitarItemNota(idx) {
  notaItems.splice(idx, 1);
  renderNotaItems();
}

function notaItemRowHtml(item, idx) {
  const descPct = item.descPct || 0;
  const subtotal = item.cantidad * item.precio * (1 - descPct / 100);
  return `
    <div class="nota-item-row">
      <div class="nota-item-info">
        <div class="nota-item-name">${escapeHtml(item.nombre)}</div>
        <div class="nota-item-code">${escapeHtml(displayProductCode(item.codigo))}</div>
      </div>
      <input type="number" min="1" step="1" class="form-input" value="${item.cantidad}" onchange="actualizarCantidadNota(${idx}, this.value)">
      <input type="number" min="0" step="0.01" class="form-input" value="${item.precio}" onchange="actualizarPrecioNota(${idx}, this.value)">
      <input type="number" min="0" max="100" step="0.5" class="form-input" value="${descPct}" onchange="actualizarDescNota(${idx}, this.value)">
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
  const listEl   = document.getElementById('notaItemsList');
  const emptyEl  = document.getElementById('notaEmptyItems');
  const headerEl = document.getElementById('notaItemsHeader');
  if (!listEl) return; // la vista no está montada

  listEl.innerHTML = notaItems.map(notaItemRowHtml).join('');
  const hayItems = notaItems.length > 0;
  listEl.style.display = hayItems ? 'block' : 'none';
  if (headerEl) headerEl.style.display = hayItems ? 'flex' : 'none';
  emptyEl.style.display = hayItems ? 'none' : 'flex';
  document.getElementById('notaItemCount').textContent = notaItems.length;

  const subtotal = notaItems.reduce((sum, it) => sum + it.cantidad * it.precio * (1 - (it.descPct || 0) / 100), 0);
  const total = subtotal * (1 - notaDescuentoPct / 100);
  document.getElementById('notaSubtotal').textContent = `S/ ${fmtPrice(subtotal)}`;
  document.getElementById('notaTotal').textContent = `S/ ${fmtPrice(total)}`;
}

// ── Alerta de la pantalla (reemplaza los alert() nativos del
// navegador para errores de esta vista — menos invasiva y permite
// ofrecer un botón de acción, como "Reintentar" cuando falla la
// asignación del N° de nota). ──
function mostrarNotaAlert(msg, conReintentar) {
  const box = document.getElementById('notaAlertBox');
  if (!box) return;
  document.getElementById('notaAlertMsg').textContent = msg;
  document.getElementById('notaAlertRetryBtn').style.display = conReintentar ? 'inline-flex' : 'none';
  box.style.display = 'flex';
}

function ocultarNotaAlert() {
  const box = document.getElementById('notaAlertBox');
  if (box) box.style.display = 'none';
}

// Reserva el correlativo de la nota. Se usa tanto al entrar a la
// pantalla como desde el botón "Reintentar" de notaAlertBox si la
// primera vez falló (por ejemplo, sin conexión). Mientras no haya
// número asignado, no se puede confirmar el pedido — así el usuario
// no llena todo el formulario para toparse recién al final con que
// no se puede guardar.
function asignarNumeroNota() {
  const btnGuardar = document.getElementById('btnGuardarNota');
  if (typeof siguienteCorrelativoNota !== 'function') {
    mostrarNotaAlert('No se pudo preparar el número de nota.', false);
    return;
  }
  ocultarNotaAlert();
  siguienteCorrelativoNota().then(numero => {
    notaNumero = numero;
    document.getElementById('notaSubtitulo').textContent = formatNotaNumero(numero, notaAnio);
    if (btnGuardar) btnGuardar.disabled = false;
    ocultarNotaAlert();
  }).catch(() => {
    notaNumero = null;
    if (btnGuardar) btnGuardar.disabled = true;
    mostrarNotaAlert('No se pudo generar el número de nota. Revisa tu conexión e inténtalo de nuevo.', true);
  });
}

function reintentarNumeroNota() {
  asignarNumeroNota();
}

// ── Guardar + exportar PDF ───────────────────────────────
async function guardarNota() {
  if (notaGuardando) return;
  if (!notaCliente) return alert('Elige un cliente para la nota.');
  if (notaItems.length === 0) return alert('Agrega al menos un producto.');
  if (notaNumero === null) {
    mostrarNotaAlert('No se pudo generar el número de nota. Revisa tu conexión e inténtalo de nuevo.', true);
    return;
  }

  notaGuardando = true;
  const btn = document.getElementById('btnGuardarNota');
  const textoOriginal = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Guardando…';

  try {
    const subtotal = notaItems.reduce((sum, it) => sum + it.cantidad * it.precio * (1 - (it.descPct || 0) / 100), 0);
    const total = subtotal * (1 - notaDescuentoPct / 100);

    if (notaEditandoId) {
      // Editando una nota ya guardada (ver Historial > Ver > Editar):
      // se actualiza el registro existente, sin tocar su N° ni
      // consumir un correlativo nuevo.
      await updateOrder(notaEditandoId, {
        cliente: notaCliente,
        items: notaItems,
        descuentoPct: notaDescuentoPct,
        subtotal,
        total
      });
    } else {
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
    }

    Router.go(notaEditandoId ? 'historial' : 'pedidos', { force: true });
  } catch (err) {
    mostrarNotaAlert('No se pudo guardar la nota: ' + err.message, false);
  } finally {
    notaGuardando = false;
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
}

// Genera y descarga el PDF de una nota ya armada. Se usa tanto
// desde Historial (botón "Descargar PDF" por fila, con los datos
// ya guardados en /orders) como podría reusarse a futuro desde
// Nueva Nota si se agrega un botón explícito — pero YA NO se llama
// automáticamente al confirmar el pedido (antes forzaba una
// descarga en cada guardado, sin que el usuario lo pidiera).
async function generarPdfNota(numeroFmt, cliente, items, descuentoPct, subtotal, total) {
  await loadScriptExport('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const marginX = 40;
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
  const lineaCliente = (typeof formatClienteOrden === 'function') ? formatClienteOrden(cliente) : (cliente.nombre || '');
  doc.text(`${lineaCliente}${cliente.ciudad ? '  ·  ' + cliente.ciudad : ''}`, marginX, y);

  y += 28;
  const cols = [
    { label: 'Código',   w: 65 },
    { label: 'Producto', w: 190 },
    { label: 'Cant.',    w: 40 },
    { label: 'Precio',   w: 65 },
    { label: 'Desc. %',  w: 55 },
    { label: 'Subtotal', w: 60 }
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
    const descPct = item.descPct || 0;
    const itemSubtotal = item.cantidad * item.precio * (1 - descPct / 100);
    const valores = [
      displayProductCode(item.codigo), item.nombre, String(item.cantidad),
      'S/ ' + fmtPrice(item.precio), descPct > 0 ? `${descPct}%` : '—', 'S/ ' + fmtPrice(itemSubtotal)
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
    notaEditandoId = null;

    document.getElementById('notaClienteBuscador').style.display = 'block';
    document.getElementById('notaClienteInfo').style.display = 'none';
    document.getElementById('notaClienteSearch').value = '';
    document.getElementById('notaClienteResultados').style.display = 'none';
    cancelarCrearClienteNota();
    document.getElementById('notaProductoSearch').value = '';
    document.getElementById('notaProductoResultados').style.display = 'none';
    document.getElementById('notaCantidadInput').value = 1;
    document.getElementById('notaPrecioInput').value = '';
    document.getElementById('notaDescuentoInput').value = 0;
    document.querySelectorAll('.nota-pill').forEach(btn => btn.classList.remove('active'));
    document.getElementById('notaSubtitulo').textContent = 'Nueva';
    ocultarNotaAlert();
    renderNotaItems();

    if (params && params.clienteRuc) {
      seleccionarClienteNota(params.clienteRuc);
    }

    // Editando una nota ya guardada (llega desde Historial > Ver >
    // Editar, ver historial-logic.js): se precargan sus datos y NO
    // se reserva un N° nuevo — la nota conserva el suyo.
    if (params && params.editNota) {
      const n = params.editNota;
      notaEditandoId = params.editId;
      notaCliente = n.cliente || null;
      notaItems = (n.items || []).map(it => ({ ...it }));
      notaDescuentoPct = n.descuentoPct || 0;
      notaNumero = n.numero;
      document.getElementById('notaSubtitulo').textContent =
        (n.numeroFormateado || String(n.numero || '')) + ' · editando';
      if (notaCliente) {
        document.getElementById('notaClienteBuscador').style.display = 'none';
        mostrarClienteInfoNota();
      }
      document.getElementById('notaDescuentoInput').value = notaDescuentoPct;
      document.querySelectorAll('.nota-pill').forEach(btn => {
        btn.classList.toggle('active', Number(btn.dataset.pct) === notaDescuentoPct);
      });
      renderNotaItems();
      const btnGuardar = document.getElementById('btnGuardarNota');
      if (btnGuardar) { btnGuardar.disabled = false; btnGuardar.textContent = 'Guardar cambios'; }
      return;
    }

    // El N° se reserva apenas se entra a la pantalla (ver comentario
    // en formatNotaNumero). Se deshabilita "Confirmar pedido" hasta
    // que quede asignado — así, si falla (por ejemplo sin conexión),
    // el usuario ve el aviso con "Reintentar" de una vez, en vez de
    // completar todo el formulario y recién enterarse al final.
    const btnGuardar = document.getElementById('btnGuardarNota');
    if (btnGuardar) { btnGuardar.disabled = true; btnGuardar.textContent = 'Confirmar pedido'; }
    asignarNumeroNota();
  }
};
