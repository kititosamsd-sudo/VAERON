// tests/historial-notas.test.js
//
// Verifica formatClienteOrden() (cliente de una nota puede venir con
// RUC completo, o creado al vuelo con un solo dato — nombre, RUC o
// DNI) y watchOrders() (listener de /orders usado por Historial).

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, tiendaStore } = require('./helpers/load-app');

test('formatClienteOrden: cliente normal (nombre + RUC de la búsqueda)', () => {
  const { window } = loadApp(['firebase.js'], '', 'tienda-fmt-1');
  assert.equal(
    window.formatClienteOrden({ nombre: 'A & J Music', ruc: '20552895357' }),
    'A & J Music (RUC 20552895357)'
  );
});

test('formatClienteOrden: creado al vuelo solo con nombre', () => {
  const { window } = loadApp(['firebase.js'], '', 'tienda-fmt-2');
  assert.equal(window.formatClienteOrden({ nombre: 'Juan Pérez' }), 'Juan Pérez');
});

test('formatClienteOrden: creado al vuelo solo con DNI', () => {
  const { window } = loadApp(['firebase.js'], '', 'tienda-fmt-3');
  assert.equal(window.formatClienteOrden({ dni: '45678912' }), 'DNI 45678912');
});

test('formatClienteOrden: creado al vuelo solo con RUC', () => {
  const { window } = loadApp(['firebase.js'], '', 'tienda-fmt-4');
  assert.equal(window.formatClienteOrden({ ruc: '20552895357' }), 'RUC 20552895357');
});

test('watchOrders: recibe las notas guardadas con saveOrder', async () => {
  const TIENDA = 'tienda-watch-orders';
  const { window, firebase } = loadApp(['firebase.js'], '', TIENDA);
  const store = tiendaStore(firebase, TIENDA);

  const recibidas = await new Promise(resolve => {
    window.watchOrders(list => {
      if (list.length === 2) resolve(list);
    });
    window.saveOrder({ numero: 1, numeroFormateado: 'NP-2026-1', cliente: { nombre: 'Cliente Uno' }, items: [], total: 100 })
      .then(() => window.saveOrder({ numero: 2, numeroFormateado: 'NP-2026-2', cliente: { dni: '11112222' }, items: [], total: 50 }));
  });

  assert.equal(recibidas.length, 2);
  const numeros = recibidas.map(o => o.numero).sort((a, b) => a - b);
  assert.equal(numeros[0], 1);
  assert.equal(numeros[1], 2);
});
