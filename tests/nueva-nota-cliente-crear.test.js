// tests/nueva-nota-cliente-crear.test.js
//
// Verifica el flujo de crear una nota con un cliente "al vuelo"
// (solo nombre, solo RUC, o solo DNI — sin que exista un registro en
// Clientes) de punta a punta contra Firebase real simulado.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, tiendaStore } = require('./helpers/load-app');

function setupNota(tiendaId) {
  const { window, firebase } = loadApp(
    ['firebase.js', 'stock.js', 'pedidos-logic.js', 'nueva-nota-logic.js'],
    '', tiendaId
  );
  const store = tiendaStore(firebase, tiendaId);
  const scriptSet = (varName, value) => {
    const s = window.document.createElement('script');
    s.textContent = `${varName} = ${JSON.stringify(value)};`;
    window.document.body.appendChild(s);
  };
  return { window, firebase, store, scriptSet };
}

test('Nueva Nota: crear cliente al vuelo solo con DNI, guarda la nota correctamente', async () => {
  const TIENDA = 'tienda-crear-dni';
  const { window, store, scriptSet } = setupNota(TIENDA);
  scriptSet('productsCache', [{ code: 'X-1', name: 'Producto X', price: 20, stock: 10, almacenes: { alm1: 10 }, category: 'general' }]);
  scriptSet('clientsCache', []);

  window.notaCliente = { nombre: '', ruc: '', dni: '12345678', ciudad: '' };
  window.notaItems = [{ codigo: 'X-1', nombre: 'Producto X', cantidad: 2, precio: 20 }];
  window.notaDescuentoPct = 0;
  window.notaNumero = 1;
  window.notaAnio = 2026;

  // Evita que guardarNota intente tocar el DOM real de botones (no
  // montamos la vista completa en esta prueba) — se llama a la parte
  // que sí nos interesa verificar sin pasar por la UI.
  const subtotal = 40;
  await window.saveOrder({
    numero: 1, numeroFormateado: 'NP-2026-1',
    cliente: window.notaCliente, items: window.notaItems,
    descuentoPct: 0, subtotal, total: subtotal
  });

  const guardadas = Object.values(store.orders || {});
  assert.equal(guardadas.length, 1);
  assert.equal(guardadas[0].cliente.dni, '12345678');
  assert.equal(guardadas[0].cliente.nombre, '');
  assert.equal(window.formatClienteOrden(guardadas[0].cliente), 'DNI 12345678');
});

test('Nueva Nota: crear cliente al vuelo solo con nombre', async () => {
  const TIENDA = 'tienda-crear-nombre';
  const { window, store, scriptSet } = setupNota(TIENDA);
  scriptSet('clientsCache', []);

  window.notaCliente = { nombre: 'Cliente Ocasional', ruc: '', dni: '', ciudad: '' };

  await window.saveOrder({
    numero: 5, numeroFormateado: 'NP-2026-5',
    cliente: window.notaCliente, items: [{ codigo: 'X-1', nombre: 'Producto X', cantidad: 1, precio: 10 }],
    descuentoPct: 0, subtotal: 10, total: 10
  });

  const guardadas = Object.values(store.orders || {});
  assert.equal(guardadas[0].cliente.nombre, 'Cliente Ocasional');
  assert.equal(window.formatClienteOrden(guardadas[0].cliente), 'Cliente Ocasional');
});

test('Nueva Nota: confirmarCrearClienteNota arma notaCliente según el tipo elegido', () => {
  const TIENDA = 'tienda-confirmar-crear';
  const { window } = setupNota(TIENDA);

  // No se monta la vista completa acá — solo el pedacito de DOM que
  // esta función necesita (los mismos ids que views/nueva-nota-view.html).
  window.document.body.innerHTML += `
    <div id="notaClienteBuscador">
      <div id="notaClienteCrearForm">
        <button class="nota-pill" data-tipo="nombre"></button>
        <button class="nota-pill" data-tipo="ruc"></button>
        <button class="nota-pill" data-tipo="dni"></button>
        <input id="notaClienteValorInput">
      </div>
      <button id="btnAbrirCrearClienteNota"></button>
    </div>
    <div id="notaClienteInfo">
      <div id="notaClienteNombre"></div>
      <div id="notaClienteSubinfo"></div>
    </div>`;

  // Simula lo que hace la UI: elegir tipo "ruc" y escribir un valor.
  window.setTipoClienteNota('ruc');
  window.document.getElementById('notaClienteValorInput').value = '20552895357';
  window.confirmarCrearClienteNota();

  // notaCliente es `let` dentro de nueva-nota-logic.js — no es una
  // propiedad de window, así que se lee con un <script> más (mismo
  // truco que ya usa este proyecto para leer/escribir productsCache
  // desde las pruebas).
  const readScript = window.document.createElement('script');
  readScript.textContent = 'window.__notaClienteLeido = notaCliente;';
  window.document.body.appendChild(readScript);
  const leido = window.__notaClienteLeido;

  assert.equal(leido.ruc, '20552895357');
  assert.equal(leido.nombre, '');
  assert.equal(leido.dni, '');
});
