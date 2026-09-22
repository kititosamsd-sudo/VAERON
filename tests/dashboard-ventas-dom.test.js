// =========================================================
// Dashboard — Ventas de los últimos 30 días y Producto más vendido
// =========================================================
// buildSalesChartData()/buildTopProductsData() son privadas al
// closure de window.Dashboard (nunca están en su "return {...}")
// — estos tests pasan por Dashboard.init() de verdad y verifican el
// resultado en el DOM, no llaman a esas funciones sueltas.
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEntornoDashboard, prepararTienda } = require('./helpers/load-firebase-env.js');

const UN_DIA = 86400000;

function nuevoEntorno() {
  const window = crearEntornoDashboard();
  prepararTienda(window, 'tienda-1');
  // Chart.js real se baja de un <script src> — no hay red en este
  // test, así que se stubea con lo mínimo que
  // renderSalesChart() necesita: que exista window.Chart, y que la
  // instancia tenga .destroy() (se llama al re-renderizar).
  window.Chart = function () { this.destroy = () => {}; };
  return window;
}

function esperar() {
  return new Promise(r => setTimeout(r, 100));
}

test('con pedidos en los últimos 30 días, muestra el total sumado y el panel visible', async () => {
  const window = nuevoEntorno();
  const hoy = Date.now();
  await window.refOrders.push({ total: 100, subtotal: 100, creadoEn: hoy - 2 * UN_DIA, items: [] });
  await window.refOrders.push({ total: 80, subtotal: 80, creadoEn: hoy - 1 * UN_DIA, items: [] });

  window.Dashboard.init();
  await esperar();

  const d = window.document;
  assert.notEqual(d.getElementById('dashSalesPanel').style.display, 'none');
  assert.equal(d.getElementById('dashSalesTotal30d').textContent, 'S/ 180');
});

test('un pedido de hace más de 30 días NO se cuenta en el total', async () => {
  const window = nuevoEntorno();
  const hoy = Date.now();
  await window.refOrders.push({ total: 100, subtotal: 100, creadoEn: hoy - 2 * UN_DIA, items: [] });
  await window.refOrders.push({ total: 999, subtotal: 999, creadoEn: hoy - 40 * UN_DIA, items: [] }); // fuera de ventana

  window.Dashboard.init();
  await esperar();

  assert.equal(window.document.getElementById('dashSalesTotal30d').textContent, 'S/ 100');
});

test('producto más vendido: suma cantidades del mismo código a través de varios pedidos distintos', async () => {
  const window = nuevoEntorno();
  const hoy = Date.now();
  await window.refOrders.push({ total: 10, subtotal: 10, creadoEn: hoy - 1 * UN_DIA, items: [{ codigo: 'P1', nombre: 'Guitarra', cantidad: 2 }] });
  await window.refOrders.push({ total: 10, subtotal: 10, creadoEn: hoy - 2 * UN_DIA, items: [{ codigo: 'P1', nombre: 'Guitarra', cantidad: 3 }] });
  await window.refOrders.push({ total: 10, subtotal: 10, creadoEn: hoy - 1 * UN_DIA, items: [{ codigo: 'P2', nombre: 'Bajo', cantidad: 1 }] });

  window.Dashboard.init();
  await esperar();

  const html = window.document.getElementById('dashTopProductsList').innerHTML;
  assert.match(html, /Guitarra[\s\S]*5 u\./, 'Guitarra debería sumar 2+3=5, y aparecer primero (más vendido)');
  const posGuitarra = html.indexOf('Guitarra');
  const posBajo = html.indexOf('Bajo');
  assert.ok(posGuitarra < posBajo, 'Guitarra (5 u.) debería listarse antes que Bajo (1 u.)');
});

test('un pedido con varios productos distintos aporta a cada uno, no solo al primero', async () => {
  const window = nuevoEntorno();
  const hoy = Date.now();
  await window.refOrders.push({
    total: 30, subtotal: 30, creadoEn: hoy - 1 * UN_DIA,
    items: [{ codigo: 'P1', nombre: 'Cuerdas', cantidad: 4 }, { codigo: 'P2', nombre: 'Púas', cantidad: 10 }]
  });

  window.Dashboard.init();
  await esperar();

  const html = window.document.getElementById('dashTopProductsList').innerHTML;
  assert.match(html, /Púas/);
  assert.match(html, /Cuerdas/);
});

test('sin ventas en los últimos 30 días, el panel de producto más vendido muestra el mensaje vacío, no un error', async () => {
  const window = nuevoEntorno();
  window.Dashboard.init();
  await esperar();

  assert.match(window.document.getElementById('dashTopProductsList').innerHTML, /Todavía no hay ventas/);
});

test('en plan Básico (sin Pedidos disponible), los paneles de ventas quedan ocultos', async () => {
  const window = crearEntornoDashboard();
  prepararTienda(window, 'tienda-1');
  window.currentTiendaPlan = 'basico';
  window.Chart = function () { this.destroy = () => {}; };

  const hoy = Date.now();
  await window.refOrders.push({ total: 100, subtotal: 100, creadoEn: hoy - 1 * UN_DIA, items: [] });

  window.Dashboard.init();
  await esperar();

  const d = window.document;
  assert.equal(d.getElementById('dashSalesPanel').style.display, 'none');
  assert.equal(d.getElementById('dashTopProductsPanel').style.display, 'none');
});
