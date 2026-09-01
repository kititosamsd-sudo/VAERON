/* ══════════════════════════════════════
   stock.js — Lógica de inventario
   ══════════════════════════════════════ */

let productsCache = [];

/* ── Almacenes (Stock por almacén) ──────────────────────
   currentWarehouse: '' = "Todos los almacenes" (comportamiento de
   siempre, usa el stock TOTAL). 'alm1'..'alm6' = solo la cantidad de
   ese almacén (ver WAREHOUSES/updateWarehouseStock/addWarehouseStock
   en firebase.js). Las pestañas de alm2 en adelante se generan al
   vuelo en aplicarConfigAlmacenes() según cuáles estén activos para
   esta tienda — el HTML solo trae fijas "Todos" y "Almacén 1". */
let currentWarehouse = '';
// Nombres reales: los carga aplicarConfigAlmacenes() (más abajo, vía
// Stock.init()) desde tiendas/{tiendaId}/config — estos son solo el
// valor por defecto mientras eso llega o si la tienda nunca los
// personalizó (ver getAlmacenesConfig() en firebase.js).
let WAREHOUSE_LABELS = {
  alm1: 'Almacén 1', alm2: 'Almacén 2', alm3: 'Almacén 3',
  alm4: 'Almacén 4', alm5: 'Almacén 5', alm6: 'Almacén 6',
};

function getDisplayStock(p) {
  if (!currentWarehouse) return p.stock !== undefined ? p.stock : 0;
  return (p.almacenes && p.almacenes[currentWarehouse]) || 0;
}

function switchWarehouse(whId) {
  currentWarehouse = whId || '';
  document.querySelectorAll('.warehouse-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.wh === currentWarehouse);
  });
  const header = document.getElementById('colStockHeader');
  if (header) {
    header.textContent = currentWarehouse ? `Cantidad — ${WAREHOUSE_LABELS[currentWarehouse]}` : 'Cantidad';
    header.title = header.textContent;
  }

  const importDefault = document.getElementById('importMenuWrap');
  const exportDefault = document.getElementById('btnExportStock');
  const importWh = document.getElementById('btnImportWarehouse');
  const exportWh = document.getElementById('btnExportWarehouse');
  const showDefault = !currentWarehouse;
  const isVendedor = typeof currentUserRole !== 'undefined' && currentUserRole === 'vendedor';
  if (importDefault) importDefault.style.display = (showDefault && !isVendedor) ? '' : 'none';
  if (exportDefault) exportDefault.style.display = (showDefault && !isVendedor) ? '' : 'none';
  if (importWh) importWh.style.display = (!showDefault && !isVendedor) ? '' : 'none';
  if (exportWh) exportWh.style.display = (!showDefault && !isVendedor) ? '' : 'none';

  stockRenderLimit = STOCK_PAGE_SIZE;
  renderProducts();
}

