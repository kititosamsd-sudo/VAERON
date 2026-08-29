/* ══════════════════════════════════════
   catalogo-logic.js — Galería de imágenes
   ══════════════════════════════════════
   Antes esta grilla vivía mezclada con Stock (una columna "Img" en
   la tabla). Ahora es su propia pantalla: Stock se queda con todo
   MENOS las imágenes (código, nombre, precio), y acá solo viven las
   fotos, en una grilla de tarjetas (ver .catalogo-grid en base.css)
   con filtro por completitud de foto, orden y vista grilla/lista.

   Mantiene su propia copia de productsCache (catalogoProductsCache)
   en vez de reusar la de stock.js — mismo patrón que dashboard-logic.js
   con latestProducts: cada pantalla de la SPA es autocontenida y
   watchProducts() ya cachea internamente, así que suscribirse de
   nuevo acá no duplica lecturas a Firebase.

   fmtMoney(), getDisplayStock(), displayProductCode(), escapeHtml()
   y escapeJsAttr() vienen de stock.js/firebase.js — ya están
   cargados globalmente en la SPA (ver <script> en app.html), así
   que no hace falta reimplementarlos acá. */

let catalogoProductsCache = [];
let catalogoFilter = 'all';        // 'all' | 'withImage' | 'noImage'
let catalogoSort = 'recent';       // 'recent' | 'nameAsc' | 'nameDesc'
let catalogoView = 'grid';         // 'grid' | 'list'

/* ── Paginación por scroll infinito (mismo patrón que Stock) ── */
const CATALOGO_PAGE_SIZE = 24; // múltiplo de 4: siempre cierra filas completas
let catalogoRenderLimit = CATALOGO_PAGE_SIZE;
let catalogoScrollObserver = null;

function getFilteredCatalogo() {
  const input = document.getElementById('catalogoSearchInput');
  const q = (input ? input.value : '').trim().toLowerCase();

  let list = catalogoProductsCache;
  if (catalogoFilter === 'withImage') list = list.filter(p => !!p.image);
  else if (catalogoFilter === 'noImage') list = list.filter(p => !p.image);

  if (q) {
    list = list.filter(p => {
      const search = `${displayProductCode(p.code || '')} ${p.name || ''} ${p.category || ''}`.toLowerCase();
      return search.includes(q);
    });
  }

  if (catalogoSort === 'nameAsc') {
    list = [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  } else if (catalogoSort === 'nameDesc') {
    list = [...list].sort((a, b) => (b.name || '').localeCompare(a.name || ''));
  }
  // 'recent' ya viene ordenado por código desde el listener de Firebase

  return list;
}

function catalogoItemHtml(p) {
  const code = p.code || '';
  const name = p.name || '';
  const image = p.image || '';
  const category = p.category || 'Sin categoría';
  const escapedName = escapeJsAttr(name);
  const stock = getDisplayStock(p);
  const price = p.price !== undefined ? p.price : 0;
  const currency = p.currency === 'USD' ? 'USD' : 'PEN';
  const priceHtml = price > 0 ? fmtMoney(price, currency) : '—';

  const media = image
    ? `<div class="catalogo-thumb-wrap" onclick="openImageView('${escapeJsAttr(image)}','${escapedName}')">
         <img src="${image}" alt="">
         <button class="catalogo-quickview" onclick="event.stopPropagation();openImageView('${escapeJsAttr(image)}','${escapedName}')" aria-label="Ver imagen">
           <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
         </button>
       </div>`
    : `<div class="catalogo-thumb-empty" onclick="location.hash='#stock'">
         <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
         <span>Subir foto</span>
       </div>`;

  return `
    <div class="catalogo-item" data-code="${escapeHtml(code)}">
      ${media}
      <div class="catalogo-item-body">
        <div class="catalogo-item-top">
          <span class="catalogo-item-code">${escapeHtml(displayProductCode(code))}</span>
          <span class="catalogo-item-stock${stock === 0 ? ' catalogo-item-stock-zero' : ''}">${stock === 0 ? 'Sin stock' : stock + ' uds'}</span>
        </div>
        <div class="catalogo-item-name">${escapeHtml(name)}</div>
        <div class="catalogo-item-cat">${escapeHtml(category)}</div>
        <div class="catalogo-item-price-row">
          <span class="catalogo-item-price">${priceHtml}</span>
        </div>
      </div>
    </div>
  `;
}

function renderCatalogoPage() {
  const grid = document.getElementById('catalogoGrid');
  if (!grid) return; // la vista de Catálogo no está montada ahora mismo

  const filtered = getFilteredCatalogo();
  const page = filtered.slice(0, catalogoRenderLimit);

  grid.innerHTML = page.map(catalogoItemHtml).join('');
  grid.classList.toggle('catalogo-grid-list', catalogoView === 'list');

  const empty = document.getElementById('catalogoEmptyState');
  if (empty) empty.style.display = filtered.length === 0 ? '' : 'none';

  const footer = document.getElementById('catalogoFooterInfo');
  if (footer) {
    const total = catalogoProductsCache.length;
    footer.textContent = filtered.length === total
      ? `${total} producto${total !== 1 ? 's' : ''}`
      : `${filtered.length} de ${total} producto${total !== 1 ? 's' : ''}`;
  }

  updateCatalogoStats();
  setupCatalogoInfiniteScroll(filtered.length);
}

function updateCatalogoStats() {
  const total = catalogoProductsCache.length;
  const withImage = catalogoProductsCache.filter(p => !!p.image).length;
  const noImage = total - withImage;
  const pct = total > 0 ? Math.round((withImage / total) * 100) : 0;

  const value = document.getElementById('catalogoProgressValue');
  if (value) value.textContent = `${withImage}/${total}`;
  const fill = document.getElementById('catalogoProgressFill');
  if (fill) fill.style.width = `${pct}%`;
  const count = document.getElementById('catalogoNoImageCount');
  if (count) count.textContent = noImage;
  const subtitle = document.getElementById('catalogoSubtitle');
  if (subtitle) subtitle.textContent = `${total} producto${total !== 1 ? 's' : ''} · actualizado ahora`;
}

function setupCatalogoInfiniteScroll(totalFiltered) {
  if (catalogoScrollObserver) { catalogoScrollObserver.disconnect(); catalogoScrollObserver = null; }
  const grid = document.getElementById('catalogoGrid');
  if (!grid) return;
  if (catalogoRenderLimit >= totalFiltered) return; // ya está todo cargado

  const sentinel = document.createElement('div');
  sentinel.id = 'catalogoScrollSentinel';
  sentinel.style.cssText = 'grid-column:1/-1;height:1px';
  grid.appendChild(sentinel);

  catalogoScrollObserver = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) {
      catalogoRenderLimit += CATALOGO_PAGE_SIZE;
      renderCatalogoPage();
    }
  }, { root: grid.closest('.page-content'), rootMargin: '400px' });
  catalogoScrollObserver.observe(sentinel);
}

