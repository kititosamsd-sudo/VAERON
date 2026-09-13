// =========================================================
// Helper de tests — levanta un entorno de "Firebase" real (pero
// local) para probar firebase.js sin tocar ningún proyecto de
// verdad.
// =========================================================
// mock-sdk.js implementa la MISMA API que usa el resto del código
// (firebase.database()...ref()...set()/update()/once()/on()...) — ver
// el comentario grande al inicio de ese archivo. Cargarlo en un
// jsdom con localStorage nos da un "Firebase" de mentira pero fiel,
// sin necesitar el Firebase Emulator Suite ni una conexión real.
//
// OJO — qué SÍ y qué NO prueba esto: mock-sdk.js no evalúa
// database.rules.json (ninguna app cliente lo hace — las reglas las
// aplica el servidor de Firebase, nunca el SDK). Estos tests
// verifican que la LÓGICA de la app (qué escribe, qué borra, qué
// valida antes de guardar) hace lo que tiene que hacer; NO verifican
// que las reglas de seguridad bloqueen a quien no deberían. Esas dos
// cosas son complementarias, no reemplazan una a la otra.
const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

function readFile(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

// Cada test que llama a esto arranca de cero: localStorage vacío,
// currentTiendaId sin definir, un solo producto/cliente en memoria no
// se filtra al siguiente test (antes cada test pisaba el mismo
// localStorage real del proceso — con jsdom nuevo por llamada, cada
// uno tiene el suyo).
//
// Los tres archivos se cargan como UN SOLO <script> (concatenados),
// no uno por uno: firebase.js referencia en su primera línea
// constantes (FIREBASE_PROJECTS, PROYECTO_COORDINADOR,
// ADONAY_ACTIVE_PROJECT_KEY) que firebase-projects.js declara con
// `const` — y un `const` de nivel superior NO queda expuesto como
// propiedad de `window` después de que termina SU <script>, aunque sí
// sigue siendo visible para código más abajo DENTRO del mismo
// <script> (esto es comportamiento real de JS en cualquier
// navegador, no un capricho de jsdom). Concatenarlos es la forma más
// simple de reproducir exactamente cómo los carga app.html/login.html
// (un <script src="..."> por archivo, todos en el mismo documento).
function crearEntornoFirebase() {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    pretendToBeVisual: true
  });
  const { window } = dom;
  const document = window.document;

  const codigo = [
    readFile('mock-sdk.js'),
    readFile('firebase-projects.js'),
    readFile('firebase.js'),
    // Trailer: db/refProducts/refClients/refOrders/refCatalogoPublico
    // son `const` en firebase.js — visibles acá porque este trailer
    // es parte del MISMO <script>, pero invisibles desde fuera si no
    // se copian a mano a `window`. Todo lo que es `function` (
    // saveProduct, saveClient, getOrders, getPermisosVendedor, etc.)
    // ya queda expuesto solo, sin necesitar esto.
    'window.db = db;',
    'window.refProducts = refProducts;',
    'window.refClients = refClients;',
    'window.refOrders = refOrders;',
    'window.refCatalogoPublico = refCatalogoPublico;',
    // Mismo problema que arriba, pero al revés: currentTiendaId es
    // `let` en firebase.js — asignar window.currentTiendaId desde
    // afuera NO cambia el que de verdad usa scopedRef() (son dos
    // cosas distintas). Este setter, en cambio, sí lo cambia: está
    // definido DENTRO del mismo <script>, así que closurea sobre el
    // currentTiendaId real.
    'window.__setTiendaId = function (id) { currentTiendaId = id; };'
  ].join('\n;\n');

  const script = document.createElement('script');
  script.textContent = codigo;
  document.body.appendChild(script);

  return window;
}

// Deja el entorno listo como si fuera la cuenta de una tienda
// (admin o vendedor) ya logueada — currentTiendaId es lo único que
// scopedRef() (firebase.js) exige para no tronar; currentUserRole no
// lo usa firebase.js directamente (eso es cosa de auth-guard.js, que
// estos tests no cargan), pero lo dejamos seteado por si algún test
// lo necesita para armar cuentas/{uid} a mano.
function prepararTienda(window, tiendaId) {
  window.__setTiendaId(tiendaId);
}