// Normaliza un código de producto para que sea siempre una clave
// de Firebase válida y consistente, venga de "Agregar producto",
// de editar, o de una importación masiva. Sin esto, "101 -4L" y
// "101-4L" quedaban como dos productos distintos (dos claves
// distintas) aunque a simple vista parezcan el mismo código.
function normalizeProductCode(raw) {
  var code = String(raw || '').trim().toUpperCase().replace(/\s+/g, '-').replace(/-+/g, '-');
  // sanitizeFirebaseKey vive en import-stock.js (quita/reemplaza
  // caracteres inválidos para una clave de Firebase: . # $ [ ] /).
  // Se llama así, en vez de duplicar la lógica, porque ambos
  // archivos se cargan en el mismo scope global de la SPA.
  if (typeof sanitizeFirebaseKey === 'function') code = sanitizeFirebaseKey(code);
  // Códigos que vienen de un Excel con columnas de ancho fijo
  // (ej. "B-3K-" con 50 espacios de relleno después) terminan, tras
  // el trim de arriba, en un guion colgando que no forma parte del
  // código real — nadie escribe a propósito un código que TERMINE en
  // guion. Se recorta cualquier racha de guiones/caracteres no
  // alfanuméricos que quede pegada al FINAL. El resto del código
  // (incluido el inicio) queda intacto: solo se toca la punta final.
  // Se exceptúan la comilla doble " (marca de pulgadas, ej. tambor
  // "14"") y la barra de fracción ⁄ (ej. violín "4⁄4"): ambas SÍ son
  // válidas como clave de Firebase y son parte real del código —
  // igual que la barra "/" ya se preserva (como ⁄) en vez de
  // recortarse, la comilla no debe perderse solo por caer al final.
  // El guion "-" también se preserva ahora si queda UNO solo al
  // final (ej. "FV-BOW-1/2-"): antes se recortaba pensando que
  // siempre era un artefacto de Excel con columnas de ancho fijo,
  // pero un guion colgando también puede ser parte real de un
  // código escrito a mano — y ya no hay forma de distinguir ambos
  // casos una vez reducidos a un solo guion. Lo que SÍ se sigue
  // recortando del final es cualquier otro símbolo (espacios ya
  // convertidos en guion, etc.) que no sea uno de estos tres.
  var trimmedEnd = code.replace(/[^A-Z0-9"⁄-]+$/, '');
  if (trimmedEnd) code = trimmedEnd; // si quedara vacío (código de puros símbolos), se deja como estaba
  // Si al final quedan 2 (o más) del mismo símbolo pegados —típico
  // de escribir sin querer 14"" en vez de 14", o "--" en vez de "-"—
  // se deja solo uno. Un código nunca necesita el mismo símbolo
  // repetido al final para tener sentido.
  code = code.replace(/(["⁄-])\1+$/, '$1');
  return code;
}

// Convierte la clave interna de vuelta a lo que el usuario realmente
// escribió, para CUALQUIER lugar donde el código se muestre en
// pantalla (tarjetas, tabla, modal de editar, notas, Excel...).
// Internamente el código se guarda con "⁄" (U+2044) en vez de "/"
// porque Firebase no admite "/" dentro de una clave, pero mostrar
// ese caracter tal cual en vez de convertirlo de vuelta a "/" hace
// que a simple vista se vea casi idéntico a un guion normal — el
// usuario edita, vuelve a escribir "/", y el resultado se ve
// exactamente igual que antes, como si el cambio nunca se hubiera
// guardado. Esta función es la única responsable de esa conversión
// de vuelta, así que todo lo que el usuario VE siempre muestra "/"
// tal cual lo tecleó, sin importar qué caracter se use por debajo
// para guardarlo.
function displayProductCode(code) {
  return String(code || '').replace(/⁄/g, '/');
}

function fmtPrice(n) {
  const num = Number(n);
  if (isNaN(num)) return "0";
  return num.toLocaleString(formatoNumeroActivo(), { minimumFractionDigits: num % 1 === 0 ? 0 : 2 });
}

// Tasa de cambio USD → Sol, propia de cada tienda (Configuración).
// Se carga una vez en Stock.init() y se guarda acá para no tener que
// leerla de Firebase cada vez que se pinta una fila.
let currentTasaCambio = 0;

// Muestra el precio con el símbolo de la moneda en la que se guardó
// (S/ o $) y, si hay tasa de cambio configurada, el equivalente
// aproximado en la otra moneda entre paréntesis — así la tienda ve
// ambos valores sin tener que calcular nada.
function fmtMoney(price, currency) {
  const isUsd = currency === 'USD';
  const symbol = isUsd ? '$' : 'S/';
  let out = `${symbol} ${fmtPrice(price)}`;
  if (currentTasaCambio > 0) {
    const otherSymbol = isUsd ? 'S/' : '$';
    const converted = isUsd ? price * currentTasaCambio : price / currentTasaCambio;
    out += `<span class="pt-price-alt">≈ ${otherSymbol} ${fmtPrice(converted)}</span>`;
  }
  return out;
}

/* ── Paginación por scroll infinito ──────────────────────
   Antes se armaban las 500+ filas de golpe (tarjetas Y tabla) y
   la búsqueda solo las ocultaba con CSS — igual quedaban todas en
   el DOM. Ahora solo se pintan de a PAGE_SIZE, y se agregan más
   automáticamente cuando el usuario llega cerca del final. La
   búsqueda sigue operando sobre TODO productsCache (ya está en
   memoria, no hace falta volver a pedirle nada a Firebase), pero
   el renderizado de los resultados también se pagina igual. */
const STOCK_PAGE_SIZE = 20;
let stockRenderLimit = STOCK_PAGE_SIZE;
let stockScrollObserver = null;

// Separación por almacén: parada en la pestaña de "Todos los
// almacenes" (currentWarehouse === '') se ve el catálogo completo,
// igual que siempre. Parada en la pestaña de UN almacén puntual,
// solo se listan los productos que de verdad PERTENECEN a ese
// almacén — es decir, que tienen una entrada en /almacenes/{whId},
// aunque esa cantidad sea 0 (ver addProduct(): un producto nuevo
// creado estando en Almacén 2 queda asignado a alm2, no a alm1, y
// tiene que seguir viéndose ahí aunque todavía no se le haya cargado
// stock). Antes se mostraba el catálogo entero en cualquier pestaña
// (con 0 para los que no tenían nada en ese almacén), lo que hacía
// parecer que todos los productos estaban repartidos en todos lados
// a la vez.
function belongsToWarehouse(p, whId) {
  return !!(p.almacenes && Object.prototype.hasOwnProperty.call(p.almacenes, whId));
}

function getWarehouseScopedProducts() {
  if (!currentWarehouse) return productsCache;
  return productsCache.filter(p => belongsToWarehouse(p, currentWarehouse));
}

function getFilteredProducts() {
  const q = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
  const base = getWarehouseScopedProducts();
  if (!q) return base;
  return base.filter(p => {
    // displayProductCode() vuelve a convertir "⁄" en "/" antes de
    // comparar: si no, buscar "1/2" nunca encontraría un producto
    // guardado internamente como "1⁄2" (el usuario nunca escribe
    // "⁄", solo ve y escribe "/").
    const search = `${displayProductCode(p.code || '')} ${p.name || ''} ${p.category || ''}`.toLowerCase();
    return search.includes(q);
  });
}

// Línea extra "Precio mayor: ..." bajo el precio normal — solo en
// plan Premium (ver plan-limits.js: campoPrecioMayor) y solo si el
// producto tiene ese campo cargado (> 0). Reutiliza el mismo estilo
// que ya existe para el equivalente en otra moneda (pt-price-alt),
// así no hace falta tocar el CSS ni la estructura de la tabla/tarjeta.
function precioMayorLineaHtml(p, price, currency) {
  const mostrar = (typeof limitePlan === 'function') ? limitePlan('campoPrecioMayor') : false;
  const precioMayor = Number(p.precioMayor) || 0;
  if (!mostrar || !precioMayor || precioMayor === price) return '';
  const symbol = currency === 'USD' ? '$' : 'S/';
  return `<span class="pt-price-alt">Mayor: ${symbol} ${fmtPrice(precioMayor)}</span>`;
}

function productCardHtml(p) {
  const code = p.code || '';
  const name = p.name || '';
  const category = p.category || '';
  const price = p.price !== undefined ? p.price : 0;
  const precioMayorHtml = precioMayorLineaHtml(p, price, p.currency === 'USD' ? 'USD' : 'PEN');
  const currency = p.currency === 'USD' ? 'USD' : 'PEN';
  const escapedCode = escapeJsAttr(code);
  const isChecked = (typeof selectedStockCodes !== 'undefined' && selectedStockCodes.has(code)) ? 'checked' : '';
  const editOnclick = `openEditStock('${escapedCode}')`;
  const stock = getDisplayStock(p);
  const stockBajo = stock <= 6;
  const imgCellHtml = p.image
    ? `<div class="pc-img-thumb" onclick="event.stopPropagation();openImageView('${escapeJsAttr(p.image)}','${escapeJsAttr(name)}')"><img src="${p.image}" alt=""></div>`
    : `<div class="pc-img-thumb pc-img-empty"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`;
  return `
    <div class="product-card${isChecked ? ' selected' : ''}" data-code="${escapeHtml(code)}">
      <div class="pc-check-wrap">
        <input type="checkbox" class="row-checkbox stock-check-card" data-code="${escapeHtml(code)}" ${isChecked}
          onchange="onStockCheckToggle(this)" onclick="event.stopPropagation()">
      </div>
      ${imgCellHtml}
      <div class="pc-info">
        <div class="pc-name">${escapeHtml(name)}</div>
        <div class="pc-code">${escapeHtml(displayProductCode(code))}</div>
      </div>
      <div class="pc-meta">
        <span class="pc-qty-badge ${stockBajo ? 'stock-low' : 'stock-ok'}">${stock} und</span>
        <span class="pc-price">${fmtMoney(price, currency)}${precioMayorHtml}</span>
      </div>
      <button class="btn-icon-edit" title="Editar" onclick="event.stopPropagation();${editOnclick}">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
          stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
      </button>
    </div>
  `;
}

function productRowHtml(p) {
  const code = p.code || '';
  const name = p.name || '';
  const category = p.category || '';
  const price = p.price !== undefined ? p.price : 0;
  const precioMayorHtml = precioMayorLineaHtml(p, price, p.currency === 'USD' ? 'USD' : 'PEN');
  const currency = p.currency === 'USD' ? 'USD' : 'PEN';
  const escapedCode = escapeJsAttr(code);
  const isChecked = (typeof selectedStockCodes !== 'undefined' && selectedStockCodes.has(code)) ? 'checked' : '';
  const showCheckbox = typeof currentUserRole !== 'undefined' && currentUserRole !== 'vendedor';
  const editOnclick = `openEditStock('${escapedCode}')`;
  const imgCellHtml = p.image
    ? `<div class="pt-img-thumb"><img src="${p.image}" alt="" onclick="openImageView('${escapeJsAttr(p.image)}','${escapeJsAttr(name)}')"></div>`
    : `<div class="pt-img-thumb pt-img-empty"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></div>`;
  const stock = getDisplayStock(p);
  const stockBajo = stock <= 6;
  return `
    <tr data-code="${escapeHtml(code)}" class="${isChecked ? 'row-selected' : ''}">
      ${showCheckbox ? `<td class="col-check"><input type="checkbox" class="row-checkbox stock-check" data-code="${escapeHtml(code)}" ${isChecked} onchange="onStockCheckToggle(this)"></td>` : ''}
      <td class="col-img">${imgCellHtml}</td>
      <td class="pt-code">${escapeHtml(displayProductCode(code))}</td>
      <td class="pt-name">${escapeHtml(name)}</td>
      <td class="pt-stock"${stockBajo ? ' style="color:var(--red);font-weight:600"' : ''}>${stock}</td>
      <td class="pt-price">${fmtMoney(price, currency)}${precioMayorHtml}</td>
      <td>
        <button class="btn btn-ghost btn-sm stock-edit-btn" title="Editar"
          onclick="${editOnclick}">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor"
            stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          Editar
        </button>
      </td>
    </tr>
  `;
}

/* ── Ver / descargar imagen de producto ── */
// Cloudinary sirve la imagen normal para <img>, pero para forzar
// la descarga (en vez de que el navegador la abra en una pestaña)
// hace falta el flag fl_attachment en la URL — ver docs de Cloudinary
// "Force downloading a file with fl_attachment".
function cloudinaryDownloadUrl(url) {
  if (!url) return url;
  if (url.indexOf('/upload/') === -1) return url; // no es una URL de Cloudinary con ese patrón, se deja igual
  return url.replace('/upload/', '/upload/fl_attachment/');
}

let imageViewActual = { url: '', name: '' };

function openImageView(url, name) {
  if (!url) return;
  imageViewActual = { url, name: name || 'Imagen' };
  document.getElementById('imageViewImg').src = url;
  document.getElementById('imageViewName').textContent = name || 'Imagen';
  const dl = document.getElementById('imageViewDownload');
  dl.href = cloudinaryDownloadUrl(url);
  openModal('imageViewModal');
}

// "Compartir" (Medio/Premium) — ver aplicarCompartirImagenPorPlan()
// más abajo para el bloqueo por plan. Prioriza compartir el ARCHIVO
// de imagen (así en WhatsApp/Instagram llega la foto, no solo un
// link) usando la Web Share API nivel 2 (navigator.canShare con
// files); si el navegador no lo soporta (la mayoría de escritorio),
// cae a compartir el link; si tampoco hay Web Share (ni share ni
// share de archivos), cae a copiar el link al portapapeles.
async function compartirImagenActual() {
  const { url, name } = imageViewActual;
  if (!url) return;
  const btn = document.getElementById('imageViewShare');
  const textoOriginal = btn ? btn.textContent : '';

  try {
    if (navigator.share && navigator.canShare) {
      if (btn) { btn.disabled = true; btn.textContent = 'Preparando…'; }
      const resp = await fetch(url);
      const blob = await resp.blob();
      const ext = (blob.type && blob.type.split('/')[1]) || 'jpg';
      const file = new File([blob], `${(name || 'producto').replace(/[^a-z0-9]+/gi, '-')}.${ext}`, { type: blob.type || 'image/jpeg' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: name || 'Producto' });
        return;
      }
    }
    if (navigator.share) {
      await navigator.share({ title: name || 'Producto', url });
      return;
    }
    // Sin Web Share API (típico en desktop): copiar el link es lo
    // más parecido a "compartir" que se puede hacer sin abrir una
    // ventana de terceros.
    await navigator.clipboard.writeText(url);
    if (btn) { btn.textContent = '¡Copiado!'; setTimeout(() => { btn.textContent = textoOriginal; }, 1500); }
  } catch (err) {
    // AbortError = la persona cerró el panel de compartir sin elegir
    // nada — no es un error real, no hace falta avisar nada.
    if (err && err.name !== 'AbortError') {
      console.warn('[Compartir imagen] No se pudo compartir:', err.message);
    }
  } finally {
    if (btn) { btn.disabled = false; if (btn.textContent === 'Preparando…') btn.textContent = textoOriginal; }
  }
}

// Muestra/oculta el botón "Compartir" del visor de imagen según el
// plan (Básico: solo Descargar, que ya funcionaba para todos — ver
// cloudinaryDownloadUrl arriba). Se llama una vez por pantalla, en
// Stock.init() y en Catalogo.init(), porque el modal de imagen es el
// MISMO HTML/ids compartido entre ambas vistas (una sola vez montado
// a la vez — ver router.js).
function aplicarCompartirImagenPorPlan() {
  const btn = document.getElementById('imageViewShare');
  if (!btn) return;
  const puede = (typeof limitePlan === 'function') ? limitePlan('compartirImagen') : false;
  btn.style.display = puede ? '' : 'none';
}

/* Vuelve a armar la página visible (0..stockRenderLimit) a partir
   del catálogo ya filtrado. Se usa tanto al cargar/cambiar datos
   como al tipear en el buscador y al llegar al final del scroll. */
function renderStockPage() {
  const list  = document.getElementById('productList');
  const tbody = document.getElementById('productTableBody');
  if (!list && !tbody) return; // la vista de Stock no está montada ahora mismo

  const filtered = getFilteredProducts();
  const page = filtered.slice(0, stockRenderLimit);

  if (list) {
    list.innerHTML = page.map(productCardHtml).join('');
    if (currentUserRole !== 'vendedor') {
      list.querySelectorAll('.product-card').forEach(card => wireSelectableRow(card, stockSelection, onStockCheckToggle));
    }
  }
  if (tbody) {
    tbody.innerHTML = page.map(productRowHtml).join('');
    if (currentUserRole !== 'vendedor') {
      tbody.querySelectorAll('tr[data-code]').forEach(row => wireSelectableRow(row, stockSelection, onStockCheckToggle));
    }
  }

  const emptyState = document.getElementById('emptyState');
  if (emptyState) emptyState.style.display = filtered.length === 0 ? 'block' : 'none';

  const footerInfo = document.getElementById('footerInfo');
  if (footerInfo) {
    footerInfo.textContent = filtered.length > page.length
      ? `Mostrando ${page.length} de ${filtered.length} productos — bajá para ver más`
      : `${filtered.length} producto${filtered.length !== 1 ? 's' : ''}`;
  }

  setupStockInfiniteScroll(filtered.length);
  if (typeof updateBulkStock === 'function') updateBulkStock();
}

/* Observa un "centinela" al final de la lista/tabla; cuando entra
   en pantalla, se cargan 20 productos más (sin volver a pedirle
   nada a Firebase — ya están todos en productsCache). */
function setupStockInfiniteScroll(totalFiltered) {
  if (stockScrollObserver) { stockScrollObserver.disconnect(); stockScrollObserver = null; }
  if (stockRenderLimit >= totalFiltered) return; // ya está todo cargado

  // Ambas vistas (cards para mobile, tabla para desktop) están
  // siempre en el DOM — CSS solo oculta la que no corresponde según
  // el ancho de pantalla. Si se elegía la tabla sin fijarse si está
  // oculta, el centinela quedaba dentro de un elemento display:none
  // y el IntersectionObserver nunca disparaba en modo teléfono, por
  // lo que el scroll infinito se quedaba trabado en los primeros 20.
  const tbody = document.getElementById('productTableBody');
  const list  = document.getElementById('productList');
  const isVisible = (el) => !!el && el.offsetParent !== null;
  const anchor = isVisible(tbody) ? tbody : (isVisible(list) ? list : (tbody || list));
  if (!anchor) return;

  const sentinel = document.createElement('div');
  sentinel.id = 'stockScrollSentinel';
  sentinel.style.height = '1px';
  if (anchor.tagName === 'TBODY') {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.appendChild(sentinel);
    tr.appendChild(td);
    anchor.appendChild(tr);
  } else {
    anchor.appendChild(sentinel);
  }

  stockScrollObserver = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) {
      stockRenderLimit += STOCK_PAGE_SIZE;
      renderStockPage();
    }
  }, { root: anchor.closest('main.main'), rootMargin: '400px' });
  stockScrollObserver.observe(sentinel);
}

/* ── Render: lista de cards ── */
function renderProducts() {
  stockRenderLimit = STOCK_PAGE_SIZE; // el catálogo cambió (Firebase) — se vuelve a empezar desde la primera página
  renderStockPage();
  updateStats();
}

/* ── Stats ── */
function updateStats() {
  const statTotal = document.getElementById('statTotal');
  if (!statTotal) return; // la vista de Stock no está montada ahora mismo
  // Igual que la lista (ver getWarehouseScopedProducts): parada en un
  // almacén puntual, estos contadores hablan de ESE almacén, no del
  // catálogo entero — si no, el número de arriba no coincidiría con
  // lo que se ve en la tabla debajo.
  const scoped = getWarehouseScopedProducts();
  const total = scoped.length;
  const low   = scoped.filter(p => getDisplayStock(p) <= 6).length;
  // Los productos pueden estar en soles o en dólares — para sumarlos
  // en un solo total hay que llevarlos todos a la misma moneda (soles)
  // usando la tasa de cambio de la tienda. Sin tasa configurada, los
  // productos en dólares simplemente no aportan al total (mejor eso
  // que sumar números de monedas distintas como si fueran iguales).
  const value = scoped.reduce((sum, p) => {
    const price = Number(p.price) || 0;
    const enSoles = p.currency === 'USD'
      ? (currentTasaCambio > 0 ? price * currentTasaCambio : 0)
      : price;
    return sum + enSoles * getDisplayStock(p);
  }, 0);
  document.getElementById('statTotal').textContent = total;
  document.getElementById('statLow').textContent   = low;
  document.getElementById('statValue').textContent = `S/ ${value.toLocaleString(formatoNumeroActivo(), { maximumFractionDigits: 0 })}`;
}

/* ── Firebase listener ── */
// Espera a que auth-guard.js confirme la sesión antes de conectarse
// a Firebase — evita una condición de carrera con las Reglas que
// exigen auth != null.
// El súper-admin no pertenece a ninguna tienda (currentTiendaId
// queda null a propósito, ver auth-guard.js) — sin este chequeo,
// scopedRef() tronaba apenas cargaba la página, aunque el
// súper-admin nunca llegara a abrir Stock: este script se carga
// igual en toda la app, no solo cuando se navega a esta sección.
authReady.then(() => {
  // Envuelto en try/catch a propósito: si por una carrera de Firebase
  // Auth (común al abrir con doble clic, file://) currentTiendaId
  // todavía no quedó puesto cuando esto corre, que quede como un
  // aviso silencioso en consola y no como un error sin capturar.
  try {
    if (!currentTiendaId) return;
    watchProducts(list => {
      productsCache = list.sort((a, b) => (a.code || '').localeCompare(b.code || ''));
      renderProducts();
      if (typeof repararDistribucionAlmacenesFaltante === 'function') {
        repararDistribucionAlmacenesFaltante(productsCache);
      }
    });
    // Cambios de almacenes (agregar/eliminar/renombrar) hechos desde
    // Configuración — en esta misma pestaña o en otra — refrescan las
    // pestañas de Stock solas, sin recargar (ver renderAlmacenesTabs()
    // y watchAlmacenesConfig() en firebase.js).
    if (typeof watchAlmacenesConfig === 'function') {
      watchAlmacenesConfig(renderAlmacenesTabs);
    }
  } catch (err) {
    console.warn('[Stock] No se pudo iniciar la escucha de productos:', err.message);
  }
});

/* ── Modales ── */
// URL de Cloudinary que quedó de la última imagen subida en cada
// modal (add/edit). Se guarda en memoria, no en el <input>, porque
// un <input type=file> no puede prellenarse con la imagen que ya
// tenía el producto al editar — si el usuario no toca el selector,
// se reusa la URL que ya estaba guardada en el producto.
let pendingImageData = { add: '', edit: '' };

// Comprime la imagen elegida (ancho máx. 480px, JPEG) y la sube a
// Cloudinary — ver cloudinary.js para la configuración y por qué se
// eligió Cloudinary en vez de guardar la foto directo en Firebase.
// Solo el resultado (una URL de texto) se guarda en el producto.
function previewProductImage(input, previewId, target) {
  const file = input.files && input.files[0];
  if (!file) return;
  const preview = document.getElementById(previewId);
  if (preview) preview.innerHTML = '<span style="font-size:10.5px;color:var(--text-3);text-align:center;padding:0 4px">Subiendo…</span>';

  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const maxW = 480;
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(blob => {
        if (!blob) {
          resetImagePreview(previewId);
          alert('No se pudo procesar la imagen. Intenta con otro archivo.');
          return;
        }
        const folder = (typeof currentTiendaId !== 'undefined' && currentTiendaId)
          ? `tiendas/${currentTiendaId}/productos`
          : 'productos';
        uploadImageToCloudinary(blob, folder)
          .then(url => {
            pendingImageData[target] = url;
            if (preview) preview.innerHTML = `<img src="${url}" alt="Vista previa">`;
          })
          .catch(err => {
            resetImagePreview(previewId);
            alert('No se pudo subir la imagen: ' + err.message);
          });
      }, 'image/jpeg', 0.72);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function resetImagePreview(previewId) {
  const preview = document.getElementById(previewId);
  if (preview) {
    preview.innerHTML = `<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`;
  }
}

// Moneda principal (Configuración → Moneda y formato) — se carga
// una vez en Stock.init() y se cachea acá, mismo patrón que
// umbralStock/tasaCambio de este archivo. 'PEN' es el default de
// siempre (el que ya traía el <select> del HTML) si la tienda nunca
// lo configuró.
let monedaPrincipalCache = 'PEN';

function openAddModal() {
  pendingImageData.add = '';
  resetImagePreview('addImagePreview');
  const currencyEl = document.getElementById('addCurrency');
  if (currencyEl) currencyEl.value = monedaPrincipalCache;
  openModal('addModal');
}

function openModal(id) {
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}
function outsideClose(e, id) {
  if (e.target === document.getElementById(id)) closeModal(id);
}

/* ── Editar ── */
let editingCode = '';
// Almacén que estaba activo cuando se abrió el modal: '' = "Todos los
// almacenes" (se edita el stock total), o un id de almacén puntual
// (se edita SOLO ese almacén, ver saveStock).
let editingStockWarehouse = '';

function openEditStock(code) {
  const p = productsCache.find(x => x.code === code) || {};
  const name  = p.name || '';
  const stock = getDisplayStock(p);
  const price = p.price !== undefined ? p.price : 0;
  const desc  = p.desc || '';
  editingCode = code; // clave real de Firebase (con "⁄" si el código lleva "/")
  editingStockWarehouse = currentWarehouse;
  const stockLabel = document.getElementById('editStockLabel');
  if (stockLabel) {
    stockLabel.textContent = currentWarehouse
      ? `Cantidad — ${WAREHOUSE_LABELS[currentWarehouse] || ''}`
      : 'Cantidad (todos los almacenes)';
  }
  document.getElementById('editModalTitle').textContent = name;
  // Se muestra siempre con "/" real, nunca con "⁄": si no se
  // convierte aquí, el campo editable queda con el mismo caracter
  // que el usuario ya considera "roto", y al volver a escribir "/"
  // el resultado normalizado se ve idéntico a lo que había antes.
  document.getElementById('editModalCode').textContent  = displayProductCode(code);
  document.getElementById('editCode').value  = displayProductCode(code);
  document.getElementById('editName').value  = name;
  document.getElementById('editStock').value = stock;
  document.getElementById('editPrice').value = price;
  document.getElementById('editCosto').value = p.costo !== undefined ? p.costo : '';
  document.getElementById('editPrecioMayor').value = p.precioMayor !== undefined ? p.precioMayor : '';
  document.getElementById('editCurrency').value = p.currency === 'USD' ? 'USD' : 'PEN';
  const descEl = document.getElementById('editDesc');
  if (descEl) descEl.value = desc;
  pendingImageData.edit = '';
  const preview = document.getElementById('editImagePreview');
  if (p.image && preview) {
    preview.innerHTML = `<img src="${p.image}" alt="Vista previa">`;
  } else {
    resetImagePreview('editImagePreview');
  }
  openModal('editModal');
}

function saveStock() {
  const name  = document.getElementById('editName').value.trim();
  const price = parseFloat(document.getElementById('editPrice').value) || 0;
  // Costo y Precio mayor: campos opcionales según el plan (ver
  // aplicarCamposPrecioPorPlan). Si el input está oculto/vacío, se
  // guarda 0 en vez de dejarlo fuera — así un producto nunca queda
  // con el campo "a medias" (undefined) si la tienda cambia de plan
  // más adelante y el campo se vuelve a mostrar.
  const costo = parseFloat(document.getElementById('editCosto').value) || 0;
  const precioMayor = parseFloat(document.getElementById('editPrecioMayor').value) || 0;
  const currency = document.getElementById('editCurrency').value === 'USD' ? 'USD' : 'PEN';
  const descEl = document.getElementById('editDesc');
  const desc  = descEl ? descEl.value.trim() : '';
  // El campo Código pasa por el mismo normalizeProductCode que "Agregar",
  // así que también acepta "/" (se guarda como ⁄, la clave de Firebase
  // real no admite "/" literal, pero se ve igual en pantalla).
  const newCode = normalizeProductCode(document.getElementById('editCode').value);

  if (!name) return alert('El nombre no puede estar vacío.');
  if (!newCode) return alert('El código no puede estar vacío.');

  const stockInput = parseInt(document.getElementById('editStock').value, 10);
  if (isNaN(stockInput) || stockInput < 0) return alert('La cantidad no puede estar vacía ni ser negativa.');

  const codeChanged = newCode !== editingCode;
  if (codeChanged && productsCache.some(p => p.code === newCode)) {
    return alert(`Ya existe un producto con el código ${newCode}.`);
  }

  const existing = productsCache.find(p => p.code === editingCode) || {};
  const finalCode = codeChanged ? newCode : editingCode;
  // Si no se eligió una imagen nueva en este modal, se conserva la
  // que ya tenía el producto (pendingImageData.edit solo se llena
  // cuando el usuario elige un archivo).
  const image = pendingImageData.edit || existing.image || '';
  // Si el modal se abrió parado en "Todos los almacenes", la Cantidad
  // edita el stock TOTAL directo (con la concurrencia optimista de
  // saveProduct, ver comentario ahí). Si se abrió parado en un
  // almacén puntual, la Cantidad edita SOLO ese almacén — el total se
  // ajusta aparte, después, con updateWarehouseStock (mismo mecanismo
  // que usa el modal dedicado "editar cantidad de almacén"), así que
  // acá NO se manda "stock" para no pisarlo con un valor viejo.
  const editingSpecificWarehouse = !!editingStockWarehouse;

  const payload = { name, desc, price, costo, precioMayor, currency, image, category: existing.category || 'general' };
  if (!editingSpecificWarehouse) payload.stock = stockInput;

  const doSave = () => saveProduct(finalCode, payload, existing.stock);

  const chain = codeChanged
    ? renameProductCode(editingCode, newCode).then(doSave)
    : doSave();

  chain
    .then(() => {
      if (editingSpecificWarehouse) {
        const before = (existing.almacenes && existing.almacenes[editingStockWarehouse]) || 0;
        return updateWarehouseStock(finalCode, editingStockWarehouse, stockInput, before);
      }
    })
    .then(() => {
      editingCode = finalCode;
      pendingImageData.edit = '';
      closeModal('editModal');
    })
    .catch(err => alert('Error al guardar: ' + err.message));
}

function deleteCurrentProduct() {
  if (!editingCode) return;
  if (!confirm(`¿Eliminar el producto ${editingCode}? Esta acción no se puede deshacer.`)) return;
  deleteProduct(editingCode)
    .then(() => closeModal('editModal'))
    .catch(err => alert('No se pudo eliminar el producto: ' + err.message));
}

/* ── Editar cantidad de UN almacén ── */
let editingWarehouseCode = '';
let editingWarehouseQtyBefore = 0;

function openEditWarehouseQty(code, name, qty) {
  editingWarehouseCode = code;
  editingWarehouseQtyBefore = qty;
  document.getElementById('whQtyModalTitle').textContent = name;
  document.getElementById('whQtyModalWarehouse').textContent = WAREHOUSE_LABELS[currentWarehouse] || '';
  document.getElementById('whQtyInput').value = qty;
  openModal('warehouseQtyModal');
}

function saveWarehouseQty() {
  const newQty = parseInt(document.getElementById('whQtyInput').value) || 0;
  updateWarehouseStock(editingWarehouseCode, currentWarehouse, newQty, editingWarehouseQtyBefore)
    .then(() => closeModal('warehouseQtyModal'))
    .catch(err => alert('Error al guardar: ' + err.message));
}

/* ── Importar / exportar cantidad de UN almacén ── */
async function loadXlsxLib() {
  await new Promise((resolve, reject) => {
    if (window.XLSX) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

function openWarehouseImport() {
  if (!currentWarehouse) return;
  const title = document.getElementById('whImportModalTitle');
  if (title) title.textContent = `Importar cantidad — ${WAREHOUSE_LABELS[currentWarehouse]}`;
  const fi = document.getElementById('warehouseImportFile');
  if (fi) fi.value = '';
  const progress = document.getElementById('warehouseImportProgress');
  if (progress) progress.style.display = 'none';
  openModal('warehouseImportModal');
}

async function downloadWarehouseTemplate() {
  await loadXlsxLib();
  const data = [['Codigo', 'Cantidad'], ['PRD-001', 10]];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 12 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Datos');
  XLSX.writeFile(wb, `plantilla-cantidad-${currentWarehouse || 'almacen'}.xlsx`);
}

async function onWarehouseImportFile(input) {
  const whId = currentWarehouse;
  const file = input.files[0];
  if (!file || !whId) return;
  await loadXlsxLib();

  const progress = document.getElementById('warehouseImportProgress');
  if (progress) { progress.style.display = ''; progress.textContent = 'Leyendo archivo…'; }

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      const dataRows = rows.filter((r, i) => i > 0 && String(r[0] || '').trim().length > 0);

      if (dataRows.length === 0) {
        if (progress) progress.textContent = 'El archivo no tiene registros válidos.';
        input.value = '';
        return;
      }

      let ok = 0, notFound = 0, failed = 0;
      const notFoundCodes = [];
      for (let i = 0; i < dataRows.length; i++) {
        const r = dataRows[i];
        if (progress) progress.textContent = `Procesando ${i + 1} de ${dataRows.length}…`;
        const code = normalizeProductCode(String(r[0] || ''));
        const qty = parseInt(r[1]) || 0;
        const exists = productsCache.some(p => p.code === code);
        if (!exists) { notFound++; notFoundCodes.push(code); continue; }
        try {
          await addWarehouseStock(code, whId, qty);
          ok++;
        } catch (err) {
          failed++;
        }
      }

      let msg = `${ok} producto(s) actualizado(s) en ${WAREHOUSE_LABELS[whId]}.`;
      if (notFound > 0) msg += ` ${notFound} código(s) no encontrado(s) (${notFoundCodes.slice(0, 5).join(', ')}${notFoundCodes.length > 5 ? '…' : ''}) — este modo solo actualiza productos que ya existen.`;
      if (failed > 0) msg += ` ${failed} con error.`;

      if (progress) progress.textContent = msg;
      input.value = '';
      if (typeof refreshProductsNow === 'function') {
        refreshProductsNow().catch(err => console.error('[Importar almacén] No se pudo refrescar el stock:', err));
      }
    } catch (err) {
      if (progress) progress.textContent = 'No se pudo leer el archivo: ' + err.message;
      input.value = '';
    }
  };
  reader.readAsBinaryString(file);
}

async function exportWarehouseStock() {
  const whId = currentWarehouse;
  if (!whId) return;
  const label = WAREHOUSE_LABELS[whId] || whId;
  const rows = getFilteredProducts();

  await loadXlsxLib();

  const data = [
    ['Código', 'Nombre', 'Cantidad'],
    ...rows.map(p => [displayProductCode(p.code), sanitizeForExcel(p.name), getDisplayStock(p)])
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{ wch: 12 }, { wch: 34 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, label);
  const today = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `stock-${whId}-${today}.xlsx`);
}

/* ── Agregar ── */
function addProduct() {
  const name  = document.getElementById('addName').value.trim();
  const code  = normalizeProductCode(document.getElementById('addCode').value);
  const stock = parseFloat(document.getElementById('addStock').value) || 0;
  const price = parseFloat(document.getElementById('addPrice').value) || 0;
  const costo = parseFloat(document.getElementById('addCosto').value) || 0;
  const precioMayor = parseFloat(document.getElementById('addPrecioMayor').value) || 0;
  const currency = document.getElementById('addCurrency').value === 'USD' ? 'USD' : 'PEN';
  const descEl = document.getElementById('addDesc');
  const desc  = descEl ? descEl.value.trim() : '';
  const image = pendingImageData.add || '';

  if (!name || !code) return alert('Completa nombre y código.');
  if (productsCache.some(p => p.code === code))
    return alert(`Ya existe un producto con el código ${code}.`);

  // El producto nuevo queda asignado al almacén que se esté viendo
  // en ese momento (pestaña activa) — así, si estás parado en
  // "Almacén 2" y agregás uno, se queda ahí (ver belongsToWarehouse/
  // getWarehouseScopedProducts más arriba), en vez de ir siempre a
  // Almacén 1 pase lo que pase. Parado en "Todos los almacenes"
  // (currentWarehouse === ''), no hay una pestaña puntual activa,
  // así que se usa Almacén 1 por defecto, igual que antes.
  const targetWarehouse = currentWarehouse || 'alm1';

  saveProduct(code, { name, desc, price, costo, precioMayor, stock, currency, image, almacenes: { [targetWarehouse]: stock }, category: 'general' }, undefined, true)
    .then(() => {
      closeModal('addModal');
      ['addName','addCode','addDesc','addStock','addPrice','addCosto','addPrecioMayor'].forEach(id => {
        document.getElementById(id).value = '';
      });
      document.getElementById('addCurrency').value = 'PEN';
      pendingImageData.add = '';
      resetImagePreview('addImagePreview');
    })
    .catch(err => alert('Error al registrar: ' + err.message));
}

/* ── Filtro búsqueda ── */
function filterStock() {
  stockRenderLimit = STOCK_PAGE_SIZE; // nueva búsqueda: se vuelve a la primera página de resultados
  renderStockPage();
}

/* ── Teclado ── */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open')
      .forEach(m => closeModal(m.id));
  }
  // Enter en un campo de texto del modal de Editar o Agregar guarda
  // igual que si se hiciera clic en el botón — antes no pasaba nada
  // porque estos formularios no son un <form> real, así que Enter no
  // tenía ninguna acción por defecto. Se excluyen los <textarea> para
  // no interceptar el Enter que ahí sirve para bajar de línea.
  if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
    const editModal = document.getElementById('editModal');
    const addModal  = document.getElementById('addModal');
    if (editModal && editModal.classList.contains('open') && editModal.contains(e.target)) {
      e.preventDefault();
      saveStock();
    } else if (addModal && addModal.classList.contains('open') && addModal.contains(e.target)) {
      e.preventDefault();
      addProduct();
    }
  }
});