function renderCatalogo() {
  catalogoRenderLimit = CATALOGO_PAGE_SIZE; // el catálogo cambió (Firebase) — vuelve a la primera página
  renderCatalogoPage();
}

function filterCatalogo() {
  catalogoRenderLimit = CATALOGO_PAGE_SIZE; // nueva búsqueda: vuelve a la primera página de resultados
  renderCatalogoPage();
}

function setCatalogoFilter(filter) {
  catalogoFilter = filter;
  document.querySelectorAll('#catalogoTabs .catalogo-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  catalogoRenderLimit = CATALOGO_PAGE_SIZE;
  renderCatalogoPage();
}

const CATALOGO_SORT_LABELS = { recent: 'Recientes', nameAsc: 'Nombre (A-Z)', nameDesc: 'Nombre (Z-A)' };

function setCatalogoSort(sort) {
  catalogoSort = sort;
  const label = document.getElementById('catalogoSortLabel');
  if (label) label.textContent = CATALOGO_SORT_LABELS[sort] || 'Recientes';
  document.getElementById('catalogoSortMenu').classList.remove('open');
  renderCatalogoPage();
}

function toggleCatalogoSortMenu(e) {
  e.stopPropagation();
  document.getElementById('catalogoSortMenu').classList.toggle('open');
}
document.addEventListener('click', () => {
  const menu = document.getElementById('catalogoSortMenu');
  if (menu) menu.classList.remove('open');
});

function setCatalogoView(view) {
  catalogoView = view;
  const btnGrid = document.getElementById('btnCatalogoViewGrid');
  const btnList = document.getElementById('btnCatalogoViewList');
  if (btnGrid) btnGrid.classList.toggle('active', view === 'grid');
  if (btnList) btnList.classList.toggle('active', view === 'list');
  renderCatalogoPage();
}

/* ── Firebase listener ──────────────────────────────────
   Mismo resguardo que stock.js/dashboard-logic.js: espera a
   authReady y sale en silencio si currentTiendaId no está listo
   (súper-admin, o carrera de Auth al abrir con doble clic). */
authReady.then(() => {
  try {
    if (!currentTiendaId) return;
    watchProducts(list => {
      catalogoProductsCache = (list || []).sort((a, b) => (a.code || '').localeCompare(b.code || ''));
      renderCatalogo();
    });
  } catch (err) {
    console.warn('[Catálogo] No se pudo iniciar la escucha de productos:', err.message);
  }
});

window.Catalogo = {
  init() {
    catalogoFilter = 'all';
    catalogoSort = 'recent';
    // watchProducts ya cachea internamente — si Catálogo ya recibió
    // datos antes de esta visita (ej. se navegó desde Stock), no
    // hace falta esperar a un nuevo evento para pintar la grilla.
    renderCatalogo();
    if (typeof aplicarCompartirImagenPorPlan === 'function') aplicarCompartirImagenPorPlan();
  }
};
