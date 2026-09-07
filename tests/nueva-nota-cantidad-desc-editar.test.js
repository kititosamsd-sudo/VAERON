// tests/nueva-nota-cantidad-desc-editar.test.js
//
// Verifica, montando la vista REAL (views/nueva-nota-view.html) en
// jsdom, las funciones agregadas/cambiadas en esta ronda de fixes:
//   - cantidad en stock visible en el buscador de productos
//   - descuento por línea (Desc. %) y su efecto en el subtotal/total
//   - guardarNota() de punta a punta, ya sin descargar PDF solo
//   - reintentar cuando falla la asignación del N° de nota
//   - modo edición (precarga + updateOrder en vez de saveOrder)

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, readSrc, tiendaStore } = require('./helpers/load-app');

const VIEW_HTML = readSrc('views/nueva-nota-view.html');

function setupNota(tiendaId) {
  const { window, firebase } = loadApp(
    ['firebase.js', 'stock.js', 'pedidos-logic.js', 'nueva-nota-logic.js'],
    VIEW_HTML, tiendaId
  );
  const store = tiendaStore(firebase, tiendaId);
  const scriptSet = (varName, value) => {
    const s = window.document.createElement('script');
    s.textContent = `${varName} = ${JSON.stringify(value)};`;
    window.document.body.appendChild(s);
  };
  const readVar = (varName) => {
    const s = window.document.createElement('script');
    s.textContent = `window.__leido = ${varName};`;
    window.document.body.appendChild(s);
    return window.__leido;
  };
  return { window, firebase, store, scriptSet, readVar };
}

test('buscarProductoNota: muestra la cantidad en stock de cada resultado', () => {
  const { window, scriptSet } = setupNota('tienda-nota-stock-1');
  scriptSet('productsCache', [
    { code: 'AK15G', name: 'Ampli soundking 15w', price: 250, stock: 7 },
    { code: 'FLT', name: 'flauta pan', price: 24, stock: 0 },
  ]);

  window.buscarProductoNota('a');
  const html = window.document.getElementById('notaProductoResultados').innerHTML;

  assert.match(html, /7 en stock/);
  assert.match(html, /0 en stock/);
});

test('anadirItemNota + renderNotaItems: el Desc. % por línea baja el subtotal de esa fila y el total', () => {
  const { window, scriptSet } = setupNota('tienda-nota-desc-1');
  scriptSet('productsCache', [{ code: 'X-1', name: 'Producto X', price: 100, stock: 10 }]);

  window.elegirProductoNota('X-1');
  window.document.getElementById('notaCantidadInput').value = 2;
  window.document.getElementById('notaPrecioInput').value = 100;
  window.document.getElementById('notaDescInput').value = 10; // 10% de descuento en esta línea
  window.anadirItemNota();

  const itemsHtml = window.document.getElementById('notaItemsList').innerHTML;
  // 2 * 100 * (1 - 10%) = 180 (fmtPrice no agrega decimales a un número entero)
  assert.match(itemsHtml, /S\/\s*180(?!\d)/);

  const subtotalTexto = window.document.getElementById('notaSubtotal').textContent;
  assert.match(subtotalTexto, /180/);
});

test('guardarNota: guarda la nota con el subtotal/total ya afectados por el Desc. % por línea, sin necesitar red para PDF', async () => {
  const TIENDA = 'tienda-nota-guardar-1';
  const { window, store, scriptSet } = setupNota(TIENDA);
  scriptSet('productsCache', [{ code: 'X-1', name: 'Producto X', price: 50, stock: 10 }]);
  scriptSet('clientsCache', [{ ruc: '20552895357', nombre: 'Cliente Uno', ciudad: 'Lima' }]);

  window.NuevaNota.init();
  // El correlativo se reserva de forma async (asignarNumeroNota) —
  // se espera un tick para que la transacción falsa resuelva.
  await new Promise(r => setTimeout(r, 0));

  window.seleccionarClienteNota('20552895357');
  window.elegirProductoNota('X-1');
  window.document.getElementById('notaCantidadInput').value = 3;
  window.document.getElementById('notaPrecioInput').value = 50;
  window.document.getElementById('notaDescInput').value = 0;
  window.anadirItemNota();

  await window.guardarNota();

  const guardadas = Object.values(store.orders || {});
  assert.equal(guardadas.length, 1);
  assert.equal(guardadas[0].subtotal, 150);
  assert.equal(guardadas[0].total, 150);
  assert.equal(guardadas[0].cliente.ruc, '20552895357');
});

test('Si falla la asignación del N° de nota, se muestra el aviso con "Reintentar" y el botón de confirmar queda deshabilitado', async () => {
  const { window, scriptSet } = setupNota('tienda-nota-falla-1');

  // Sobrescribe siguienteCorrelativoNota para simular el mismo
  // permission_denied que se vio en producción.
  const s = window.document.createElement('script');
  s.textContent = `siguienteCorrelativoNota = function() { return Promise.reject(new Error('permission_denied')); };`;
  window.document.body.appendChild(s);

  window.NuevaNota.init();
  await new Promise(r => setTimeout(r, 0));

  const alertBox = window.document.getElementById('notaAlertBox');
  const btnGuardar = window.document.getElementById('btnGuardarNota');
  assert.equal(alertBox.style.display, 'flex');
  assert.equal(btnGuardar.disabled, true);

  // Arregla el correlativo y reintenta.
  const s2 = window.document.createElement('script');
  s2.textContent = `siguienteCorrelativoNota = function() { return Promise.resolve(9); };`;
  window.document.body.appendChild(s2);
  window.reintentarNumeroNota();
  await new Promise(r => setTimeout(r, 0));

  assert.equal(alertBox.style.display, 'none');
  assert.equal(btnGuardar.disabled, false);
});

test('Modo edición: precarga cliente/ítems/descuento de la nota y guardarNota() actualiza en vez de crear una nueva', async () => {
  const TIENDA = 'tienda-nota-editar-1';
  const { window, store, scriptSet } = setupNota(TIENDA);
  scriptSet('productsCache', [{ code: 'X-1', name: 'Producto X', price: 50, stock: 10 }]);

  // Nota ya guardada previamente (como llegaría desde Historial).
  await window.saveOrder({
    numero: 3, numeroFormateado: 'NP-2026-3',
    cliente: { ruc: '', nombre: 'Cliente Editable', dni: '', ciudad: '' },
    items: [{ codigo: 'X-1', nombre: 'Producto X', cantidad: 2, precio: 50, descPct: 0 }],
    descuentoPct: 0, subtotal: 100, total: 100
  });
  const idGuardado = Object.keys(store.orders)[0];
  const notaOriginal = store.orders[idGuardado];

  window.NuevaNota.init({ editId: idGuardado, editNota: notaOriginal });

  assert.equal(window.document.getElementById('notaClienteNombre').textContent, 'Cliente Editable');
  assert.match(window.document.getElementById('notaItemsList').innerHTML, /Producto X/);
  assert.equal(window.document.getElementById('btnGuardarNota').disabled, false);

  // Cambia la cantidad de 2 a 5 y guarda.
  const cantidadInput = window.document.querySelector('#notaItemsList input[type="number"]');
  cantidadInput.value = 5;
  cantidadInput.dispatchEvent(new window.Event('change'));

  await window.guardarNota();

  const guardadas = Object.values(store.orders || {});
  assert.equal(guardadas.length, 1); // no se creó una nota nueva
  assert.equal(guardadas[0].items[0].cantidad, 5);
  assert.equal(guardadas[0].subtotal, 250);
  assert.equal(guardadas[0].numero, 3); // conserva su número original
});
