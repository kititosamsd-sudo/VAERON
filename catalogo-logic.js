/* ══════════════════════════════════════
   catalogo-logic.js — Galería de imágenes
   ══════════════════════════════════════
   Antes esta grilla vivía mezclada con Stock (una columna "Img" en
   la tabla). Ahora es su propia pantalla: Stock se queda con todo
   MENOS las imágenes (código, nombre, precio), y acá solo viven las
   fotos, en una grilla de 4 columnas (ver .catalogo-grid en
   base.css) con tantas filas como productos haya.

   Mantiene su propia copia de productsCache (catalogoProductsCache)
   en vez de reusar la de stock.js — mismo patrón que dashboard-logic.js
   con latestProducts: cada pantalla de la SPA es autocontenida y
   watchProducts() ya cachea internamente, así que suscribirse de
   nuevo acá no duplica lecturas a Firebase. */

let catalogoProductsCache = [];

/* ── Paginación por scroll infinito (mismo patrón que Stock) ── */
const CATALOGO_PAGE_SIZE = 24; // múltiplo de 4: siempre cierra filas completas
let catalogoRenderLimit = CATALOGO_PAGE_SIZE;
let catalogoScrollObserver = null;

function getFilteredCatalogo() {
  const input = document.getElementById('catalogoSearchInput');
  const q = (input ? input.value : '').trim().toLowerCase();
  if (!q) return catalogoProductsCache;
  return catalogoProductsCache.filter(p => {
    const search = `${displayProductCode(p.code || '')} ${p.name || ''} ${p.category || ''}`.toLowerCase();
    return search.includes(q);
  });
}

function catalogoItemHtml(p) {
  const code = p.code || '';
  const name = p.name || '';
  const image = p.image || '';
  const escapedName = escapeJsAttr(name);
  const thumb = image
    ? `<img src="${image}" alt="" onclick="openImageView('${escapeJsAttr(image)}','${escapedName}')">`
    : `<div class="catalogo-thumb-empty">Sin imagen</div>`;
  return `
    <div class="catalogo-item" data-code="${escapeHtml(code)}">
      <div class="catalogo-thumb-wrap">${thumb}</div>
      <div class="catalogo-item-body">
        <div class="catalogo-item-code">${escapeHtml(displayProductCode(code))}</div>
        <div class="catalogo-item-name">${escapeHtml(name)}</div>
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

  const empty = document.getElementById('catalogoEmptyState');
  if (empty) empty.style.display = filtered.length === 0 ? '' : 'none';

  const footer = document.getElementById('catalogoFooterInfo');
  if (footer) {
    const total = catalogoProductsCache.length;
    footer.textContent = filtered.length === total
      ? `${total} producto${total !== 1 ? 's' : ''}`
      : `${filtered.length} de ${total} producto${total !== 1 ? 's' : ''}`;
  }

  setupCatalogoInfiniteScroll(filtered.length);
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
    // watchProducts ya cachea internamente — si Catálogo ya recibió
    // datos antes de esta visita (ej. se navegó desde Stock), no
    // hace falta esperar a un nuevo evento para pintar la grilla.
    renderCatalogo();
    if (typeof aplicarCompartirImagenPorPlan === 'function') aplicarCompartirImagenPorPlan();
  }
};
