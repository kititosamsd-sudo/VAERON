// tests/import-clientes-flow.test.js
//
// Antes, un solo Promise.all sobre todas las filas hacía que UN
// cliente fallido (ej. un rebote de Firebase) abortara el resto de
// la importación sin avisar cuántos sí se habían guardado. Esta
// prueba fuerza justo ese caso: un RUC que falla en medio del lote,
// y verifica que los demás igual queden guardados.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, tiendaStore } = require('./helpers/load-app');

test('saveImportedClientes: un cliente que falla no frena a los demás del lote', async () => {
  const TIENDA = 'tienda-import-clientes-fail';
  const { window, firebase } = loadApp(['firebase.js', 'import-clientes.js'], '', TIENDA);
  const store = tiendaStore(firebase, TIENDA);

  // DOM mínimo que la función toca (no se monta la vista completa).
  window.document.body.innerHTML += `
    <button id="btnProcesarImport"></button>
    <div id="importDoneMsg"></div>
  `;

  // saveClient es `function` (reasignable) — se reemplaza para que
  // el RUC "222" falle, simulando el rebote de Firebase real.
  const originalSaveClient = window.saveClient;
  window.saveClient = function(ruc, data) {
    if (ruc === '222') return Promise.reject(new Error('permission_denied (simulado)'));
    return originalSaveClient(ruc, data);
  };

  window.duplicateQueue = []; // ningún duplicado en esta prueba

  await window.saveImportedClientes([
    { ruc: '111', nombre: 'Cliente Uno', ciudad: 'Lima' },
    { ruc: '222', nombre: 'Cliente Dos (falla)', ciudad: 'Cusco' },
    { ruc: '333', nombre: 'Cliente Tres', ciudad: 'Trujillo' }
  ]);

  // Los dos que SÍ debían guardarse, quedaron guardados — la falla
  // del 222 no los frenó.
  assert.ok(store.clients && store.clients['111'], 'Cliente Uno debía quedar guardado');
  assert.ok(store.clients && store.clients['333'], 'Cliente Tres debía quedar guardado');
  assert.ok(!store.clients || !store.clients['222'], 'Cliente Dos no debía quedar guardado (falló a propósito)');

  // Y el mensaje final avisa de la falla en vez de un error genérico
  // que corta todo.
  const msg = window.document.getElementById('importDoneMsg').textContent;
  assert.match(msg, /2 clientes importados/);
  assert.match(msg, /1 no se pudo guardar/);
  assert.match(msg, /222/);
});
