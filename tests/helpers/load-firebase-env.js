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
// Builder compartido: arma UN SOLO <script> con mock-sdk + firebase-
// projects + firebase.js + lo que cada harness necesite además, todo
// concatenado (ver el comentario grande de arriba sobre por qué tiene
// que ser un solo <script> y no uno por archivo). `archivosExtra` son
// rutas relativas al proyecto (ej. ['selection.js', 'stock.js']),
// `trailerExtra` son líneas de JS crudo que se agregan al final,
// mismo patrón que los setters de abajo (__setTiendaId, etc.) — usalo
// para exponer más `const`/`let` que el archivo extra necesite tocar
// desde el test.
function crearEntornoBase(archivosExtra, trailerExtra, preStubs) {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    pretendToBeVisual: true
  });
  const { window } = dom;
  const document = window.document;

  // Tienen que quedar seteados ANTES de crear el <script> de abajo:
  // pedidos-logic.js/stock.js usan `authReady` en su propio nivel de
  // módulo (authReady.then(() => {...}), no adentro de una función) —
  // si se define recién DESPUÉS de que el script ya corrió, ya es
  // tarde, esa línea ya tiró ReferenceError.
  Object.assign(window, preStubs || {});

  const codigo = [
    readFile('mock-sdk.js'),
    readFile('firebase-projects.js'),
    readFile('firebase.js'),
    ...(archivosExtra || []).map(readFile),
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
    'window.__setTiendaId = function (id) { currentTiendaId = id; };',
    // proyectoActivo es otro `const` de firebase.js en la misma
    // situación — calcularLinkCatalogoPublico() (configuracion-logic.js)
    // lo necesita para armar el link real.
    'window.__proyectoActivo = function () { return proyectoActivo; };',
    ...(trailerExtra || [])
  ].join('\n;\n');

  const script = document.createElement('script');
  script.textContent = codigo;
  document.body.appendChild(script);

  return window;
}