/* ══════════════════════════════════════
   MODO SELECCIÓN, EXPORTAR Y ELIMINAR MASIVO
  ══════════════════════════════════════
   Los checkboxes están ocultos por defecto (ver stock-card.css /
   import.css) y solo aparecen en modo selección, activado desde
   el botón "Seleccionar" o con pulsación larga sobre una fila o
   tarjeta (lógica compartida en selection.js). */

let selectedStockCodes = new Set();

const stockSelection = createSelectionMode({
  containers: ['.product-table', '#productList', '.topbar-actions'],
  buttonId: 'btnSelectMode',
  labelId: 'selectModeLabel',
  onExit: () => {
    selectedStockCodes.clear();
    document.querySelectorAll('.row-checkbox').forEach(cb => { cb.checked = false; });
    const master = document.getElementById('checkAllStock');
    if (master) master.checked = false;
    updateBulkStock();
  }
});

function setSelectionMode(on) { stockSelection.set(on); }
function toggleSelectionMode() { stockSelection.toggle(); }

// Un mismo producto puede tener checkbox en la tabla (desktop) y en la
// tarjeta (mobile) a la vez; al marcar uno se sincroniza el otro.
function onStockCheckToggle(cb) {
  const code = cb.dataset.code;
  const checked = cb.checked;
  if (checked) selectedStockCodes.add(code); else selectedStockCodes.delete(code);
  document.querySelectorAll(`.row-checkbox[data-code="${CSS.escape(code)}"]`).forEach(other => {
    other.checked = checked;
  });
  updateBulkStock();
}

