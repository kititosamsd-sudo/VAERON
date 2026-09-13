// =========================================================
// Pedidos — modal de cliente (DOM real)
// =========================================================
// A diferencia de los otros archivos de esta suite, estos tests
// cargan el HTML REAL de views/pedidos-view.html + pedidos-logic.js
// (ver crearEntornoPedidos() en tests/helpers/load-firebase-env.js) y
// disparan las funciones tal como las llama un onclick real —
// llenando inputs del DOM, no pasándole argumentos a mano a una
// función aislada. Si algún día se renombra un id del HTML sin
// actualizar el JS (o viceversa), estos tests son los que se rompen.
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEntornoPedidos, prepararTienda, normalizar } = require('./helpers/load-firebase-env.js');

function nuevoEntorno() {
  const window = crearEntornoPedidos();
  prepararTienda(window, 'tienda-1');
  return window;
}

function llenarFormularioCliente(window, valores) {
  const d = window.document;
  d.getElementById('editRuc').value = valores.ruc || '';
  d.getElementById('editNombre').value = valores.nombre || '';
  d.getElementById('editCiudad').value = valores.ciudad || '';
  d.getElementById('editTelefono').value = valores.telefono || '';
  d.getElementById('editCorreo').value = valores.correo || '';
  d.getElementById('editCumpleDia').value = valores.cumpleDia || '';
  d.getElementById('editCumpleMes').value = valores.cumpleMes || '';
  d.getElementById('editInteres').value = valores.interes || '';
  d.getElementById('editNotas').value = valores.notas || '';
}

async function leerCliente(window, ruc) {
  const snap = await window.refClients.child(ruc).once('value');
  return normalizar(snap.val());
}

test('openNewClient() + saveEdit() con datos válidos guarda el cliente y cierra el modal', async () => {
  const window = nuevoEntorno();
  window.openNewClient();
  llenarFormularioCliente(window, {
    ruc: '20123456789', nombre: 'Instrumentos del Sur', ciudad: 'Lima',
    telefono: '987654321', correo: 'contacto@sur.com'
  });

  window.saveEdit();
  await new Promise(r => setTimeout(r, 0)); // saveEdit() guarda de forma asíncrona

  assert.equal(window.__alerts.length, 0, 'no debería haber alertas con datos válidos');
  const c = await leerCliente(window, '20123456789');
  assert.equal(c.nombre, 'Instrumentos del Sur');
  assert.equal(c.telefono, '987654321');
  assert.equal(window.document.getElementById('editModal').classList.contains('open'), false, 'el modal debería cerrarse tras guardar');
});

test('saveEdit() con RUC inválido (no son 11 dígitos) no guarda nada y avisa', async () => {
  const window = nuevoEntorno();
  window.openNewClient();
  llenarFormularioCliente(window, { ruc: '123', nombre: 'Cliente con RUC corto' });

  window.saveEdit();
  await new Promise(r => setTimeout(r, 0));

  assert.equal(window.__alerts.length, 1);
  assert.match(window.__alerts[0], /documento/i);
  assert.equal(await leerCliente(window, '123'), null);
});

test('saveEdit() acepta un DNI de 8 dígitos, no solo RUC de 11 — consumidor final, no solo clientes con empresa', async () => {
  const window = nuevoEntorno();
  window.openNewClient();
  llenarFormularioCliente(window, { ruc: '45678912', nombre: 'Juan Pérez (cliente particular)' });

  window.saveEdit();
  await new Promise(r => setTimeout(r, 0));

  assert.equal(window.__alerts.length, 0, 'un DNI de 8 dígitos es válido, no debería haber alerta');
  const c = await leerCliente(window, '45678912');
  assert.equal(c.nombre, 'Juan Pérez (cliente particular)');
});

test('saveEdit() sin nombre no guarda nada y avisa', async () => {
  const window = nuevoEntorno();
  window.openNewClient();
  llenarFormularioCliente(window, { ruc: '20111111111', nombre: '' });

  window.saveEdit();
  await new Promise(r => setTimeout(r, 0));

  assert.equal(window.__alerts.length, 1);
  assert.match(window.__alerts[0], /razón social/i);
  assert.equal(await leerCliente(window, '20111111111'), null);
});

test('saveEdit() con correo mal escrito no guarda nada y avisa', async () => {
  const window = nuevoEntorno();
  window.openNewClient();
  llenarFormularioCliente(window, { ruc: '20222222222', nombre: 'Cliente X', correo: 'no-es-un-correo' });

  window.saveEdit();
  await new Promise(r => setTimeout(r, 0));

  assert.equal(window.__alerts.length, 1);
  assert.match(window.__alerts[0], /correo/i);
  assert.equal(await leerCliente(window, '20222222222'), null);
});

test('saveEdit() no deja registrar dos clientes distintos con el mismo RUC', async () => {
  const window = nuevoEntorno();
  await window.saveClient('20333333333', { nombre: 'Cliente original', ciudad: 'Lima' });
  window.__setClientsCache([{ ruc: '20333333333', nombre: 'Cliente original', ciudad: 'Lima' }]);

  window.openNewClient();
  llenarFormularioCliente(window, { ruc: '20333333333', nombre: 'Otro cliente intentando colarse' });
  window.saveEdit();
  await new Promise(r => setTimeout(r, 0));

  assert.equal(window.__alerts.length, 1);
  assert.match(window.__alerts[0], /Ya existe un cliente/);
  const c = await leerCliente(window, '20333333333');
  assert.equal(c.nombre, 'Cliente original', 'el cliente original no debería haberse pisado');
});

