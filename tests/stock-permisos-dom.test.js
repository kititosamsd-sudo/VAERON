// =========================================================
// stock.js — permisos de edición y flujo de agregar producto (DOM
// real)
// =========================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEntornoStock, prepararTienda, normalizar } = require('./helpers/load-firebase-env.js');

function nuevoEntorno() {
  const window = crearEntornoStock();
  prepararTienda(window, 'tienda-1');
  window.__alerts = [];
  window.alert = msg => { window.__alerts.push(msg); };
  return window;
}

function esperar() {
  return new Promise(r => setTimeout(r, 0));
}

test('un vendedor sin el permiso de editar Stock no puede abrir "Agregar producto"', () => {
  const window = nuevoEntorno();
  window.currentUserRole = 'vendedor';
  window.puedeEditarStock = () => false;

  window.openAddModal();

  assert.equal(window.document.getElementById('addModal').classList.contains('open'), false);
});

test('un admin sí puede abrir "Agregar producto"', () => {
  const window = nuevoEntorno();
  window.openAddModal();
  assert.equal(window.document.getElementById('addModal').classList.contains('open'), true);
});

test('addProduct() crea el producto con los datos del formulario', async () => {
  const window = nuevoEntorno();
  const d = window.document;
  window.openAddModal();
  d.getElementById('addName').value = 'Guitarra Acústica';
  d.getElementById('addCode').value = 'GTR-001';
  d.getElementById('addStock').value = '5';
  d.getElementById('addPrice').value = '850';

  window.addProduct();
  await esperar();

  const snap = await window.refProducts.child('GTR-001').once('value');
  const p = normalizar(snap.val());
  assert.equal(p.name, 'Guitarra Acústica');
  assert.equal(p.stock, 5);
  assert.equal(p.price, 850);
  assert.equal(window.document.getElementById('addModal').classList.contains('open'), false, 'debería cerrar el modal al guardar bien');
});

test('addProduct() no deja registrar dos productos con el mismo código', async () => {
  const window = nuevoEntorno();
  window.__setProductsCache([{ code: 'GTR-001', name: 'Ya existente' }]);
  const d = window.document;
  d.getElementById('addName').value = 'Otra guitarra';
  d.getElementById('addCode').value = 'GTR-001';

  window.addProduct();
  await esperar();

  assert.equal(window.__alerts.length, 1);
  assert.match(window.__alerts[0], /Ya existe un producto/);
});

test('addProduct() sin nombre o sin código no guarda nada', async () => {
  const window = nuevoEntorno();
  window.document.getElementById('addCode').value = 'SOLO-CODIGO';

  window.addProduct();
  await esperar();

  assert.equal(window.__alerts.length, 1);
  const snap = await window.refProducts.child('SOLO-CODIGO').once('value');
  assert.equal(snap.val(), null);
});

test('applyStockRoleRestrictions(): un vendedor sin permiso no ve los botones de editar/agregar/importar', () => {
  const window = nuevoEntorno();
  window.currentUserRole = 'vendedor';
  window.puedeEditarStock = () => false;

  window.applyStockRoleRestrictions();

  const d = window.document;
  assert.equal(d.querySelector('.btn-new-item').style.display, 'none');
  assert.equal(d.getElementById('btnSelectMode').style.display, 'none');
});

test('applyStockRoleRestrictions(): un vendedor CON el permiso activado sí ve esos botones', () => {
  const window = nuevoEntorno();
  window.currentUserRole = 'vendedor';
  window.puedeEditarStock = () => true;

  window.applyStockRoleRestrictions();

  const d = window.document;
  assert.notEqual(d.querySelector('.btn-new-item').style.display, 'none');
});

test('applyStockRoleRestrictions(): un admin nunca queda restringido (la función no le toca nada)', () => {
  const window = nuevoEntorno();
  const d = window.document;
  const displayOriginal = d.querySelector('.btn-new-item').style.display;

  window.applyStockRoleRestrictions();

  assert.equal(d.querySelector('.btn-new-item').style.display, displayOriginal);
});

test('switchWarehouse(): los botones de importar/exportar de UN almacén puntual solo se ven con el permiso activo y parado en ese almacén', () => {
  const window = nuevoEntorno();
  const d = window.document;

  window.currentUserRole = 'vendedor';
  window.puedeEditarStock = () => false;
  window.switchWarehouse('alm1');
  assert.equal(d.getElementById('btnImportWarehouse').style.display, 'none');

  window.puedeEditarStock = () => true;
  window.switchWarehouse('alm1');
  assert.notEqual(d.getElementById('btnImportWarehouse').style.display, 'none');

  // Parado en "Todos los almacenes" (sin almacén puntual), los
  // botones de UN almacén se ocultan aunque el permiso esté activo —
  // ahí corresponden los de "Todos", no estos.
  window.switchWarehouse('');
  assert.equal(d.getElementById('btnImportWarehouse').style.display, 'none');
});