function toggleAllStock(master) {
  const filtered = getFilteredProducts();
  if (master.checked) {
    filtered.forEach(p => selectedStockCodes.add(p.code));
  } else {
    filtered.forEach(p => selectedStockCodes.delete(p.code));
  }
  renderStockPage();
}

// Botón "Seleccionar todo" del bulk-bar (modo selección ya activo).
function selectAllStock() {
  getFilteredProducts().forEach(p => selectedStockCodes.add(p.code));
  const master = document.getElementById('checkAllStock');
  if (master) master.checked = true;
  renderStockPage();
}

function updateBulkStock() {
  document.querySelectorAll('#productTableBody tr[data-code]').forEach(row => {
    row.classList.toggle('row-selected', selectedStockCodes.has(row.dataset.code));
  });
  document.querySelectorAll('.product-card[data-code]').forEach(card => {
    card.classList.toggle('selected', selectedStockCodes.has(card.dataset.code));
  });

  const count = selectedStockCodes.size;
  const bar   = document.getElementById('bulkBarStock');
  if (bar) bar.classList.toggle('visible', count > 0);
  const countEl = document.getElementById('bulkCountStock');
  if (countEl) countEl.textContent = `${count} producto${count !== 1 ? 's' : ''} seleccionado${count !== 1 ? 's' : ''}`;

  // Actualizar label exportar
  const total    = productsCache.length;
  const filtered = getFilteredProducts().length;
  const lbl = document.getElementById('exportStockLabel');
  if (lbl) {
    if (count > 0)             lbl.textContent = `Exportar (${count} sel.)`;
    else if (filtered < total) lbl.textContent = `Exportar filtrado (${filtered})`;
    else                       lbl.textContent = `Exportar todo (${total})`;
  }
}