test('openEdit(ruc) precarga el formulario (incluidos los campos nuevos de CRM) desde clientsCache', () => {
  const window = nuevoEntorno();
  window.__setClientsCache([{
    ruc: '20444444444', nombre: 'Casa de la Guitarra', ciudad: 'Trujillo',
    telefono: '944444444', correo: 'ventas@guitarra.pe',
    cumpleDia: 3, cumpleMes: 11, interes: 'pedales de efectos', notas: 'cliente frecuente'
  }]);

  window.openEdit('20444444444');

  const d = window.document;
  assert.equal(d.getElementById('editNombre').value, 'Casa de la Guitarra');
  assert.equal(d.getElementById('editTelefono').value, '944444444');
  assert.equal(d.getElementById('editCorreo').value, 'ventas@guitarra.pe');
  assert.equal(d.getElementById('editCumpleDia').value, '3');
  assert.equal(d.getElementById('editCumpleMes').value, '11');
  assert.equal(d.getElementById('editInteres').value, 'pedales de efectos');
  assert.equal(d.getElementById('editNotas').value, 'cliente frecuente');
  assert.equal(d.getElementById('editModal').classList.contains('open'), true);
});

test('un vendedor no puede abrir la ficha de Editar (openEdit no hace nada)', () => {
  const window = nuevoEntorno();
  window.currentUserRole = 'vendedor';
  window.__setClientsCache([{ ruc: '20555555555', nombre: 'Cliente Y', ciudad: 'Lima' }]);

  window.openEdit('20555555555');

  assert.equal(window.document.getElementById('editModal').classList.contains('open'), false);
});

test('openClientDetail() muestra los datos de contacto y el historial de compras real, con el total acumulado', async () => {
  const window = nuevoEntorno();
  window.__setClientsCache([{
    ruc: '20666666666', nombre: 'Estudio de Grabación XYZ', ciudad: 'Lima',
    telefono: '966666666', correo: 'contacto@xyz.pe', interes: 'micrófonos de condensador'
  }]);
  await window.refOrders.push({
    numero: 10, total: 500, subtotal: 500,
    cliente: { ruc: '20666666666', nombre: 'Estudio de Grabación XYZ', ciudad: 'Lima' },
    creadoEn: 1000
  });
  await window.refOrders.push({
    numero: 11, total: 300, subtotal: 300,
    cliente: { ruc: '20666666666', nombre: 'Estudio de Grabación XYZ', ciudad: 'Lima' },
    creadoEn: 2000
  });
  // Pedido de OTRO cliente — no debería aparecer ni sumar acá.
  await window.refOrders.push({
    numero: 12, total: 999, subtotal: 999,
    cliente: { ruc: '20777777777', nombre: 'Otro cliente', ciudad: 'Lima' },
    creadoEn: 1500
  });

  window.openClientDetail('20666666666');
  await new Promise(r => setTimeout(r, 0)); // getOrders() + render son asíncronos

  const d = window.document;
  assert.equal(d.getElementById('clientDetailNombre').textContent, 'Estudio de Grabación XYZ');
  assert.equal(d.getElementById('clientDetailTelefono').textContent, '966666666');
  assert.equal(d.getElementById('clientDetailCorreo').textContent, 'contacto@xyz.pe');
  assert.equal(d.getElementById('clientDetailInteres').textContent, 'micrófonos de condensador');
  assert.equal(d.getElementById('clientDetailModal').classList.contains('open'), true);

  const historialHtml = d.getElementById('clientDetailHistorial').innerHTML;
  assert.match(historialHtml, /2 pedidos/);
  assert.match(historialHtml, /800/, 'el total acumulado (500+300) debería aparecer');
  assert.doesNotMatch(historialHtml, /N° 12/, 'un pedido de otro cliente no debería listarse acá');
});

test('openClientDetail() de un cliente sin pedidos todavía muestra el mensaje vacío, no un error', async () => {
  const window = nuevoEntorno();
  window.__setClientsCache([{ ruc: '20888888888', nombre: 'Cliente Nuevo', ciudad: 'Lima' }]);

  window.openClientDetail('20888888888');
  await new Promise(r => setTimeout(r, 0));

  const historialHtml = window.document.getElementById('clientDetailHistorial').innerHTML;
  assert.match(historialHtml, /Todavía no tiene pedidos/);
});

test('closeClientDetail() cierra el modal y limpia el ruc actual', async () => {
  const window = nuevoEntorno();
  window.__setClientsCache([{ ruc: '20111222333', nombre: 'Cliente Z', ciudad: 'Lima' }]);
  window.openClientDetail('20111222333');
  await new Promise(r => setTimeout(r, 0));

  window.closeClientDetail();

  assert.equal(window.document.getElementById('clientDetailModal').classList.contains('open'), false);
});
