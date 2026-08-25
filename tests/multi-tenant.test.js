// tests/multi-tenant.test.js
//
// Prueba el problema puntual que motivó este cambio: que el
// catálogo de una tienda sea de verdad privado — otra tienda (o el
// súper-admin, o una sesión sin tienda) NUNCA debe poder leer ni
// escribir esos datos. También cubre el panel de "Tiendas" del
// súper-admin (crear, listar, suspender/reactivar).

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, tiendaStore, setCurrentTiendaId } = require('./helpers/load-app');

function setupSinTienda() {
  // Sin currentTiendaId (como estaría el súper-admin, que no
  // pertenece a ninguna tienda) — a propósito, para probar el bloqueo.
  return loadApp(['firebase.js']);
}

test('el catálogo de una tienda es invisible para otra: guardar en Tienda A no aparece en Tienda B', async () => {
  const { window, firebase } = loadApp(['firebase.js'], '', 'tienda-a');
  await window.saveProduct('GTR-001', { name: 'Guitarra de la Tienda A', desc: '', price: 100, stock: 5, category: 'general' }, undefined, true);

  // Misma ventana/app, pero ahora "entra" a otra tienda.
  setCurrentTiendaId(window, 'tienda-b');
  let productosB = null;
  window.watchProducts(list => { productosB = list; });
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(productosB.length, 0, 'la Tienda B no debe ver ningún producto de la Tienda A');

  // Confirma también en el store crudo: cada tienda tiene su propio
  // nodo, GTR-001 solo existe bajo tiendas/tienda-a/products.
  assert.ok(firebase._store.tiendas['tienda-a'].products['GTR-001'], 'el producto debe existir en el nodo de la Tienda A');
  assert.equal(firebase._store.tiendas['tienda-b'], undefined, 'la Tienda B no debe tener ningún nodo creado');
});

test('sin una tienda activa (ej. el súper-admin) no se puede leer ni escribir el catálogo', async () => {
  const { window } = setupSinTienda();
  assert.throws(
    () => window.getClient('20123456789'),
    /tienda activa/i,
    'debe rechazar en vez de leer un catálogo "por defecto" que no le pertenece a nadie'
  );
});

test('crearTienda: registra la tienda, su primer admin, y la cuenta que lo conecta con su tienda', async () => {
  const { window, firebase } = loadApp(['firebase.js']);
  const { tiendaId, uid } = await window.crearTienda('Guitarrería Central', 'Carlos Pérez', 'carlos@guitarreriacentral.com', 'clave123', { telefono: '987654321', ciudad: 'Lima', direccion: 'Av. Los Músicos 123' });

  assert.ok(tiendaId, 'debe devolver un tiendaId');
  assert.ok(uid, 'debe devolver el uid de Auth del admin creado');

  const info = firebase._store.tiendas[tiendaId].info;
  assert.equal(info.nombre, 'Guitarrería Central');
  assert.equal(info.estado, 'activa', 'una tienda nueva debe empezar activa');

  const perfilAdmin = firebase._store.tiendas[tiendaId].usuarios[uid];
  assert.equal(perfilAdmin.nombre, 'Carlos Pérez');
  assert.equal(perfilAdmin.rol, 'admin');

  const cuenta = firebase._store.cuentas[uid];
  assert.equal(cuenta.rol, 'admin');
  assert.equal(cuenta.tiendaId, tiendaId, 'la cuenta debe apuntar a la tienda recién creada, para que el login sepa a dónde llevarlo');
});

test('setTiendaEstado + listarTiendas: suspender una tienda se refleja en el panel del súper-admin', async () => {
  const { window, firebase } = loadApp(['firebase.js']);
  const { tiendaId } = await window.crearTienda('Tienda de prueba', 'Admin', 'admin@tiendadeprueba.com', 'clave123', { telefono: '987654321', ciudad: 'Lima', direccion: 'Av. Los Músicos 123' });

  let tiendas = await window.listarTiendas();
  const tienda = tiendas.find(t => t.tiendaId === tiendaId);
  assert.equal(tienda.estado, 'activa');

  await window.setTiendaEstado(tiendaId, 'suspendida', tienda.proyecto);
  tiendas = await window.listarTiendas();
  assert.equal(tiendas.find(t => t.tiendaId === tiendaId).estado, 'suspendida');
});

test('createVendorAccount: el vendedor queda registrado bajo la tienda de quien lo creó, no en un lugar compartido', async () => {
  const { window, firebase } = loadApp(['firebase.js'], '', 'tienda-a');
  const uid = await window.createVendorAccount('pedro', 'clave123', 'Pedro Ruiz', 'pedro@tienda-a.com');

  const store = tiendaStore(firebase, 'tienda-a');
  assert.equal(store.usuarios[uid].nombre, 'Pedro Ruiz');
  assert.equal(firebase._store.cuentas[uid].tiendaId, 'tienda-a', 'la cuenta del vendedor debe quedar ligada a la tienda donde lo crearon, no a otra');
});