/* ── Eliminar seleccionados / todo ── */
function deleteSelectedStock() {
  const count = selectedStockCodes.size;
  if (count === 0) return;
  if (!confirm(`¿Eliminar ${count} producto${count !== 1 ? 's' : ''}? Esta acción no se puede deshacer.`)) return;
  // allSettled en vez de all: si un código tiene un caracter que
  // Firebase rechaza (dato viejo corrupto), ese producto falla pero
  // NO bloquea el borrado del resto de la selección.
  Promise.allSettled([...selectedStockCodes].map(code => deleteProduct(code).then(() => ({ code }))))
    .then(results => {
      setSelectionMode(false);
      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length > 0) {
        alert(`${count - failed.length} producto(s) eliminado(s). ${failed.length} no se pudo(pudieron) eliminar (código con caracteres inválidos). Edítalo(s) desde el modal para corregir el código y volver a intentar.`);
      }
    });
}

function deleteAllStock() {
  const total = productsCache.length;
  if (total === 0) return;
  if (!confirm(`¿Eliminar TODOS los ${total} productos? Esta acción no se puede deshacer.`)) return;
  if (!confirm('Segunda confirmación: ¿estás seguro? Se borrarán todos los productos del inventario.')) return;
  Promise.allSettled(productsCache.map(p => deleteProduct(p.code)))
    .then(results => {
      setSelectionMode(false);
      const failed = results.filter(r => r.status === 'rejected').length;
      if (failed > 0) {
        alert(`${total - failed} producto(s) eliminado(s). ${failed} no se pudo(pudieron) eliminar (código con caracteres inválidos).`);
      }
    });
}

