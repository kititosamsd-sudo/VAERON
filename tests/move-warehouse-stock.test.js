// tests/move-warehouse-stock.test.js
//
// Verifica moveWarehouseStock(): mover N unidades de un almacén a
// otro debe dejar el total /stock intacto (es el mismo total, solo
// cambia dónde está guardado), restar del origen, sumar en el
// destino, y rechazar el movimiento si no alcanza el stock de origen
// (sin tocar nada en ese caso).

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, tiendaStore } = require('./helpers/load-app');

const TIENDA_TEST = 'tienda-test-mover-stock';

test('moveWarehouseStock: mueve cantidad de un almacén a otro sin alterar el total', async () => {
  const { window, firebase } = loadApp(['firebase.js'], '', TIENDA_TEST);
  const store = tiendaStore(firebase, TIENDA_TEST);
  store.products = {
    'GTR-1': { name: 'Guitarra', price: 500, stock: 10, almacenes: { alm1: 10 }, category: 'general' }
  };

  await window.moveWarehouseStock('GTR-1', 'alm1', 'alm2', 4);

  const p = store.products['GTR-1'];
  assert.equal(p.almacenes.alm1, 6);
  assert.equal(p.almacenes.alm2, 4);
  assert.equal(p.stock, 10, 'el total no debe cambiar, solo la distribución');
});

test('moveWarehouseStock: rechaza mover más de lo que hay en el origen, sin tocar nada', async () => {
  const { window, firebase } = loadApp(['firebase.js'], '', TIENDA_TEST + '-2');
  const store = tiendaStore(firebase, TIENDA_TEST + '-2');
  store.products = {
    'GTR-1': { name: 'Guitarra', price: 500, stock: 5, almacenes: { alm1: 5 }, category: 'general' }
  };

  await assert.rejects(() => window.moveWarehouseStock('GTR-1', 'alm1', 'alm2', 9));

  const p = store.products['GTR-1'];
  assert.equal(p.almacenes.alm1, 5, 'el origen no debe cambiar si el movimiento se rechaza');
  assert.equal(p.almacenes.alm2, undefined, 'el destino no debe crearse si el movimiento se rechaza');
  assert.equal(p.stock, 5);
});

test('moveWarehouseStock: rechaza mover al mismo almacén', async () => {
  const { window, firebase } = loadApp(['firebase.js'], '', TIENDA_TEST + '-3');
  const store = tiendaStore(firebase, TIENDA_TEST + '-3');
  store.products = {
    'GTR-1': { name: 'Guitarra', price: 500, stock: 5, almacenes: { alm1: 5 }, category: 'general' }
  };

  await assert.rejects(() => window.moveWarehouseStock('GTR-1', 'alm1', 'alm1', 2));
  assert.equal(store.products['GTR-1'].almacenes.alm1, 5);
});
