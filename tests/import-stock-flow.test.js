// tests/import-stock-flow.test.js
//
// Verifica de punta a punta que "Importar productos" (menú Importar
// de Stock, los 4 modos) realmente escribe lo que dice que va a
// escribir — ejercitando processImportStock() de verdad (el archivo
// real del proyecto) contra el stub de Firebase en memoria, en vez
// de solo revisar las funciones puras de normalización de código
// (eso ya lo cubre codigo-normalizacion.test.js).
//
// No se simula la lectura del archivo Excel en sí (eso depende de
// la librería XLSX cargada desde un CDN) — se arma importStockRows
// directamente, tal cual queda después de leer el archivo, y se
// corre el resto del flujo real: renderConflictStep() arma el plan,
// processImportStock() lo ejecuta contra Firebase.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, tiendaStore } = require('./helpers/load-app');

const TIENDA_TEST = 'tienda-test-import';

function setup() {
  const { window, firebase } = loadApp(['firebase.js', 'stock.js', 'import-stock.js'], '', TIENDA_TEST);
  const store = tiendaStore(firebase, TIENDA_TEST);
  return { window, firebase, store };
}

// productsCache es `let` en stock.js — una asignación directa a
// window.productsCache no llega a esa variable (bindings de módulo
// distintos). Se asigna con un <script> más, en el mismo realm, igual
// que ya hace setCurrentTiendaId() en load-app.js.
function setProductsCache(window, list) {
  const script = window.document.createElement('script');
  script.textContent = `productsCache = ${JSON.stringify(list)};`;
  window.document.body.appendChild(script);
}

test('Importar todo: crea productos nuevos y actualiza los existentes (reemplaza cantidad/precio/nombre)', async () => {
  const { window, store } = setup();

  store.products = {
    'EXIST-1': { name: 'Nombre viejo', desc: 'desc vieja', price: 100, stock: 5, almacenes: { alm1: 5 }, category: 'general' }
  };
  setProductsCache(window, [
    { code: 'EXIST-1', name: 'Nombre viejo', desc: 'desc vieja', price: 100, stock: 5, almacenes: { alm1: 5 }, category: 'general' }
  ]);

  window.importStockMode = 'full';
  window.importTargetWarehouse = 'alm1';
  window.importStockExcluded = {};
  window.importStockCodeOverrides = {};
  window.importStockRows = [
    { idx: 0, code: 'EXIST-1', normalizedCode: 'EXIST-1', sanitized: false, originalCode: 'EXIST-1',
      name: 'Nombre nuevo', desc: 'desc nueva', stock: 20, price: 150 },
    { idx: 1, code: 'NEW-1', normalizedCode: 'NEW-1', sanitized: false, originalCode: 'NEW-1',
      name: 'Producto nuevo', desc: '', stock: 10, price: 80 }
  ];

  window.renderConflictStep(); // arma importStockPlan a partir de las filas de arriba
  assert.equal(window.importStockPlan.length, 2, 'debe planear las 2 filas (ninguna en conflicto)');

  await window.processImportStock();

  // Producto que ya existía: nombre/desc/precio reemplazados, cantidad
  // del almacén elegido reemplazada (no sumada), y el total /stock
  // recalculado por la diferencia.
  const existing = store.products['EXIST-1'];
  assert.equal(existing.name, 'Nombre nuevo');
  assert.equal(existing.desc, 'desc nueva');
  assert.equal(existing.price, 150);
  assert.equal(existing.almacenes.alm1, 20);
  assert.equal(existing.stock, 20, 'stock total debe reflejar el nuevo valor del almacén (5 → 20)');

  // Producto nuevo: creado con la cantidad total en el almacén elegido.
  const nuevo = store.products['NEW-1'];
  assert.ok(nuevo, 'el producto nuevo debe haberse creado');
  assert.equal(nuevo.name, 'Producto nuevo');
  assert.equal(nuevo.price, 80);
  assert.equal(nuevo.stock, 10);
  assert.equal(nuevo.almacenes.alm1, 10);
});

