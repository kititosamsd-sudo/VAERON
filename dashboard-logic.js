/* ══════════════════════════════════════
   dashboard-logic.js — Resumen general
   ══════════════════════════════════════ */

window.Dashboard = (function () {

  let chartJsPromise = null;
  let categoryChart = null;
  let abcChart = null;
  let healthChart = null;

  let latestProducts = [];

  // Umbral de "stock bajo", configurable desde Configuración (ver
  // configuracion-logic.js / setUmbralStock en firebase.js). 5 es
  // solo el valor por defecto mientras se carga o si la tienda nunca
  // lo configuró.
  let umbralStock = 5;

  // Si el Dashboard debe mostrar el KPI rojo + panel "Stock bajo" —
  // configurable desde Configuración (ver setAlertaDashboard en
  // firebase.js). true por defecto: si la tienda nunca lo tocó, el
  // Dashboard se sigue viendo como siempre.
  let alertaDashboardActiva = true;

  // Nombres reales y cuáles almacenes están activos para esta tienda
  // (hasta 6, según plan — ver plan-limits.js). Se carga una vez en
  // init(); null mientras tanto = usar el fallback de 3 fijos de
  // buildWarehouseChartData().
  let almacenesCfg = null;

  // Antes esto era el azul plano #1B4B91 de la marca vieja (ver
  // variables.css: "Se abandona el azul plano tipo SaaS corporativo
  // anterior"). Los gráficos nunca se actualizaron con el rebrand —
  // quedaron mostrando un azul que ya no existe en ningún otro lado
  // de la app. Ahora usan la rampa real de marca: acento, acento
  // eléctrico, cobre y grafito/acero — los mismos tokens de
  // variables.css, no colores nuevos inventados para el gráfico.
  const CATEGORY_COLORS = ['#1A46C4', '#2F7DFF', '#A9682E', '#4A5568', '#7D93B8', '#C98B4A'];
  const WAREHOUSE_COLORS = ['#1A46C4', '#2F7DFF', '#A9682E', '#4A5568', '#7D93B8', '#C98B4A'];
  const CATEGORY_OTHER_COLOR = '#8991A0'; // "otros" siempre gris acero neutro, nunca compite con una categoría real
  let salesChart = null;

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

    elValue.textContent = `S/ ${value.toLocaleString(formatoNumeroActivo(), { maximumFractionDigits: 0 })}`;
    elTotal.textContent = total.toLocaleString(formatoNumeroActivo());
    elLow.textContent = low.toLocaleString(formatoNumeroActivo());

    // "Alerta en el dashboard" (Configuración) — con la alerta
    // apagada, se ocultan el KPI rojo y el panel entero de "Stock
    // bajo" de abajo; el resto del Dashboard sigue igual.
    const kpiCard = document.getElementById('dashLowStockKpiCard');
    const lowStockPanel = document.getElementById('dashLowStockPanel');
    if (kpiCard) kpiCard.style.display = alertaDashboardActiva ? '' : 'none';
    if (lowStockPanel) lowStockPanel.style.display = alertaDashboardActiva ? '' : 'none';
    if (!alertaDashboardActiva) return;

    const list = document.getElementById('dashLowStockList');
    if (!list) return;
    const lowItems = products
      .filter(p => Number(p.stock) <= umbralStock)
      .sort((a, b) => (Number(a.stock) || 0) - (Number(b.stock) || 0))
      .slice(0, 6);

    if (lowItems.length === 0) {
      list.classList.remove('dash-list-2col');
      list.innerHTML = '<p class="dash-empty">No hay productos con stock bajo.</p>';
      return;
    }
    // Dos columnas cuando hay más de un producto — antes esta lista
    // quedaba angosta y muy alta, dejando toda la mitad derecha del
    // Dashboard vacía en planes sin panel de Rentabilidad (Básico).
    list.classList.toggle('dash-list-2col', lowItems.length > 1);
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

    // Cuando este panel no existe para el plan (Básico), "Stock bajo"
    // pasa a ocupar las dos columnas del grid en vez de quedarse solo
    // en la mitad izquierda con la derecha vacía.
    const lowStockPanel = document.getElementById('dashLowStockPanel');

    const habilitado = (typeof limitePlan === 'function') ? limitePlan('campoCosto') : false;
    if (!habilitado) {
      panel.style.display = 'none';
      if (lowStockPanel) lowStockPanel.classList.add('dash-panel-span2');
      return;
    }
    panel.style.display = '';
    if (lowStockPanel) lowStockPanel.classList.remove('dash-panel-span2');

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

    const fmt = (n) => `S/ ${n.toLocaleString(formatoNumeroActivo(), { maximumFractionDigits: 0 })}`;
    document.getElementById('dashCostTotal').textContent = fmt(costoTotal);
    document.getElementById('dashMarginTotal').textContent = fmt(margenTotal);
    document.getElementById('dashMarginPct').textContent = `${margenPct.toLocaleString(formatoNumeroActivo(), { maximumFractionDigits: 1 })}%`;

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
        <div class="dash-row-value">S/ ${margenUnit.toLocaleString(formatoNumeroActivo(), { maximumFractionDigits: 2 })}</div>
      </div>
    `).join('');
  }

  // ══════════════════════════════════════════════════════
  // Panel avanzado (exclusivo Premium) — ABC, valor por almacén,
  // índice de salud. En Básico y Medio la sección entera queda
  // oculta y ni se calcula — solo Premium la ve, nítida, sin
  // candado ni preview borroso. Ver renderAdvancedPanel() al final
  // de este grupo.
  // ══════════════════════════════════════════════════════

  // ── ABC / Pareto: qué % de los productos concentra el valor ──
  // Clasificación estándar por valor acumulado (precio × stock):
  // tramo A = primeros productos hasta el 80% del valor, B hasta
  // 95%, C el resto. Productos con valor 0 (sin precio o sin stock)
  // quedan fuera del análisis — no aportan ni distorsionan el
  // acumulado.
  function buildAbcAnalysis(products) {
    const items = products
      .map(p => ({ p, value: (Number(p.stock) || 0) * (Number(p.price) || 0) }))
      .filter(x => x.value > 0)
      .sort((a, b) => b.value - a.value);
    const totalValue = items.reduce((s, x) => s + x.value, 0);
    const tierA = { count: 0, value: 0 };
    const tierB = { count: 0, value: 0 };
    const tierC = { count: 0, value: 0 };
    let acc = 0;
    items.forEach(x => {
      acc += x.value;
      const pct = totalValue > 0 ? (acc / totalValue) * 100 : 0;
      if (pct <= 80) { tierA.count++; tierA.value += x.value; x.tier = 'A'; }
      else if (pct <= 95) { tierB.count++; tierB.value += x.value; x.tier = 'B'; }
      else { tierC.count++; tierC.value += x.value; x.tier = 'C'; }
    });
    return { items, totalValue, totalCount: items.length, tierA, tierB, tierC };
  }

  const ABC_COLORS = { A: '#1A46C4', B: '#A9682E', C: '#8991A0' };

  function renderAbcPanel(products) {
    const summaryEl = document.getElementById('dashAbcSummary');
    const legendEl = document.getElementById('dashAbcLegend');
    const listEl = document.getElementById('dashAbcList');
    const canvas = document.getElementById('chartAbc');
    if (!summaryEl || !canvas || !window.Chart) return;

    const { items, totalValue, totalCount, tierA, tierB, tierC } = buildAbcAnalysis(products);
    const fmt = (n) => `S/ ${n.toLocaleString(formatoNumeroActivo(), { maximumFractionDigits: 0 })}`;

    if (totalCount === 0) {
      summaryEl.textContent = 'Sin datos suficientes todavía (falta precio o stock en los productos).';
    } else {
      const pctA = (tierA.count / totalCount) * 100;
      summaryEl.innerHTML = `<strong>${tierA.count}</strong> de ${totalCount} productos (${pctA.toLocaleString(formatoNumeroActivo(), { maximumFractionDigits: 1 })}%) concentran el 80% del valor total (${fmt(totalValue)}).`;
    }

    if (abcChart) { abcChart.destroy(); abcChart = null; }
    abcChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: ['Tramo A', 'Tramo B', 'Tramo C'],
        datasets: [{
          data: [tierA.value, tierB.value, tierC.value],
          backgroundColor: [ABC_COLORS.A, ABC_COLORS.B, ABC_COLORS.C],
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
          tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${fmt(ctx.raw)}` } }
        }
      }
    });

    if (legendEl) {
      const tiers = [
        { key: 'A', label: 'Tramo A', count: tierA.count },
        { key: 'B', label: 'Tramo B', count: tierB.count },
        { key: 'C', label: 'Tramo C', count: tierC.count },
      ];
      legendEl.innerHTML = tiers.map(t => `
        <div class="dash-legend-item">
          <span class="dash-abc-tier" style="background:${ABC_COLORS[t.key]}">${t.key}</span>
          ${t.label} · ${t.count.toLocaleString(formatoNumeroActivo())} prod.
        </div>
      `).join('');
    }

    if (listEl) {
      const top = items.slice(0, 5);
      if (top.length === 0) {
        listEl.innerHTML = '<p class="dash-empty">Sin datos suficientes todavía.</p>';
      } else {
        listEl.innerHTML = top.map(({ p, value, tier }) => `
          <div class="dash-row">
            <div class="dash-row-main">
              <div class="dash-row-title">
                <span class="dash-abc-tier" style="background:${ABC_COLORS[tier]};display:inline-flex;width:14px;height:14px;font-size:9.5px;margin-right:5px;vertical-align:middle">${tier}</span>
                ${escapeHtml(p.name || p.code || '')}
              </div>
              <div class="dash-row-meta">${escapeHtml(displayProductCode ? displayProductCode(p.code || '') : (p.code || ''))}</div>
            </div>
            <div class="dash-row-value">${fmt(value)}</div>
          </div>
        `).join('');
      }
    }
  }

  // ── Valor de inventario por almacén ──────────────────────
  // Mismo criterio de almacenes activos que buildWarehouseChartData
  // (unidades) — acá el mismo listado pero valorizado (precio ×
  // cantidad), para comparar en soles, no solo en bultos. Con hasta
  // 6 almacenes en Premium, esta lista naturalmente se vuelve más
  // rica que en Básico (2) o Medio (3).
  function buildWarehouseValueData(products) {
    let list;
    if (almacenesCfg) {
      list = Object.keys(almacenesCfg.activos)
        .filter(id => almacenesCfg.activos[id])
        .sort((a, b) => parseInt(a.replace('alm', ''), 10) - parseInt(b.replace('alm', ''), 10))
        .map(id => ({ id, label: almacenesCfg.nombres[id] || id }));
    } else {
      list = (typeof WAREHOUSES !== 'undefined' && WAREHOUSES.length)
        ? WAREHOUSES.slice(0, 3)
        : [{ id: 'alm1', label: 'Almacén 1' }, { id: 'alm2', label: 'Almacén 2' }, { id: 'alm3', label: 'Almacén 3' }];
    }
    const rows = list.map(w => {
      let units = 0, value = 0;
      products.forEach(p => {
        const qty = Number((p.almacenes && p.almacenes[w.id]) || 0);
        units += qty;
        value += qty * (Number(p.price) || 0);
      });
      return { label: w.label, units, value };
    });
    const totalValue = rows.reduce((s, r) => s + r.value, 0);
    return { rows, totalValue };
  }

  function renderWarehouseValuePanel(products) {
    const listEl = document.getElementById('dashWarehouseValueList');
    if (!listEl) return;
    const { rows, totalValue } = buildWarehouseValueData(products);
    const fmt = (n) => `S/ ${n.toLocaleString(formatoNumeroActivo(), { maximumFractionDigits: 0 })}`;

    if (totalValue === 0) {
      listEl.innerHTML = '<p class="dash-empty">Sin datos suficientes todavía.</p>';
      return;
    }
    listEl.innerHTML = rows.map((r, i) => {
      const pct = totalValue > 0 ? (r.value / totalValue) * 100 : 0;
      const color = WAREHOUSE_COLORS[i % WAREHOUSE_COLORS.length];
      return `
        <div class="dash-wh-value-row">
          <div class="dash-wh-value-top">
            <span class="dash-wh-value-name">${escapeHtml(r.label)}</span>
            <span class="dash-wh-value-amount">${fmt(r.value)}</span>
          </div>
          <div class="dash-wh-value-track"><div class="dash-wh-value-fill" style="width:${pct}%;background:${color}"></div></div>
          <span class="dash-wh-value-meta">${r.units.toLocaleString(formatoNumeroActivo())} unidades · ${pct.toLocaleString(formatoNumeroActivo(), { maximumFractionDigits: 1 })}% del valor</span>
        </div>
      `;
    }).join('');
  }

  // ── Índice de salud del inventario ──────────────────────
  // Combina, con los mismos datos que ya usa el resto del Dashboard
  // (nada inventado ni traído de otra fuente):
  //   40% Disponibilidad — % de productos por encima del umbral de
  //        stock bajo configurado (mismo umbralStock de arriba).
  //   30% Diversificación de categorías — inverso del índice de
  //        Herfindahl sobre unidades por categoría: 100 si el
  //        catálogo está repartido en muchas categorías parejas,
  //        baja cuanto más concentrado en una sola.
  //   30% Concentración de valor — inverso de qué tan pocos
  //        productos (tramo A del ABC de arriba) sostienen el 80%
  //        del valor: un catálogo sano no depende de un puñado de
  //        productos.
  function buildHealthIndex(products) {
    const total = products.length;
    if (total === 0) return null;

    const disponibles = products.filter(p => (Number(p.stock) || 0) > umbralStock).length;
    const stockOuts = products.filter(p => (Number(p.stock) || 0) === 0).length;
    const conCosto = products.filter(p => (Number(p.costo) || 0) > 0).length;
    const pctDisponible = (disponibles / total) * 100;
    const pctStockOut = (stockOuts / total) * 100;
    const pctCostCoverage = (conCosto / total) * 100;

    const catMap = {};
    products.forEach(p => {
      const cat = (p.category || 'sin categoría').trim() || 'sin categoría';
      catMap[cat] = (catMap[cat] || 0) + 1;
    });
    const catCounts = Object.values(catMap);
    const hhi = catCounts.reduce((s, c) => s + Math.pow(c / total, 2), 0); // 0 (repartido) .. 1 (todo en una)
    const diversificacion = (1 - hhi) * 100;

    const { totalCount, tierA } = buildAbcAnalysis(products);
    // x2 porque en un catálogo sano el tramo A suele rondar 15-25%
    // de los productos — así ese rango normal puntúa alto en vez de
    // ser castigado como si fuera un problema.
    const concentracionSaludable = totalCount > 0
      ? 100 - Math.min(100, (tierA.count / totalCount) * 100 * 2)
      : 100;

    const score = Math.round(
      pctDisponible * 0.4 +
      diversificacion * 0.3 +
      concentracionSaludable * 0.3
    );

    return {
      score: Math.max(0, Math.min(100, score)),
      pctDisponible,
      pctStockOut,
      pctCostCoverage,
      diversificacion,
      concentracionSaludable,
      disponibles,
      stockOuts,
      conCosto,
      total,
      catCount: catCounts.length,
      metrics: [
        { label: 'Concentración de valor', value: concentracionSaludable, detail: `${tierA.count} productos sostienen el 80% del valor` },
      ],
    };
  }

  function renderHealthPanel(products) {
    const scoreEl = document.getElementById('dashHealthScore');
    const breakdownEl = document.getElementById('dashHealthBreakdown');
    const canvas = document.getElementById('chartHealth');
    if (!scoreEl || !canvas || !window.Chart) return;

    const health = buildHealthIndex(products);
    if (!health) {
      scoreEl.textContent = '—';
      if (breakdownEl) breakdownEl.innerHTML = '<p class="dash-empty">Sin datos suficientes todavía.</p>';
      return;
    }

    scoreEl.textContent = health.score;
    const color = health.score >= 75 ? '#146B4C' : health.score >= 50 ? '#A9690F' : '#B23A2C';

    if (healthChart) { healthChart.destroy(); healthChart = null; }
    healthChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        datasets: [{
          data: [health.score, 100 - health.score],
          backgroundColor: [color, '#E3E6ED'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        rotation: -90,
        circumference: 180,
        cutout: '75%',
        plugins: { legend: { display: false }, tooltip: { enabled: false } }
      }
    });

    if (breakdownEl) {
      breakdownEl.innerHTML = health.metrics.map(m => {
        const pct = Math.max(0, Math.min(100, m.value));
        return `
          <div class="dash-health-metric" title="${escapeHtml(m.detail)}">
            <div class="dash-health-metric-top">
              <span class="dash-health-metric-label">${escapeHtml(m.label)}</span>
              <span class="dash-health-metric-val">${pct.toLocaleString(formatoNumeroActivo(), { maximumFractionDigits: 0 })}%</span>
            </div>
            <div class="dash-health-metric-track"><div class="dash-health-metric-fill" style="width:${pct}%;background:${color}"></div></div>
          </div>
        `;
      }).join('');
    }
  }

  // ── Anillos de progreso (fila superior del panel avanzado) ──
  // Reutiliza los mismos números de buildHealthIndex — nada nuevo
  // se calcula acá, solo se muestra en un formato más visual.
  const ringCharts = {};
  function renderRing(canvasId, valueId, pct) {
    const canvas = document.getElementById(canvasId);
    const valueEl = document.getElementById(valueId);
    if (!canvas || !window.Chart) return;
    const p = Math.max(0, Math.min(100, Math.round(pct)));
    if (valueEl) valueEl.textContent = `${p}%`;
    const color = p >= 75 ? '#146B4C' : p >= 50 ? '#A9690F' : '#B23A2C';
    if (ringCharts[canvasId]) { ringCharts[canvasId].destroy(); }
    ringCharts[canvasId] = new Chart(canvas, {
      type: 'doughnut',
      data: { datasets: [{ data: [p, 100 - p], backgroundColor: [color, '#E3E6ED'], borderWidth: 0 }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '72%',
        plugins: { legend: { display: false }, tooltip: { enabled: false } }
      }
    });
  }

  function renderRingStats(products) {
    const health = buildHealthIndex(products);
    if (!health) {
      ['ringDisponibilidadVal', 'ringDiversificacionVal', 'ringCostosVal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '—';
      });
      return;
    }
    renderRing('chartRingDisponibilidad', 'ringDisponibilidadVal', health.pctDisponible);
    renderRing('chartRingDiversificacion', 'ringDiversificacionVal', health.diversificacion);
    renderRing('chartRingCostos', 'ringCostosVal', health.pctCostCoverage);
  }

  // ── Comparativa entre almacenes (radar) ──────────────────
  // 4 ejes por almacén, normalizados 0-100 contra el máximo de cada
  // eje entre los almacenes activos (el mejor almacén en cada eje
  // saca 100, los demás quedan relativos a él):
  //   Valor, Unidades, Variedad (nº de productos distintos con
  //   stock ahí) y Valor promedio por producto.
  let radarChart = null;
  function buildWarehouseRadarData(products) {
    const { rows } = buildWarehouseValueData(products);
    const list = (almacenesCfg
      ? Object.keys(almacenesCfg.activos).filter(id => almacenesCfg.activos[id])
        .sort((a, b) => parseInt(a.replace('alm', ''), 10) - parseInt(b.replace('alm', ''), 10))
        .map(id => ({ id, label: almacenesCfg.nombres[id] || id }))
      : (typeof WAREHOUSES !== 'undefined' && WAREHOUSES.length ? WAREHOUSES.slice(0, 3) : []));

    const raw = list.map((w, i) => {
      let units = 0, value = 0, variety = 0;
      products.forEach(p => {
        const qty = Number((p.almacenes && p.almacenes[w.id]) || 0);
        if (qty > 0) variety++;
        units += qty;
        value += qty * (Number(p.price) || 0);
      });
      const avgValue = variety > 0 ? value / variety : 0;
      return { label: w.label, units, value, variety, avgValue };
    });

    const maxUnits = Math.max(1, ...raw.map(r => r.units));
    const maxValue = Math.max(1, ...raw.map(r => r.value));
    const maxVariety = Math.max(1, ...raw.map(r => r.variety));
    const maxAvg = Math.max(1, ...raw.map(r => r.avgValue));

    return raw.map(r => ({
      label: r.label,
      values: [
        (r.value / maxValue) * 100,
        (r.units / maxUnits) * 100,
        (r.variety / maxVariety) * 100,
        (r.avgValue / maxAvg) * 100,
      ],
    }));
  }

  function renderWarehouseRadar(products) {
    const canvas = document.getElementById('chartWarehouseRadar');
    const wrap = document.getElementById('dashRadarWrap');
    const legendEl = document.getElementById('dashRadarLegend');
    if (!canvas || !window.Chart) return;

    const series = buildWarehouseRadarData(products);
    if (series.length < 2) {
      if (wrap) wrap.innerHTML = '<p class="dash-empty">Activa 2 o más almacenes en Configuración para comparar.</p>';
      if (legendEl) legendEl.innerHTML = '';
      return;
    }

    if (radarChart) { radarChart.destroy(); radarChart = null; }
    radarChart = new Chart(canvas, {
      type: 'radar',
      data: {
        labels: ['Valor', 'Unidades', 'Variedad', 'Valor prom./producto'],
        datasets: series.map((s, i) => {
          const color = WAREHOUSE_COLORS[i % WAREHOUSE_COLORS.length];
          return {
            label: s.label,
            data: s.values,
            borderColor: color,
            backgroundColor: color + '33',
            pointBackgroundColor: color,
            borderWidth: 2,
          };
        }),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            min: 0, max: 100,
            ticks: { display: false, stepSize: 25 },
            grid: { color: '#E3E6ED' },
            angleLines: { color: '#E3E6ED' },
            pointLabels: { font: { size: 11 }, color: '#5A6273' },
          },
        },
        plugins: { legend: { display: false } },
      },
    });

    if (legendEl) {
      legendEl.innerHTML = series.map((s, i) => `
        <div class="dash-legend-item">
          <span class="dash-legend-dot" style="background:${WAREHOUSE_COLORS[i % WAREHOUSE_COLORS.length]}"></span>
          ${escapeHtml(s.label)}
        </div>
      `).join('');
    }
  }

  // ── Insights inteligentes ──────────────────────
  // Reglas simples sobre los mismos números ya calculados arriba
  // (ABC, salud, valor por almacén) — texto generado, no una
  // predicción ni nada traído de otro lado.
  function buildInsights(products) {
    const insights = [];
    const total = products.length;
    if (total === 0) return insights;

    const health = buildHealthIndex(products);
    const { totalCount, tierA } = buildAbcAnalysis(products);
    const { rows: whRows, totalValue: whTotal } = buildWarehouseValueData(products);

    if (health.stockOuts > 0) {
      insights.push({ type: 'warn', text: `<strong>${health.stockOuts} producto${health.stockOuts === 1 ? '' : 's'}</strong> ${health.stockOuts === 1 ? 'está' : 'están'} sin stock ahora mismo (quiebre).` });
    }

    if (totalCount > 0) {
      const pctA = (tierA.count / totalCount) * 100;
      insights.push({ type: 'info', text: `El <strong>tramo A</strong> concentra el 80% del valor en solo ${pctA.toLocaleString(formatoNumeroActivo(), { maximumFractionDigits: 1 })}% de tus productos (${tierA.count} de ${totalCount}).` });
    }

    if (whTotal > 0 && whRows.length > 1) {
      const top = whRows.reduce((a, b) => (b.value > a.value ? b : a));
      const pct = (top.value / whTotal) * 100;
      if (pct >= 60) {
        insights.push({ type: 'warn', text: `<strong>${escapeHtml(top.label)}</strong> concentra el ${pct.toLocaleString(formatoNumeroActivo(), { maximumFractionDigits: 0 })}% del valor de tu inventario — considera redistribuir stock.` });
      }
    }

    if (health.pctCostCoverage < 100) {
      const faltan = health.total - health.conCosto;
      insights.push({ type: 'info', text: `Te falta cargar el costo en <strong>${faltan}</strong> producto${faltan === 1 ? '' : 's'} (${(100 - health.pctCostCoverage).toLocaleString(formatoNumeroActivo(), { maximumFractionDigits: 0 })}%) — sin eso, el panel de Rentabilidad no los incluye.` });
    }

    if (health.diversificacion < 40) {
      insights.push({ type: 'warn', text: `Tu catálogo está bastante concentrado: solo <strong>${health.catCount}</strong> categoría${health.catCount === 1 ? '' : 's'} activa${health.catCount === 1 ? '' : 's'}.` });
    }

    if (insights.filter(i => i.type === 'warn').length === 0) {
      insights.unshift({ type: 'good', text: `Tu inventario está saludable: buena disponibilidad de stock y sin concentraciones riesgosas.` });
    }

    return insights.slice(0, 5);
  }

  function renderInsights(products) {
    const listEl = document.getElementById('dashInsightsList');
    if (!listEl) return;
    const insights = buildInsights(products);
    if (insights.length === 0) {
      listEl.innerHTML = '<p class="dash-empty">Sin datos suficientes todavía.</p>';
      return;
    }
    const icons = { warn: '⚠️', info: 'ℹ️', good: '✅' };
    listEl.innerHTML = insights.map(i => `
      <div class="dash-insight-item is-${i.type}">
        <span class="dash-insight-icon">${icons[i.type]}</span>
        <span>${i.text}</span>
      </div>
    `).join('');
  }

  // ── Orquestador del panel avanzado ──────────────────────
  // Solo Premium ve este panel. En Básico y Medio la sección entera
  // queda oculta (display:none, ni se calcula) — antes, en Medio se
  // mostraba un preview borroso con candado como incentivo para
  // subir de plan; se quitó a pedido del cliente (VAERON-panel-
  // avanzado-solo-premium): ahora Medio ve el dashboard exactamente
  // igual que Básico, sin nada de Premium a la vista.
  function renderAdvancedPanel(products) {
    const section = document.getElementById('dashAdvancedSection');
    const grid = document.getElementById('dashAdvancedGrid');
    const lock = document.getElementById('dashAdvancedLock');
    if (!grid) return; // la vista ya no está montada

    const habilitado = (typeof limitePlan === 'function') ? limitePlan('panelAvanzado') : false;
    if (!habilitado) {
      if (section) section.style.display = 'none';
      return;
    }
    if (section) section.style.display = '';

    loadChartJs().then(() => {
      renderRingStats(products);
      renderAbcPanel(products);
      renderWarehouseValuePanel(products);
      renderHealthPanel(products);
      renderWarehouseRadar(products);
      renderInsights(products);
    }).catch(err => {
      console.error('[Dashboard] No se pudo cargar la librería de gráficos:', err);
    });

    grid.classList.remove('is-locked');
    if (lock) lock.style.display = 'none';
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
    if (elClients) elClients.textContent = clients.length.toLocaleString(formatoNumeroActivo());
  }

  // ── Próximos cumpleaños ──────────────────────────────────────
  // Ventana fija de 14 días — a diferencia del umbral de Stock bajo
  // (configurable desde Configuración), esto no tiene un ajuste
  // propio todavía; 14 días alcanza para que el vendedor tenga
  // tiempo de llamar o escribirle al cliente antes de la fecha.
  const VENTANA_CUMPLEANOS_DIAS = 14;
  const MESES_CUMPLE = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  // Cuántos días faltan desde HOY hasta el próximo cumpleaños de esa
  // persona — si ya pasó este año, calcula para el año que viene
  // (por eso el "+ 365 si da negativo"). No usa el año de nacimiento
  // para nada: cumpleDia/cumpleMes es TODO lo que se guarda (ver
  // saveClient() en firebase.js), a propósito, para no pedir un dato
  // más sensible del que hace falta.
  function diasHastaProximoCumple(dia, mes, hoy) {
    const anioActual = hoy.getFullYear();
    let proximo = new Date(anioActual, mes - 1, dia);
    // Comparación por fecha calendario (sin horas) — "hoy" cuenta
    // como 0 días, no como "ya pasó".
    const hoySinHora = new Date(anioActual, hoy.getMonth(), hoy.getDate());
    if (proximo < hoySinHora) proximo = new Date(anioActual + 1, mes - 1, dia);
    return Math.round((proximo - hoySinHora) / 86400000);
  }

  function renderUpcomingBirthdays(clients) {
    const panel = document.getElementById('dashBirthdaysPanel');
    const list = document.getElementById('dashBirthdaysList');
    if (!panel || !list) return;
    panel.style.display = '';

    const hoy = new Date();
    const proximos = clients
      .filter(c => c.cumpleDia && c.cumpleMes)
      .map(c => ({ cliente: c, dias: diasHastaProximoCumple(Number(c.cumpleDia), Number(c.cumpleMes), hoy) }))
      .filter(x => x.dias <= VENTANA_CUMPLEANOS_DIAS)
      .sort((a, b) => a.dias - b.dias)
      .slice(0, 6);

    if (proximos.length === 0) {
      list.classList.remove('dash-list-2col');
      list.innerHTML = '<p class="dash-empty">Ningún cliente cumple años en los próximos 14 días.</p>';
      return;
    }
    list.classList.toggle('dash-list-2col', proximos.length > 1);
    list.innerHTML = proximos.map(({ cliente, dias }) => {
      const cuando = dias === 0 ? 'Hoy' : dias === 1 ? 'Mañana' : `En ${dias} días`;
      return `
        <div class="dash-row">
          <div class="dash-row-main">
            <div class="dash-row-title">${escapeHtml(cliente.nombre || cliente.ruc || '')}</div>
            <div class="dash-row-meta">${cliente.cumpleDia} de ${MESES_CUMPLE[cliente.cumpleMes - 1]}</div>
          </div>
          <div class="dash-row-value">${cuando}</div>
        </div>`;
    }).join('');
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

  /* ── Stock por almacén ── */
  // Antes: un bar chart de Chart.js con ejes por defecto (y una
  // grilla color '#E7E2D3' — un beige que sobrevivió de una versión
  // aún más vieja de la paleta, ni de la marca actual). Ahora usa el
  // mismo componente de fila+barra que ya construimos para "Valor
  // por almacén" en el panel Premium (.dash-wh-value-*): un solo
  // lenguaje visual para "comparar almacenes" en toda la app, no una
  // versión genérica de Chart.js acá y una diseñada allá.
  function renderWarehousePanel(products) {
    const listEl = document.getElementById('dashWarehouseUnitsList');
    const totalEl = document.getElementById('dashWarehouseUnitsTotal');
    const legendEl = document.getElementById('dashWarehouseLegend');
    if (!listEl) return;
    const { labels, totals } = buildWarehouseChartData(products);
    const totalUnits = totals.reduce((s, n) => s + n, 0);

    if (totalEl) totalEl.textContent = `${totalUnits.toLocaleString(formatoNumeroActivo())} u.`;

    if (totalUnits === 0) {
      listEl.innerHTML = '<p class="dash-empty">Sin stock registrado todavía.</p>';
      if (legendEl) legendEl.innerHTML = '';
      return;
    }
    listEl.innerHTML = labels.map((label, i) => {
      const units = totals[i];
      const pct = totalUnits > 0 ? (units / totalUnits) * 100 : 0;
      const color = WAREHOUSE_COLORS[i % WAREHOUSE_COLORS.length];
      return `
        <div class="dash-wh-value-row">
          <div class="dash-wh-value-top">
            <span class="dash-wh-value-name">${escapeHtml(label)}</span>
            <span class="dash-wh-value-amount">${units.toLocaleString(formatoNumeroActivo())} u.</span>
          </div>
          <div class="dash-wh-value-track"><div class="dash-wh-value-fill" style="width:${pct}%;background:${color}"></div></div>
          <span class="dash-wh-value-meta">${pct.toLocaleString(formatoNumeroActivo(), { maximumFractionDigits: 1 })}% del stock total</span>
        </div>
      `;
    }).join('');

    // Leyenda al pie — mismo criterio visual que la de "Stock por
    // categoría" al lado. Antes esta tarjeta no tenía pie, así que
    // cuando había pocos almacenes quedaba visiblemente más corta
    // que su vecina y el grid dejaba un hueco vacío entre ambas.
    if (legendEl) {
      legendEl.innerHTML = labels.map((label, i) => {
        const pct = totalUnits > 0 ? (totals[i] / totalUnits) * 100 : 0;
        const color = WAREHOUSE_COLORS[i % WAREHOUSE_COLORS.length];
        return `
          <span class="dash-legend-item">
            <span class="dash-legend-dot" style="background:${color}"></span>
            ${escapeHtml(label)} · ${totals[i].toLocaleString(formatoNumeroActivo())} u. (${pct.toLocaleString(formatoNumeroActivo(), { maximumFractionDigits: 0 })}%)
          </span>
        `;
      }).join('');
    }
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
    const totalEl = document.getElementById('dashCategoryDonutTotal');
    const headerTotalEl = document.getElementById('dashCategoryUnitsTotal');
    if (!canvas || !window.Chart) return;
    const { labels, totals } = buildCategoryChartData(products);
    const grandTotal = totals.reduce((s, n) => s + n, 0);
    // "otros" es el cajón de sastre — siempre gris acero, nunca un
    // color de la rampa de marca, para que no compita visualmente
    // con una categoría real (ver buildCategoryChartData()).
    const colors = labels.map((label, i) => label === 'otros' ? CATEGORY_OTHER_COLOR : CATEGORY_COLORS[i % CATEGORY_COLORS.length]);

    if (totalEl) totalEl.textContent = grandTotal.toLocaleString(formatoNumeroActivo());
    if (headerTotalEl) headerTotalEl.textContent = `${grandTotal.toLocaleString(formatoNumeroActivo())} u.`;

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
        cutout: '68%',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${ctx.raw} unidades` } }
        }
      }
    });

    if (legendEl) {
      legendEl.innerHTML = labels.map((label, i) => {
        const pct = grandTotal > 0 ? (totals[i] / grandTotal) * 100 : 0;
        return `
          <div class="dash-legend-item">
            <span class="dash-legend-dot" style="background:${colors[i]}"></span>
            ${escapeHtml(label)} · ${totals[i].toLocaleString(formatoNumeroActivo())} u. (${pct.toLocaleString(formatoNumeroActivo(), { maximumFractionDigits: 0 })}%)
          </div>
        `;
      }).join('');
    }
  }

  // Antes cada actualización (tanto de productos como de pedidos)
  // volvía a destruir y recrear los 3 gráficos, aunque solo uno de
  // ellos dependiera de esos datos — por ejemplo, un cambio de stock
  // hacía parpadear también el gráfico de ventas sin motivo. Ahora
  // cada fuente de datos solo repinta los gráficos que realmente
  // dependen de ella.
  // ── Ventas de los últimos 30 días ────────────────────────────
  // A diferencia de todos los gráficos de arriba (que leen
  // productsCache/latestProducts, ya en memoria por los listeners de
  // Stock), este y el de "Producto más vendido" son los primeros que
  // necesitan /orders — se piden una sola vez con getOrders() (ver
  // init() más abajo), no con un listener en vivo: no hace falta que
  // el Dashboard se actualice al segundo exacto de cada venta, con
  // que se vea al entrar/recargar alcanza.
  function buildSalesChartData(orders) {
    const hoy = new Date();
    const dias = [];
    // 30 casillas, de más vieja a más nueva, aunque ese día no haya
    // tenido ninguna venta — así el gráfico siempre tiene la misma
    // forma (una línea plana en $0 los días sin ventas, no un hueco).
    for (let i = 29; i >= 0; i--) {
      const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - i);
      dias.push({ clave: d.toISOString().slice(0, 10), etiqueta: `${d.getDate()}/${d.getMonth() + 1}`, total: 0 });
    }
    const porClave = {};
    dias.forEach(d => { porClave[d.clave] = d; });

    const desde = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 29).getTime();
    orders.forEach(o => {
      if (!o.creadoEn || o.creadoEn < desde) return;
      const clave = new Date(o.creadoEn).toISOString().slice(0, 10);
      if (porClave[clave]) porClave[clave].total += Number(o.total) || 0;
    });

    return {
      labels: dias.map(d => d.etiqueta),
      totales: dias.map(d => d.total),
      granTotal: dias.reduce((s, d) => s + d.total, 0)
    };
  }

  function renderSalesChart(orders) {
    const panel = document.getElementById('dashSalesPanel');
    const canvas = document.getElementById('chartVentas30d');
    if (!panel || !canvas || !window.Chart) return;
    panel.style.display = '';

    const { labels, totales, granTotal } = buildSalesChartData(orders);
    const totalEl = document.getElementById('dashSalesTotal30d');
    if (totalEl) totalEl.textContent = 'S/ ' + granTotal.toLocaleString(formatoNumeroActivo(), { maximumFractionDigits: 0 });

    if (salesChart) { salesChart.destroy(); salesChart = null; }
    salesChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: totales,
          borderColor: CATEGORY_COLORS[0],
          backgroundColor: CATEGORY_COLORS[1] + '22', // relleno suave bajo la línea, mismo azul con alpha
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => 'S/ ' + Number(ctx.raw).toLocaleString(formatoNumeroActivo(), { maximumFractionDigits: 0 }) } }
        },
        scales: {
          x: { ticks: { maxTicksLimit: 8 }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { callback: v => 'S/ ' + v } }
        }
      }
    });
  }

  // ── Producto más vendido ─────────────────────────────────────
  // Suma cantidades por código de producto en TODOS los items de
  // TODOS los pedidos de los últimos 30 días — un pedido con 3
  // productos distintos aporta a 3 productos, no a 1.
  function buildTopProductsData(orders) {
    const hoy = new Date();
    const desde = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 29).getTime();
    const porCodigo = {};

    orders.forEach(o => {
      if (!o.creadoEn || o.creadoEn < desde) return;
      (o.items || []).forEach(item => {
        const codigo = item.codigo || item.code;
        if (!codigo) return;
        if (!porCodigo[codigo]) porCodigo[codigo] = { codigo, nombre: item.nombre || item.name || codigo, cantidad: 0 };
        porCodigo[codigo].cantidad += Number(item.cantidad || item.qty) || 0;
      });
    });

    return Object.values(porCodigo).sort((a, b) => b.cantidad - a.cantidad).slice(0, 5);
  }

  function renderTopProductsPanel(orders) {
    const panel = document.getElementById('dashTopProductsPanel');
    const list = document.getElementById('dashTopProductsList');
    if (!panel || !list) return;
    panel.style.display = '';

    const top = buildTopProductsData(orders);
    if (!top.length) {
      list.innerHTML = '<p class="dash-empty">Todavía no hay ventas en los últimos 30 días.</p>';
      return;
    }
    const maxCantidad = top[0].cantidad;
    list.innerHTML = top.map(p => `
      <div class="dash-row">
        <div class="dash-row-main">
          <div class="dash-row-title">${escapeHtml(p.nombre)}</div>
          <div class="dash-mini-bar-track"><div class="dash-mini-bar-fill" style="width:${maxCantidad ? (p.cantidad / maxCantidad) * 100 : 0}%"></div></div>
        </div>
        <div class="dash-row-value">${p.cantidad.toLocaleString(formatoNumeroActivo())} u.</div>
      </div>
    `).join('');
  }

  function renderProductCharts() {
    // El panel de almacenes ya no depende de Chart.js (ver
    // renderWarehousePanel) — se pinta de inmediato, sin esperar a
    // que cargue la librería, y sigue funcionando aunque
    // loadChartJs() falle (ej. red bloqueada).
    renderWarehousePanel(latestProducts);
    loadChartJs().then(() => {
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
            }
            // false explícito = apagada; cualquier otro valor (incluido
            // "nunca configurado") se lee como prendida, igual que el
            // resto de estos toggles.
            alertaDashboardActiva = !(cfg && cfg.alertaStockDashboard === false);
            if (latestProducts.length) renderStockStats(latestProducts);
          })
          .catch(() => {}); // valores por defecto ya están puestos arriba
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
        renderAdvancedPanel(latestProducts);
      });

      // Clientes: solo se pide el dato si el plan lo usa en algún
      // lado (Medio/Premium) — en Básico la tarjeta ya queda oculta
      // arriba, así que ni tiene sentido abrir el listener de
      // /clients (una lectura menos, sin nada que mostrar con ella).
      if (aplicarVisibilidadClientes()) {
        watchClients(clients => {
          renderClientStats(clients || []);
          renderUpcomingBirthdays(clients || []);
        });

        // Ventas de los últimos 30 días + Producto más vendido —
        // lectura puntual (no un listener en vivo, ver el comentario
        // grande junto a buildSalesChartData()). loadChartJs() ya
        // corre en paralelo para el gráfico de categorías; si todavía
        // no terminó para cuando lleguen los pedidos, renderSalesChart()
        // se sale sola (chequea window.Chart) — se vuelve a intentar
        // la próxima vez que el Dashboard se recargue.
        if (typeof getOrders === 'function') {
          getOrders()
            .then(orders => {
              loadChartJs().then(() => renderSalesChart(orders || [])).catch(() => {});
              renderTopProductsPanel(orders || []);
            })
            .catch(() => {});
        }
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

  // Mismo patrón que setUmbralStock() de arriba, pero para el toggle
  // de "Alerta en el dashboard".
  function setAlertaDashboard(activa) {
    alertaDashboardActiva = !!activa;
    if (latestProducts.length) renderStockStats(latestProducts);
  }

  // Llamado desde Configuración cuando se guarda un formato de
  // números nuevo en la misma sesión (SPA) — formatoNumeroActivo()
  // ya está actualizado (ver setFormatoNumero en firebase.js), acá
  // solo falta repintar lo que ya estaba en pantalla con el formato
  // viejo.
  function refreshFormatoNumero() {
    if (!latestProducts.length) return;
    renderStockStats(latestProducts);
    renderProductCharts();
    renderProfitPanel(latestProducts);
    renderAdvancedPanel(latestProducts);
  }

  // Llamado desde auth-guard.js cuando el plan de la tienda cambia en
  // vivo (el súper-admin lo sube/baja desde Facturación), para que la
  // etiqueta de plan y el panel de Rentabilidad se actualicen al
  // toque si la persona ya está parada en el Dashboard — sin esto,
  // se quedarían mostrando el plan viejo hasta la próxima recarga.
  function refreshPlan() {
    renderPlanBadge();
    if (latestProducts.length) {
      renderProfitPanel(latestProducts);
      renderAdvancedPanel(latestProducts);
    }
  }

  return { init, setUmbralStock, setAlertaDashboard, refreshFormatoNumero, refreshPlan };
})();
