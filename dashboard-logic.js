/* ══════════════════════════════════════
   dashboard-logic.js — Resumen general
   ══════════════════════════════════════ */

window.Dashboard = (function () {

  let chartJsPromise = null;
  let warehouseChart = null;
  let categoryChart = null;

  let latestProducts = [];

  // Umbral de "stock bajo", configurable desde Configuración (ver
  // configuracion-logic.js / setUmbralStock en firebase.js). 5 es
  // solo el valor por defecto mientras se carga o si la tienda nunca
  // lo configuró.
  let umbralStock = 5;

  // Nombres reales y cuáles almacenes están activos para esta tienda
  // (hasta 6, según plan — ver plan-limits.js). Se carga una vez en
  // init(); null mientras tanto = usar el fallback de 3 fijos de
  // buildWarehouseChartData().
  let almacenesCfg = null;

  const CATEGORY_COLORS = ['#1B4B91', '#2B6E8F', '#B7791F', '#3F7D6E', '#5B6B8C', '#7D8FA9', '#94623F'];
  const WAREHOUSE_COLORS = ['#1B4B91', '#2B6E8F', '#B7791F', '#3F7D6E', '#5B6B8C', '#7D8FA9'];

  // Antes esto bajaba Chart.js desde cdnjs.cloudflare.com en vivo.
  // El problema: en varios entornos de desarrollo/red corporativa ese
  // dominio queda bloqueado (aunque gstatic.com, de Firebase, sí
  // pase), y el Dashboard se quedaba sin gráficos con un error de
  // red silencioso en consola. Ahora el archivo va empaquetado en el
  // propio proyecto (chart.umd.min.js, mismo patrón que los demás
  // assets locales de la app) — cero dependencia de un CDN externo.
  function loadChartJs() {
    if (window.Chart) return Promise.resolve();
    if (chartJsPromise) return chartJsPromise;
    chartJsPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'chart.umd.min.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
    return chartJsPromise;
  }

  function renderStockStats(products) {
    const total = products.length;
    const low = products.filter(p => Number(p.stock) <= umbralStock).length;
    const value = products.reduce((sum, p) => sum + (Number(p.stock) || 0) * (Number(p.price) || 0), 0);

    const elValue = document.getElementById('dashStockValue');
    const elTotal = document.getElementById('dashProductCount');
    const elLow = document.getElementById('dashLowStock');
    if (!elValue) return; // la vista ya no está montada (se navegó a otra pantalla)

    elValue.textContent = `S/ ${value.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`;
    elTotal.textContent = total.toLocaleString('es-PE');
    elLow.textContent = low.toLocaleString('es-PE');

    const list = document.getElementById('dashLowStockList');
    if (!list) return;
    const lowItems = products
      .filter(p => Number(p.stock) <= umbralStock)
      .sort((a, b) => (Number(a.stock) || 0) - (Number(b.stock) || 0))
      .slice(0, 6);

    if (lowItems.length === 0) {
      list.innerHTML = '<p class="dash-empty">No hay productos con stock bajo.</p>';
      return;
    }
    list.innerHTML = lowItems.map(p => `
      <div class="dash-row">
        <div class="dash-row-main">
          <div class="dash-row-title">${escapeHtml(p.name || p.code || '')}</div>
          <div class="dash-row-meta">${escapeHtml(displayProductCode ? displayProductCode(p.code || '') : (p.code || ''))}</div>
        </div>
        <div class="dash-row-value low">${Number(p.stock) || 0} u.</div>
      </div>
    `).join('');
  }

  // ── Rentabilidad (Medio/Premium) ──────────────────────
  // Reutiliza limitePlan('campoCosto') — el mismo flag que ya decide
  // si Stock muestra el campo Costo (ver stock.js). Es la misma
  // fuente de verdad: si un plan no ve costo en ningún otro lado de
  // la app, tampoco tiene sentido mostrarle un panel de margen acá.
  // Básico nunca llega a ver este panel ni a calcularlo.
  function renderProfitPanel(products) {
    const panel = document.getElementById('dashProfitPanel');
    if (!panel) return;

    const habilitado = (typeof limitePlan === 'function') ? limitePlan('campoCosto') : false;
    if (!habilitado) {
      panel.style.display = 'none';
      return;
    }
    panel.style.display = '';

    let costoTotal = 0, ventaTotal = 0;
    const conMargen = products.map(p => {
      const stock = Number(p.stock) || 0;
      const costo = Number(p.costo) || 0;
      const precio = Number(p.price) || 0;
      const margenUnit = precio - costo;
      costoTotal += costo * stock;
      ventaTotal += precio * stock;
      return { p, margenUnit };
    });
    const margenTotal = ventaTotal - costoTotal;
    const margenPct = ventaTotal > 0 ? (margenTotal / ventaTotal) * 100 : 0;

    const fmt = (n) => `S/ ${n.toLocaleString('es-PE', { maximumFractionDigits: 0 })}`;
    document.getElementById('dashCostTotal').textContent = fmt(costoTotal);
    document.getElementById('dashMarginTotal').textContent = fmt(margenTotal);
    document.getElementById('dashMarginPct').textContent = `${margenPct.toLocaleString('es-PE', { maximumFractionDigits: 1 })}%`;

    const list = document.getElementById('dashTopMarginList');
    if (!list) return;
    const top = conMargen
      .filter(x => x.margenUnit > 0)
      .sort((a, b) => b.margenUnit - a.margenUnit)
      .slice(0, 5);

    if (top.length === 0) {
      list.innerHTML = '<p class="dash-empty">Sin datos de costo suficientes todavía.</p>';
      return;
    }
    list.innerHTML = top.map(({ p, margenUnit }) => `
      <div class="dash-row">
        <div class="dash-row-main">
          <div class="dash-row-title">${escapeHtml(p.name || p.code || '')}</div>
          <div class="dash-row-meta">${escapeHtml(displayProductCode ? displayProductCode(p.code || '') : (p.code || ''))}</div>
        </div>
        <div class="dash-row-value">S/ ${margenUnit.toLocaleString('es-PE', { maximumFractionDigits: 2 })}</div>
      </div>
    `).join('');
  }

  // ── Etiqueta de plan en el topbar ──────────────────────
  // Usa planActual()/nombrePlan() de plan-limits.js — la misma
  // fuente de verdad que ya usa el resto de la app (Configuración,
  // Registros, el panel de Rentabilidad de acá abajo), nunca un
  // "if (plan === 'medio')" suelto nuevo.
  function renderPlanBadge() {
    const tag = document.getElementById('dashPlanTag');
    if (!tag) return;
    if (typeof planActual !== 'function' || typeof nombrePlan !== 'function') return;
    const plan = planActual();
    tag.className = 'dash-plan-tag plan-tag-' + plan;
    tag.textContent = 'Plan ' + nombrePlan(plan);
    tag.style.display = '';
  }

  function renderClientStats(clients) {
    const elClients = document.getElementById('dashClientCount');
    if (elClients) elClients.textContent = clients.length.toLocaleString('es-PE');
  }

  // Muestra/oculta la tarjeta "Clientes registrados" según el plan —
  // mismo criterio que ya oculta Pedidos/Registros del sidebar (ver
  // limitePlan('pedidosDisponible') en plan-limits.js). Se llama antes
  // de decidir si vale la pena escuchar /clients en absoluto (ver
  // init() más abajo): en Básico ni se pide el dato.
  function aplicarVisibilidadClientes() {
    const card = document.getElementById('dashClientCard');
    if (!card) return true;
    const habilitado = (typeof limitePlan === 'function') ? limitePlan('pedidosDisponible') : true;
    card.style.display = habilitado ? '' : 'none';
    return habilitado;
  }

  /* ── Gráfico: stock por almacén ── */
  function buildWarehouseChartData(products) {
    let list;
    if (almacenesCfg) {
      // Solo los almacenes activos de esta tienda, con su nombre real,
      // en orden (alm1 siempre primero, siempre activo).
      list = Object.keys(almacenesCfg.activos)
        .filter(id => almacenesCfg.activos[id])
        .sort((a, b) => parseInt(a.replace('alm', ''), 10) - parseInt(b.replace('alm', ''), 10))
        .map(id => ({ id, label: almacenesCfg.nombres[id] || id }));
    } else {
      // Fallback mientras carga getAlmacenesConfig() (o si falló):
      // los 3 de siempre, con nombre por defecto.
      list = (typeof WAREHOUSES !== 'undefined' && WAREHOUSES.length)
        ? WAREHOUSES.slice(0, 3)
        : [{ id: 'alm1', label: 'Almacén 1' }, { id: 'alm2', label: 'Almacén 2' }, { id: 'alm3', label: 'Almacén 3' }];
    }
    const labels = list.map(w => w.label);
    const totals = list.map(w =>
      products.reduce((sum, p) => sum + Number((p.almacenes && p.almacenes[w.id]) || 0), 0)
    );
    return { labels, totals };
  }

  function renderWarehouseChart(products) {
    const canvas = document.getElementById('chartWarehouses');
    if (!canvas || !window.Chart) return;
    const { labels, totals } = buildWarehouseChartData(products);

    if (warehouseChart) { warehouseChart.destroy(); warehouseChart = null; }
    warehouseChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Unidades',
          data: totals,
          backgroundColor: WAREHOUSE_COLORS.slice(0, totals.length),
          borderRadius: 5,
          maxBarThickness: 46
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => `${ctx.raw} unidades` } }
        },
        scales: {
          x: { beginAtZero: true, grid: { color: '#E7E2D3' } },
          y: { grid: { display: false } }
        }
      }
    });
  }

  /* ── Gráfico: stock por categoría ── */
  function buildCategoryChartData(products) {
    const map = {};
    products.forEach(p => {
      const cat = (p.category || 'sin categoría').trim() || 'sin categoría';
      map[cat] = (map[cat] || 0) + (Number(p.stock) || 0);
    });
    let entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
    if (entries.length > 6) {
      const top = entries.slice(0, 6);
      const restTotal = entries.slice(6).reduce((s, e) => s + e[1], 0);
      entries = restTotal > 0 ? top.concat([['otros', restTotal]]) : top;
    }
    return {
      labels: entries.map(e => e[0]),
      totals: entries.map(e => e[1])
    };
  }

  function renderCategoryChart(products) {
    const canvas = document.getElementById('chartCategories');
    const legendEl = document.getElementById('chartCategoriesLegend');
    if (!canvas || !window.Chart) return;
    const { labels, totals } = buildCategoryChartData(products);
    const colors = labels.map((_, i) => CATEGORY_COLORS[i % CATEGORY_COLORS.length]);

    if (categoryChart) { categoryChart.destroy(); categoryChart = null; }
    categoryChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: totals,
          backgroundColor: colors,
          borderWidth: 2,
          borderColor: '#FFFFFF'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw} unidades` } }
        }
      }
    });

    if (legendEl) {
      legendEl.innerHTML = labels.map((label, i) => `
        <div class="dash-legend-item">
          <span class="dash-legend-dot" style="background:${colors[i]}"></span>
          ${escapeHtml(label)}
        </div>
      `).join('');
    }
  }

  // Antes cada actualización (tanto de productos como de pedidos)
  // volvía a destruir y recrear los 3 gráficos, aunque solo uno de
  // ellos dependiera de esos datos — por ejemplo, un cambio de stock
  // hacía parpadear también el gráfico de ventas sin motivo. Ahora
  // cada fuente de datos solo repinta los gráficos que realmente
  // dependen de ella.
  function renderProductCharts() {
    loadChartJs().then(() => {
      renderWarehouseChart(latestProducts);
      renderCategoryChart(latestProducts);
    }).catch(err => {
      console.error('[Dashboard] No se pudo cargar la librería de gráficos:', err);
    });
  }

  function init() {
    // El súper-admin no pertenece a ninguna tienda — no hay stock ni
    // clientes que mostrar acá. En la práctica su sidebar no tiene
    // enlace a Dashboard (su HOME_PAGE es Tiendas, ver nav.js), pero
    // esto queda como red de seguridad si alguien llega igual
    // escribiendo #dashboard a mano en la URL.
    // Envuelto en try/catch a propósito: si por una carrera de Firebase
    // Auth (común al abrir con doble clic, file://) currentTiendaId
    // todavía no quedó puesto cuando esto corre, que quede como un
    // aviso silencioso en consola y no como un error sin capturar.
    try {
      if (!currentTiendaId) return;

      renderPlanBadge();

      // El umbral de stock bajo se carga una vez al entrar (viene de
      // Configuración); si la persona lo cambia después sin salir del
      // Dashboard, setUmbralStock() de abajo se encarga de refrescar
      // sin depender de esta carga inicial.
      if (typeof getTiendaConfig === 'function') {
        getTiendaConfig()
          .then(cfg => {
            if (cfg && cfg.stockBajoUmbral !== undefined && cfg.stockBajoUmbral !== null) {
              umbralStock = Number(cfg.stockBajoUmbral);
              if (latestProducts.length) renderStockStats(latestProducts);
            }
          })
          .catch(() => {}); // valor por defecto (5) ya está puesto arriba
      }

      // Nombres reales + cuáles almacenes están activos, para que el
      // gráfico de "stock por almacén" no muestre siempre 3 barras
      // fijas con nombre genérico (ver buildWarehouseChartData()).
      if (typeof getAlmacenesConfig === 'function') {
        getAlmacenesConfig()
          .then(cfg => {
            almacenesCfg = cfg;
            if (latestProducts.length) renderProductCharts();
          })
          .catch(() => {}); // fallback de 3 fijos ya cubre esto
      }

      // Productos y clientes: reutiliza los mismos listeners en tiempo
      // real que usan Stock y Registros (watchProducts / watchClients
      // ya cachean internamente, así que llamarlos de nuevo acá no
      // duplica lecturas).
      watchProducts(products => {
        latestProducts = products || [];
        renderStockStats(latestProducts);
        renderProductCharts();
        renderProfitPanel(latestProducts);
      });

      // Clientes: solo se pide el dato si el plan lo usa en algún
      // lado (Medio/Premium) — en Básico la tarjeta ya queda oculta
      // arriba, así que ni tiene sentido abrir el listener de
      // /clients (una lectura menos, sin nada que mostrar con ella).
      if (aplicarVisibilidadClientes()) {
        watchClients(clients => {
          renderClientStats(clients || []);
        });
      }
    } catch (err) {
      console.warn('[Dashboard] No se pudo iniciar la escucha de datos:', err.message);
    }
  }

  // Llamado desde Configuración cuando se guarda un umbral nuevo en
  // la misma sesión (SPA) — evita que la persona tenga que recargar
  // para ver el Dashboard reflejar el cambio.
  function setUmbralStock(valor) {
    const n = Number(valor);
    umbralStock = (!isNaN(n) && n >= 0) ? n : 5;
    if (latestProducts.length) renderStockStats(latestProducts);
  }

  // Llamado desde auth-guard.js cuando el plan de la tienda cambia en
  // vivo (el súper-admin lo sube/baja desde Facturación), para que la
  // etiqueta de plan y el panel de Rentabilidad se actualicen al
  // toque si la persona ya está parada en el Dashboard — sin esto,
  // se quedarían mostrando el plan viejo hasta la próxima recarga.
  function refreshPlan() {
    renderPlanBadge();
    if (latestProducts.length) renderProfitPanel(latestProducts);
  }

  return { init, setUmbralStock, refreshPlan };
})();