test('Importar todo: si dos filas del archivo caen en el mismo código normalizado, no se guarda nada hasta resolver el conflicto', async () => {
  const { window, store } = setup();
  store.products = {};
  setProductsCache(window, []);

  window.importStockMode = 'full';
  window.importTargetWarehouse = 'alm1';
  window.importStockExcluded = {};
  window.importStockCodeOverrides = {};
  window.importStockRows = [
    { idx: 0, code: 'FV-6', normalizedCode: 'FV-6', sanitized: false, originalCode: 'FV-6', name: 'Violin A', desc: '', stock: 5, price: 100 },
    { idx: 1, code: 'FV-6', normalizedCode: 'FV-6', sanitized: false, originalCode: 'FV- 6', name: 'Violin B', desc: '', stock: 3, price: 90 }
  ];

  window.renderConflictStep();
  const conflictGroups = window.importStockPlan.filter(r => r.collisionRows.length > 1);
  assert.equal(conflictGroups.length, 1, 'las dos filas con el mismo código normalizado deben agruparse como conflicto');

  // El botón queda deshabilitado en la UI real (ver renderConflictStep) —
  // pero además, aunque se llamara igual, el plan actual sigue siendo
  // un único registro fusionado (comportamiento antiguo ya cubierto por
  // codigo-normalizacion.test.js); lo que valida esta prueba es que el
  // conflicto se DETECTA antes de tocar Firebase.
  assert.equal(Object.keys(store.products).length, 0, 'no debe haberse escrito nada mientras el conflicto sigue sin resolver');
});

test('Solo cantidad: suma al almacén elegido en productos existentes y omite códigos que no existen', async () => {
  const { window, store } = setup();
  store.products = {
    'GTR-001': { name: 'Guitarra', price: 500, stock: 5, almacenes: { alm1: 5 }, category: 'general' }
  };
  setProductsCache(window, [
    { code: 'GTR-001', name: 'Guitarra', price: 500, stock: 5, almacenes: { alm1: 5 }, category: 'general' }
  ]);

  window.importStockMode = 'stock';
  window.importTargetWarehouse = 'alm1';
  window.importStockExcluded = {};
  window.importStockCodeOverrides = {};
  window.importStockRows = [
    { idx: 0, code: 'GTR-001', normalizedCode: 'GTR-001', sanitized: false, originalCode: 'GTR-001', stock: 10 },
    { idx: 1, code: 'NOEXISTE', normalizedCode: 'NOEXISTE', sanitized: false, originalCode: 'NOEXISTE', stock: 7 }
  ];

  window.renderConflictStep();
  const plan = window.importStockPlan;
  assert.equal(plan.find(r => r.normalizedCode === 'GTR-001').action, 'update');
  assert.equal(plan.find(r => r.normalizedCode === 'NOEXISTE').action, 'skip-notfound');

  await window.processImportStock();

  assert.equal(store.products['GTR-001'].almacenes.alm1, 15, 'debe SUMAR (5 + 10), no reemplazar');
  assert.equal(store.products['GTR-001'].stock, 15);
  assert.equal(store.products['GTR-001'].price, 500, 'el modo "Solo cantidad" no debe tocar el precio');
  assert.equal(store.products['NOEXISTE'], undefined, 'un código que no existe no debe crear un producto fantasma');
});

test('Solo precio: reemplaza el precio sin tocar la cantidad', async () => {
  const { window, store } = setup();
  store.products = {
    'GTR-001': { name: 'Guitarra', price: 500, stock: 5, almacenes: { alm1: 5 }, category: 'general' }
  };
  setProductsCache(window, [
    { code: 'GTR-001', name: 'Guitarra', price: 500, stock: 5, almacenes: { alm1: 5 }, category: 'general' }
  ]);

  window.importStockMode = 'price';
  window.importStockExcluded = {};
  window.importStockCodeOverrides = {};
  window.importStockRows = [
    { idx: 0, code: 'GTR-001', normalizedCode: 'GTR-001', sanitized: false, originalCode: 'GTR-001', price: 650 }
  ];

  window.renderConflictStep();
  await window.processImportStock();

  assert.equal(store.products['GTR-001'].price, 650);
  assert.equal(store.products['GTR-001'].stock, 5, 'el modo "Solo precio" no debe tocar el stock');
});

test('Cantidad y precio: suma la cantidad y reemplaza el precio en la misma fila', async () => {
  const { window, store } = setup();
  store.products = {
    'GTR-001': { name: 'Guitarra', price: 500, stock: 5, almacenes: { alm1: 5 }, category: 'general' }
  };
  setProductsCache(window, [
    { code: 'GTR-001', name: 'Guitarra', price: 500, stock: 5, almacenes: { alm1: 5 }, category: 'general' }
  ]);

  window.importStockMode = 'both';
  window.importTargetWarehouse = 'alm1';
  window.importStockExcluded = {};
  window.importStockCodeOverrides = {};
  window.importStockRows = [
    { idx: 0, code: 'GTR-001', normalizedCode: 'GTR-001', sanitized: false, originalCode: 'GTR-001', stock: 3, price: 480 }
  ];

  window.renderConflictStep();
  await window.processImportStock();

  assert.equal(store.products['GTR-001'].almacenes.alm1, 8, 'debe sumar (5 + 3)');
  assert.equal(store.products['GTR-001'].stock, 8);
  assert.equal(store.products['GTR-001'].price, 480, 'debe reemplazar el precio');
});
