// =========================================================
// CRM de clientes: campos nuevos + historial de compras
// =========================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEntornoFirebase, prepararTienda, normalizar } = require('./helpers/load-firebase-env.js');

function nuevoEntorno() {
  const window = crearEntornoFirebase();
  prepararTienda(window, 'tienda-1');
  return window;
}

async function leerCliente(window, ruc) {
  const snap = await window.refClients.child(ruc).once('value');
  return normalizar(snap.val());
}

test('saveClient() guarda los campos nuevos de CRM (teléfono, correo, cumpleaños, interés, notas)', async () => {
  const window = nuevoEntorno();
  await window.saveClient('20123456789', {
    nombre: 'Instrumentos del Sur', ciudad: 'Lima',
    telefono: '987654321', correo: 'contacto@sur.com',
    cumpleDia: 14, cumpleMes: 7,
    interes: 'busca un amplificador', notas: 'prefiere que lo llamen por la tarde'
  });

  const c = await leerCliente(window, '20123456789');
  assert.equal(c.telefono, '987654321');
  assert.equal(c.correo, 'contacto@sur.com');
  assert.equal(c.cumpleDia, 14);
  assert.equal(c.cumpleMes, 7);
  assert.equal(c.interes, 'busca un amplificador');
  assert.equal(c.notas, 'prefiere que lo llamen por la tarde');
});

test('los campos opcionales en null no quedan guardados como claves — Firebase los omite', async () => {
  const window = nuevoEntorno();
  await window.saveClient('20999999999', {
    nombre: 'Cliente Mínimo', ciudad: '',
    telefono: null, correo: null, cumpleDia: null, cumpleMes: null, interes: null, notas: null
  });

  const c = await leerCliente(window, '20999999999');
  assert.equal('telefono' in c, false);
  assert.equal('correo' in c, false);
  assert.equal('cumpleDia' in c, false);
  assert.equal('notas' in c, false);
  assert.equal(c.nombre, 'Cliente Mínimo');
});

test('getOrders() trae los pedidos de todas las tiendas... filtrados por ruc del cliente en el llamador', async () => {
  const window = nuevoEntorno();
  await window.refOrders.push({
    numero: 1, total: 150, subtotal: 150,
    cliente: { ruc: '20123456789', nombre: 'Instrumentos del Sur', ciudad: 'Lima' },
    creadoEn: 1000
  });
  await window.refOrders.push({
    numero: 2, total: 80, subtotal: 80,
    cliente: { ruc: '20999999999', nombre: 'Otro cliente', ciudad: 'Arequipa' },
    creadoEn: 2000
  });
  await window.refOrders.push({
    numero: 3, total: 220, subtotal: 220,
    cliente: { ruc: '20123456789', nombre: 'Instrumentos del Sur', ciudad: 'Lima' },
    creadoEn: 3000
  });

  const todos = normalizar(await window.getOrders());
  const deEsteCliente = todos.filter(o => o.cliente && o.cliente.ruc === '20123456789');

  assert.equal(todos.length, 3, 'getOrders() trae TODOS los pedidos de la tienda');
  assert.equal(deEsteCliente.length, 2, 'el filtro por ruc debe dejar solo los de ese cliente');
  const totalGastado = deEsteCliente.reduce((s, o) => s + o.total, 0);
  assert.equal(totalGastado, 370);
});

test('getOrders() con la tienda sin pedidos todavía devuelve una lista vacía, no null ni error', async () => {
  const window = nuevoEntorno();
  const todos = await window.getOrders();
  assert.equal(Array.isArray(todos), true);
  assert.equal(todos.length, 0);
});