function crearEntornoFirebase() {
  return crearEntornoBase();
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
function crearEntornoPedidos() {
  const window = crearEntornoBase(
    [
      'selection.js',
      // pedidos-logic.js usa fmtPrice() (para el historial de compras
      // en la ficha de cliente) pero esa función vive en stock.js, no
      // en este archivo — se carga acá por la misma razón que
      // selection.js.
      'stock.js',
      'pedidos-logic.js'
    ],
    [
      // clientsCache es `let` en pedidos-logic.js — mismo problema que
      // currentTiendaId en firebase.js: un setter definido DENTRO del
      // mismo <script> closurea sobre el real.
      'window.__setClientsCache = function (arr) { clientsCache = arr; };'
    ],
    {
      // pedidos-logic.js usa `authReady` en su propio nivel de módulo
      // (authReady.then(() => {...})) — normalmente lo define
      // auth-guard.js, que estos tests no cargan (ver el comentario
      // grande al inicio del archivo). Una Promise de Node (no hace
      // falta que sea window.Promise) funciona bien acá: lo único que
      // pedidos-logic.js le hace es .then(), y eso funciona igual
      // entre realms distintos.
      authReady: Promise.resolve(),
      // Mismo motivo: currentUserRole también lo define normalmente
      // auth-guard.js. Default 'admin' porque es el caso más común a
      // probar (Editar cliente, etc. son admin-only) — un test que
      // necesite simular un vendedor puede pisar
      // window.currentUserRole = 'vendedor' antes de llamar a la
      // función que esté probando.
      currentUserRole: 'admin'
    }
  );
  const document = window.document;

  // El HTML real de la vista — modales de editar/ver cliente,
  // importar, y la tabla. Se inserta DESPUÉS del script de lógica
  // (mismo orden que router.js: primero los <script src="..."> del
  // shell, después router.js mete el HTML de la página actual en el
  // DOM) — no importa acá porque nada en pedidos-logic.js corre código
  // al cargar, solo declara funciones.
  document.body.insertAdjacentHTML('beforeend', readFile('views/pedidos-view.html'));

  window.__alerts = [];
  window.alert = (msg) => { window.__alerts.push(msg); };

  return window;
}

// Igual que crearEntornoPedidos(), pero para Configuración —
// configuracion-logic.js + el HTML real de views/configuracion-view.html.
// Solo pensado para probar la tarjeta "Catálogo público" y "Permisos
// del equipo" puntualmente (llamando a sus funciones directo, ej.
// cargarCatalogoPublico()), no window.Configuracion.init() completo —
// ese init() también carga tasa de cambio, logo, almacenes, etc., que
// no hace falta stubear para lo que estos tests cubren. No necesita
// authReady en preStubs: configuracion-logic.js no lo usa a nivel de
// módulo (solo adentro de window.Configuracion.init(), que estos
// tests no llaman).
function crearEntornoConfiguracion() {
  const window = crearEntornoBase(['configuracion-logic.js'], null, {
    currentUserRole: 'admin',
    currentTiendaNombre: 'Tienda de prueba'
  });
  const document = window.document;

  // isAdmin() normalmente vive en auth-guard.js — cargarCatalogoPublico()/
  // cargarPermisosVendedor() lo usan para no cargar esas tarjetas si
  // quien entró es vendedor.
  window.isAdmin = function () { return window.currentUserRole === 'admin' || window.currentUserRole === 'superadmin'; };
  // QRCode viene de una librería externa por CDN (qrcodejs, ver
  // <script> en app.html) que no se baja acá — stub mínimo que hace
  // lo mismo que la real para lo que estos tests necesitan: meter un
  // <canvas> dentro del contenedor que le pasan.
  window.QRCode = function (contenedor) {
    const canvas = document.createElement('canvas');
    contenedor.appendChild(canvas);
  };

  document.body.insertAdjacentHTML('beforeend', readFile('views/configuracion-view.html'));

  return window;
}

// Igual que crearEntornoPedidos(), pero para Stock — selection.js +
// stock.js + el HTML real de views/stock-view.html.
function crearEntornoStock() {
  const window = crearEntornoBase(
    ['selection.js', 'stock.js'],
    [
      // productsCache es `let` en stock.js — mismo patrón que
      // clientsCache en pedidos-logic.js: un setter DENTRO del mismo
      // <script> closurea sobre el real.
      'window.__setProductsCache = function (arr) { productsCache = arr; };'
    ],
    {
      authReady: Promise.resolve(),
      currentUserRole: 'admin',
      // puedeEditarStock() normalmente vive en auth-guard.js — default
      // "true" (como si fuera admin, o un vendedor con el permiso
      // activado) porque es el caso más común a probar; un test que
      // necesite simular al vendedor SIN el permiso puede pisar
      // window.puedeEditarStock = () => false.
      puedeEditarStock: () => true
    }
  );
  const document = window.document;

  document.body.insertAdjacentHTML('beforeend', readFile('views/stock-view.html'));

  return window;
}

// Igual que crearEntornoPedidos(), pero para Dashboard —
// plan-limits.js + dashboard-logic.js + el HTML real de
// views/dashboard-view.html. Ojo: buildSalesChartData()/
// buildTopProductsData() son privadas al closure de
// window.Dashboard (nunca se devuelven en el "return {...}" del
// final) — no hay forma de llamarlas sueltas desde un test. Por eso
// estos tests pasan por window.Dashboard.init() de verdad (con
// getOrders/watchProducts/watchClients ya disponibles por venir de
// firebase.js) y verifican el resultado en el DOM, no llamando a las
// funciones internas directo.
function crearEntornoDashboard() {
  const window = crearEntornoBase(['plan-limits.js', 'dashboard-logic.js'], null, {
    // currentTiendaPlan normalmente lo define auth-guard.js — acá
    // limitePlan() (plan-limits.js) lo necesita para decidir qué
    // panel mostrar. 'premium' porque destraba todo — un test que
    // quiera probar un plan más limitado puede pisar
    // window.currentTiendaPlan antes de llamar a Dashboard.init().
    currentTiendaPlan: 'premium'
  });
  const document = window.document;

  document.body.insertAdjacentHTML('beforeend', readFile('views/dashboard-view.html'));

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

module.exports = {
  crearEntornoFirebase, prepararTienda, crearEntornoPedidos, crearEntornoRouter,
  crearEntornoConfiguracion, crearEntornoStock, crearEntornoDashboard, normalizar
};