/* ── Exportar flexible ── */
async function exportStock() {
  let rows; let filename;
  const today = new Date().toISOString().slice(0, 10);

  if (selectedStockCodes.size > 0) {
    rows = productsCache.filter(p => selectedStockCodes.has(p.code));
    filename = `stock-seleccionado-${today}.xlsx`;
  } else {
    const filteredProducts = getFilteredProducts();
    const allVisible = filteredProducts.length === productsCache.length;
    // Solo se pregunta cuando el botón exporta TODO el inventario
    // (sin filtro ni selección activa) — exportar una selección o
    // un filtro ya es una acción intencional y puntual, así que no
    // hace falta confirmarla también.
    if (allVisible && !confirm(`¿Exportar los ${filteredProducts.length} productos a Excel?`)) return;
    rows = filteredProducts;
    filename = allVisible
      ? `stock-completo-${today}.xlsx`
      : `stock-filtrado-${today}.xlsx`;
  }

  // Lazy load SheetJS
  await new Promise((resolve, reject) => {
    if (window.XLSX) { resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });

  // Costo y Precio mayor son columnas del plan (Medio/Premium) — solo
  // se agregan si esta tienda las tiene habilitadas, para no mostrar
  // columnas vacías a una tienda Básica que nunca cargó esos campos.
  const conCosto = (typeof limitePlan === 'function') && limitePlan('campoCosto');
  const conMayor = (typeof limitePlan === 'function') && limitePlan('campoPrecioMayor');

  const encabezado = ['Código', 'Nombre', 'Descripción', 'Cantidad'];
  if (conCosto) encabezado.push('Costo');
  encabezado.push(conMayor ? 'Precio menor' : 'Precio');
  if (conMayor) encabezado.push('Precio mayor');

  const data = [
    encabezado,
    ...rows.map(p => {
      const fila = [displayProductCode(p.code), sanitizeForExcel(p.name), sanitizeForExcel(p.desc || ''), p.stock];
      if (conCosto) fila.push(Number(p.costo) || 0);
      fila.push(p.price);
      if (conMayor) fila.push(Number(p.precioMayor) || 0);
      return fila;
    })
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = encabezado.map(() => ({ wch: 14 }));
  ws['!cols'][1] = { wch: 34 };
  ws['!cols'][2] = { wch: 28 };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Stock');
  XLSX.writeFile(wb, filename);
}


// ── Restricciones de rol "vendedor" ─────────────────────
// Antes vivía en un <script> aparte dentro de stock.html. En la
// SPA se movió aquí para poder llamarla desde Stock.init() cada
// vez que se muestra esta vista.
function applyStockRoleRestrictions() {
  if (currentUserRole !== 'vendedor') return;

  const statsRow = document.getElementById('stockStatsRow');
  if (statsRow) statsRow.style.display = 'none';

  const btnImport = document.querySelector('.btn-import');
  if (btnImport) btnImport.style.display = 'none';

  const btnExport = document.getElementById('btnExportStock');
  if (btnExport) btnExport.style.display = 'none';

  const btnSelect = document.getElementById('btnSelectMode');
  if (btnSelect) btnSelect.style.display = 'none';

  const btnAdd = document.querySelector('.btn-new-item');
  if (btnAdd) btnAdd.style.display = 'none';

  // Este estilo se agregaba una sola vez por página en el modelo
  // viejo. En la SPA, si ya existe (de una visita anterior a esta
  // vista), no hace falta agregarlo de nuevo.
  if (!document.getElementById('stockRoleStyle')) {
    const style = document.createElement('style');
    style.id = 'stockRoleStyle';
    // Para vendedor, productRowHtml() nunca agrega la celda de
    // checkbox en el <tbody>. Si dejamos visible el <th class="col-check">
    // del encabezado, la tabla queda con una columna de más y todo el
    // contenido se desplaza una posición (bug reportado). Se oculta
    // también el encabezado para que headers y celdas vuelvan a alinear.
    style.textContent = '.btn-icon-edit, .stock-edit-btn, .product-table .col-check { display: none !important; }';
    document.head.appendChild(style);
  }
}

// ── Punto de entrada que llama el Router cada vez que se
//    muestra esta vista (instantáneo: usa productsCache ya cargado) ──
// Aplica los nombres reales de los almacenes y, según el plan de la
// tienda (ver plan-limits.js) y cuáles estén activos (Configuración),
// genera las pestañas de alm2 en adelante. Se llama una vez en
// Stock.init() — si la persona nunca abre Configuración, igual ve sus
// almacenes con el nombre que ya tenían guardado (o el de por defecto
// la primerísima vez).
function aplicarConfigAlmacenes() {
  if (typeof getAlmacenesConfig !== 'function') return;
  getAlmacenesConfig().then(renderAlmacenesTabs).catch(() => {}); // valores por defecto (ya puestos arriba) si falla
}

// Reconstruye las pestañas de almacén a partir de una config ya
// cargada ({ nombres, activos }). Separada de aplicarConfigAlmacenes()
// para poder llamarla también desde watchAlmacenesConfig() (más abajo)
// cada vez que la config cambia en tiempo real — incluso si el cambio
// vino de otra pestaña del navegador o de otra persona con sesión en
// la misma tienda. Es segura de llamar aunque la vista de Stock no
// esté montada todavía (el guard de "contenedor" corta ahí).
function renderAlmacenesTabs({ nombres, activos }) {
  const maxAlmacenes = (typeof limitePlan === 'function') ? limitePlan('maxAlmacenes') : 3;
  WAREHOUSE_LABELS = { ...nombres };

  const contenedor = document.getElementById('warehouseTabs');
  if (!contenedor) return;

  // Alm1 y "Todos los almacenes" son fijos en el HTML (siempre
  // existen). El resto (alm2..alm6) se reconstruye cada vez, así no
  // hay que dejar 6 botones ocultos precargados en la vista.
  contenedor.querySelectorAll('.warehouse-tab[data-wh]:not([data-wh=""]):not([data-wh="alm1"])')
    .forEach(btn => btn.remove());

  const alm1Btn = contenedor.querySelector('.warehouse-tab[data-wh="alm1"]');
  if (alm1Btn) alm1Btn.textContent = WAREHOUSE_LABELS.alm1 || alm1Btn.textContent;

  let visibleActual = currentWarehouse === '' || currentWarehouse === 'alm1';
  for (let n = 2; n <= maxAlmacenes; n++) {
    const wh = 'alm' + n;
    if (!activos[wh]) continue;
    const btn = document.createElement('button');
    btn.className = 'warehouse-tab';
    btn.dataset.wh = wh;
    btn.textContent = WAREHOUSE_LABELS[wh] || ('Almacén ' + n);
    btn.onclick = () => switchWarehouse(wh);
    if (currentWarehouse === wh) { btn.classList.add('active'); visibleActual = true; }
    contenedor.appendChild(btn);
  }

  // Si quedó viendo un almacén que se acaba de ocultar (ej. bajó de
  // plan, o lo desactivaron desde Configuración — en esta misma
  // pestaña o en otra), no se queda en un filtro fantasma — vuelve a
  // "Todos los almacenes".
  if (!visibleActual) {
    switchWarehouse('');
  } else {
    renderProducts();
  }
}

// Muestra/oculta los campos de Costo y Precio mayor en los
// modales de Agregar/Editar producto según el plan de la tienda
// (ver plan-limits.js). Se llama una sola vez en Stock.init() —
// los modales son el mismo DOM reutilizado en cada apertura, así
// que no hace falta repetirlo cada vez que se abren.
function aplicarCamposPrecioPorPlan() {
  const mostrarCosto = (typeof limitePlan === 'function') ? limitePlan('campoCosto') : false;
  const mostrarMayor = (typeof limitePlan === 'function') ? limitePlan('campoPrecioMayor') : false;

  ['editCostoGroup', 'addCostoGroup'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = mostrarCosto ? '' : 'none';
  });
  ['editPrecioMayorGroup', 'addPrecioMayorGroup'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = mostrarMayor ? '' : 'none';
  });

  // En plan Premium, el campo "Precio" de siempre pasa a representar
  // el precio menor (el mayor es el nuevo campo aparte) — se avisa
  // con la etiqueta, sin tocar el id ni dónde se guarda el dato, así
  // que nada del resto del sistema (tarjeta, tabla, Dashboard) que ya
  // usa p.price necesita cambiar.
  const etiqueta = mostrarMayor ? 'Precio menor' : 'Precio';
  const editLabel = document.getElementById('editPriceLabel');
  const addLabel = document.getElementById('addPriceLabel');
  if (editLabel) editLabel.textContent = etiqueta;
  if (addLabel) addLabel.textContent = etiqueta;
}

