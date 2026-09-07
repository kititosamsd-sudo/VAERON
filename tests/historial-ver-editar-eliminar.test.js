// tests/historial-ver-editar-eliminar.test.js
//
// Verifica, montando la vista REAL (views/historial-view.html), el
// modal "Ver nota" agregado en esta ronda: abrir/cerrar, eliminar
// (contra Firebase simulado), armar la navegación hacia "Editar",
// compartir (con fallback a portapapeles) y exportar a Excel (con
// XLSX simulado en memoria, sin tocar la red).

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, readSrc, tiendaStore } = require('./helpers/load-app');

const VIEW_HTML = readSrc('views/historial-view.html');

function setupHistorial(tiendaId) {
  const { window, firebase } = loadApp(
    ['firebase.js', 'stock.js', 'nav.js', 'historial-logic.js'],
    VIEW_HTML, tiendaId
  );
  const store = tiendaStore(firebase, tiendaId);

  // Router de verdad no se carga acá (probar la navegación real
  // implicaría montar todo el shell de la app) — se reemplaza por un
  // espía que solo registra a dónde se intentó navegar y con qué
  // parámetros, que es lo que de verdad importa verificar desde acá.
  const navegaciones = [];
  window.Router = { go: (page, opts) => navegaciones.push({ page, opts }) };

  return { window, firebase, store, navegaciones };
}

async function crearNotaDePrueba(window, store, overrides = {}) {
  await window.saveOrder({
    numero: 7, numeroFormateado: 'NP-2026-7',
    cliente: { ruc: '20552895357', nombre: 'A & J Music', ciudad: 'Lima' },
    items: [
      { codigo: 'X-1', nombre: 'Producto X', cantidad: 2, precio: 100, descPct: 10 },
      { codigo: 'X-2', nombre: 'Producto Y', cantidad: 1, precio: 50, descPct: 0 },
    ],
    descuentoPct: 5, subtotal: 230, total: 218.5, vendedorNombre: 'Ana',
    ...overrides,
  });
  return Object.keys(store.orders)[0];
}

function initHistorialYEsperar(window) {
  return new Promise(resolve => {
    window.HistorialNotas.init();
    // watchOrders() del fake-firebase dispara 'child_added' de forma
    // síncrona para lo que ya existe — un microtask alcanza.
    setTimeout(resolve, 0);
  });
}

test('abrirVerNotaHistorial: muestra cliente, ítems (con Desc. % por línea) y totales correctos', async () => {
  const TIENDA = 'tienda-hist-ver-1';
  const { window, store } = setupHistorial(TIENDA);
  const id = await crearNotaDePrueba(window, store);
  await initHistorialYEsperar(window);

  window.abrirVerNotaHistorial(id);

  assert.equal(window.document.getElementById('verNotaNum').textContent, 'NP-2026-7');
  assert.match(window.document.getElementById('verNotaNombre').textContent, /A & J Music/);
  assert.equal(window.document.getElementById('verNotaRuc').textContent, '20552895357');

  const bodyHtml = window.document.getElementById('verNotaBody').innerHTML;
  assert.match(bodyHtml, /Producto X/);
  assert.match(bodyHtml, /10%/); // Desc. % de la primera línea
  // 2 * 100 * (1 - 10%) = 180
  assert.match(bodyHtml, /180(?!\d)/);

  const totalesHtml = window.document.getElementById('verNotaTotales').innerHTML;
  assert.match(totalesHtml, /218\.5/);

  assert.equal(window.document.getElementById('historialVerOverlay').classList.contains('open'), true);

  window.cerrarVerNotaHistorial();
  assert.equal(window.document.getElementById('historialVerOverlay').classList.contains('open'), false);
});

test('eliminarNotaHistorial: borra la nota de Firebase y la fila desaparece del historial', async () => {
  const TIENDA = 'tienda-hist-eliminar-1';
  const { window, store } = setupHistorial(TIENDA);
  const id = await crearNotaDePrueba(window, store);
  await initHistorialYEsperar(window);

  window.abrirVerNotaHistorial(id);
  await window.eliminarNotaHistorial();
  // watchOrders necesita un tick para notificar el child_removed.
  await new Promise(r => setTimeout(r, 0));

  assert.equal(store.orders[id], undefined);
  assert.equal(window.document.getElementById('historialVerOverlay').classList.contains('open'), false);
  assert.doesNotMatch(window.document.getElementById('historialNotasBody').innerHTML, /NP-2026-7/);
});

test('editarNotaHistorial: navega a "nueva-nota" pasando el id y los datos completos de la nota', async () => {
  const TIENDA = 'tienda-hist-editar-1';
  const { window, store, navegaciones } = setupHistorial(TIENDA);
  const id = await crearNotaDePrueba(window, store);
  await initHistorialYEsperar(window);

  window.abrirVerNotaHistorial(id);
  window.editarNotaHistorial();

  assert.equal(navegaciones.length, 1);
  assert.equal(navegaciones[0].page, 'nueva-nota');
  assert.equal(navegaciones[0].opts.params.editId, id);
  assert.equal(navegaciones[0].opts.params.editNota.numeroFormateado, 'NP-2026-7');
  // el modal se cierra al pasar a editar, para no dejarlo "colgado" detrás
  assert.equal(window.document.getElementById('historialVerOverlay').classList.contains('open'), false);
});

test('compartirNotaHistorial: sin Web Share API, cae al portapapeles con el resumen de la nota', async () => {
  const TIENDA = 'tienda-hist-compartir-1';
  const { window, store } = setupHistorial(TIENDA);
  const id = await crearNotaDePrueba(window, store);
  await initHistorialYEsperar(window);

  let copiado = null;
  window.navigator.clipboard = { writeText: (texto) => { copiado = texto; return Promise.resolve(); } };
  let alertado = null;
  window.alert = (msg) => { alertado = msg; };

  window.abrirVerNotaHistorial(id);
  window.compartirNotaHistorial();
  await new Promise(r => setTimeout(r, 0));

  assert.match(copiado, /NP-2026-7/);
  assert.match(copiado, /A & J Music/);
  assert.ok(alertado); // confirmó que se copió
});

test('exportarHistorialExcel: arma una fila por nota, con XLSX simulado (sin red)', async () => {
  const TIENDA = 'tienda-hist-excel-1';
  const { window, store } = setupHistorial(TIENDA);
  await crearNotaDePrueba(window, store);
  await initHistorialYEsperar(window);

  const hojas = [];
  window.XLSX = {
    utils: {
      aoa_to_sheet: (filas) => ({ filas }),
      book_new: () => ({ Sheets: {}, SheetNames: [] }),
      book_append_sheet: (wb, ws, nombre) => { hojas.push({ nombre, ws }); },
    },
    writeFile: (wb, filename) => { window.__ultimoArchivoExportado = filename; },
  };

  await window.exportarHistorialExcel();

  assert.equal(hojas.length, 1);
  const filas = hojas[0].ws.filas;
  assert.equal(filas[0][0], 'N°');
  const filaNota = filas.find(f => f[0] === 'NP-2026-7');
  assert.ok(filaNota, 'debe existir una fila con el N° de la nota');
  assert.equal(filaNota[2], 'A & J Music (RUC 20552895357)');
  assert.match(window.__ultimoArchivoExportado, /^historial-notas-.*\.xlsx$/);
});