// Igual que crearEntornoFirebase(), pero además carga pedidos-logic.js
// y el HTML REAL de views/pedidos-view.html en el documento — para
// probar funciones que sí tocan el DOM (saveEdit, openNewClient,
// openEdit...), no solo la capa de datos de firebase.js.
//
// Por qué el HTML real y no un fragmento armado a mano para el test:
// así, si alguien cambia un id en views/pedidos-view.html (ej.
// "editTelefono") y se olvida de actualizar pedidos-logic.js (o al
// revés), el test se rompe — que es exactamente lo que tiene que
// pasar. Un HTML de prueba separado no detectaría ese desajuste.
// Levanta router.js solo (sin firebase.js ni ningún módulo de
// página) para probar RESTRICCION_ROL/RESTRICCION_ROL_PERMISO — lo
// único que go() necesita de verdad del entorno es #viewRoot en el
// DOM; VIEWS[page].init() ya está escrito para no explotar si el
// módulo de esa página (window.Dashboard, window.Stock...) no está
// cargado (ver "window.Dashboard && Dashboard.init()" en router.js).
function crearEntornoRouter() {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="viewRoot"></div></body></html>', {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    pretendToBeVisual: true
  });
  const { window } = dom;
  const document = window.document;

  // puedeVerDashboard()/puedeVerForo() normalmente viven en
  // auth-guard.js (no cargado acá) — RESTRICCION_ROL_PERMISO los
  // llama por nombre así que necesitan existir como función, aunque
  // sea un stub. Cada test los pisa según lo que quiera simular.
  window.puedeVerDashboard = () => false;
  window.puedeVerForo = () => false;
  window.currentUserRole = null;

  const script = document.createElement('script');
  script.textContent = readFile('router.js');
  document.body.appendChild(script);

  return window;
}

function crearEntornoPedidos() {
  const window = crearEntornoFirebase();
  const document = window.document;

  // pedidos-logic.js espera `authReady` como un global ya resuelto
  // (normalmente lo define auth-guard.js, que estos tests no cargan —
  // ver el porqué en el comentario grande al inicio del archivo).
  // Se define ANTES del <script> de abajo porque pedidos-logic.js lo
  // usa en su propio nivel de módulo (authReady.then(() => {...})),
  // no adentro de una función.
  window.authReady = window.Promise.resolve();
  // Mismo motivo: currentUserRole también lo define normalmente
  // auth-guard.js. Default 'admin' porque es el caso más común a
  // probar (Editar cliente, etc. son admin-only) — un test que
  // necesite simular un vendedor puede pisar
  // window.currentUserRole = 'vendedor' antes de llamar a la función
  // que esté probando.
  window.currentUserRole = 'admin';

  const codigo = [
    readFile('selection.js'),
    // pedidos-logic.js usa fmtPrice() (para el historial de compras
    // en la ficha de cliente) pero esa función vive en stock.js, no
    // en este archivo — se carga acá por la misma razón que
    // selection.js arriba.
    readFile('stock.js'),
    readFile('pedidos-logic.js'),
    // clientsCache es `let` en pedidos-logic.js — mismo problema que
    // currentTiendaId en firebase.js (ver arriba): un setter definido
    // ACÁ, dentro del mismo <script>, closurea sobre el real.
    'window.__setClientsCache = function (arr) { clientsCache = arr; };'
  ].join('\n;\n');

  const script = document.createElement('script');
  script.textContent = codigo;
  document.body.appendChild(script);

  // El HTML real de la vista — modales de editar/ver cliente,
  // importar, y la tabla. Se inserta DESPUÉS del script de lógica
  // (mismo orden que router.js: primero los <script src="..."> del
  // shell, después router.js mete el HTML de la página actual en el
  // DOM) — no importa acá porque nada en pedidos-logic.js corre código
  // al cargar, solo declara funciones.
  document.body.insertAdjacentHTML('beforeend', readFile('views/pedidos-view.html'));

  // jsdom implementa window.alert() como no-op pero tira un warning
  // "Not implemented" por cada llamado — lo reemplazamos por un
  // stub silencioso que además guarda los mensajes, para poder
  // afirmar sobre ellos en los tests (ver window.__alerts).
  window.__alerts = [];
  window.alert = (msg) => { window.__alerts.push(msg); };

  return window;
}

// Los valores que devuelven las funciones de firebase.js (snap.val(),
// getPermisosVendedor(), getOrders()...) son objetos/arrays del realm
// de jsdom — su Object.prototype/Array.prototype NO es el mismo que
// el de este proceso Node, aunque el contenido sea idéntico. assert.
// deepEqual/deepStrictEqual compara también el prototipo, así que sin
// esto un valor "igual" falla la comparación solo por venir de otro
// realm. Ida y vuelta por JSON lo vuelve un objeto plano normal de
// este proceso — válido acá porque todo lo que pasa por Firebase (y
// por el mock) es, por definición, serializable.
function normalizar(valor) {
  return valor === null || valor === undefined ? valor : JSON.parse(JSON.stringify(valor));
}

module.exports = { crearEntornoFirebase, prepararTienda, crearEntornoPedidos, crearEntornoRouter, normalizar };