window.Stock = {
  init() {
    // Al reabrir la vista (o abrirla por primera vez) siempre arranca
    // en "Todos los almacenes" — evita quedar en un almacén filtrado
    // sin que se note al volver de otra pantalla. switchWarehouse ya
    // llama a renderProducts() internamente.
    switchWarehouse('');
    applyStockRoleRestrictions();
    aplicarConfigAlmacenes();
    aplicarCamposPrecioPorPlan();
    aplicarCompartirImagenPorPlan();

    // Tasa de cambio de la tienda (Configuración) — se pide aparte
    // porque products/clients ya tienen sus propios watchers, y esto
    // es una lectura puntual que casi nunca cambia mientras se usa
    // Stock. Si llega después del primer render, se repinta una vez.
    if (typeof getTiendaConfig === 'function') {
      getTiendaConfig().then(cfg => {
        const nueva = Number(cfg && cfg.tasaCambio) || 0;
        if (nueva !== currentTasaCambio) {
          currentTasaCambio = nueva;
          renderProducts();
        }
        // Moneda principal — solo decide qué opción viene
        // preseleccionada la próxima vez que se abra "Agregar
        // producto" (openAddModal), no repinta nada acá.
        if (cfg && cfg.monedaPrincipal) monedaPrincipalCache = cfg.monedaPrincipal;
      }).catch(() => {});
    }
  }
};