// tests/helpers/load-app.js
//
// Carga los archivos REALES del proyecto (no copias, no
// reescrituras) dentro de una ventana jsdom, con firebase.js
// apuntando al stub en memoria de fake-firebase.js en vez de a
// internet. Así las pruebas ejercitan el código que de verdad se
// sube a producción.

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');
const { createFakeFirebase } = require('./fake-firebase');

const ROOT = path.join(__dirname, '..', '..');

function readSrc(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

/**
 * @param {string[]} files - rutas relativas de los .js del proyecto a cargar, en orden
 * @param {string} bodyHtml - HTML inicial del <body>, si la prueba necesita elementos concretos
 * @param {string|null} tiendaId - si se da, fija window.currentTiendaId ANTES de que el
 *   código de la prueba use refProducts/refClients/refOrders/refUsers (que ahora viven
 *   bajo tiendas/{tiendaId}/... — ver scopedRef() en firebase.js). Las pruebas que no
 *   necesitan tocar catálogo (ej. solo funciones puras) pueden dejarlo en null.
 */
function loadApp(files, bodyHtml = '', tiendaId = null) {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${bodyHtml}</body></html>`, {
    url: 'https://example.invalid/index.html',
    pretendToBeVisual: true,
    runScripts: 'dangerously', // necesario para que los <script> corran en el realm real del window
  });
  const { window } = dom;

  // Stubs mínimos que el navegador real da gratis y jsdom no siempre cubre.
  window.firebase = createFakeFirebase();
  window.alert = () => {};
  window.confirm = () => true;
  window.matchMedia = window.matchMedia || (() => ({ matches: false, addListener() {}, removeListener() {} }));
  window.localStorage = window.localStorage || (() => {
    let data = {};
    return {
      getItem: k => (k in data ? data[k] : null),
      setItem: (k, v) => { data[k] = String(v); },
      removeItem: k => { delete data[k]; },
      clear: () => { data = {}; },
    };
  })();

  const errors = [];
  window.addEventListener('error', e => errors.push(e.error || e.message));

  // window.eval() de jsdom NO comparte el realm global real del
  // documento (los `function` de nivel superior no quedan visibles
  // en `window` después). La forma correcta de ejecutar scripts de
  // "página clásica" es insertarlos como <script> reales.
  // firebase.js, desde que existe el reparto multi-proyecto, espera
  // que FIREBASE_PROJECTS / ADONAY_ACTIVE_PROJECT_KEY / etc. (de
  // firebase-projects.js) ya existan en el realm — igual que en
  // index.html/login.html reales, donde ese script se carga primero.
  // En vez de obligar a tocar cada archivo de prueba que carga
  // 'firebase.js', se inserta acá automáticamente si hace falta.
  const filesConDependencias = files.includes('firebase.js') && !files.includes('firebase-projects.js')
    ? ['firebase-projects.js', ...files]
    : files;

  for (const relPath of filesConDependencias) {
    const code = readSrc(relPath);
    const script = window.document.createElement('script');
    script.textContent = code;
    window.document.body.appendChild(script);
  }

  if (tiendaId) setCurrentTiendaId(window, tiendaId);

  return { window, document: window.document, firebase: window.firebase, errors };
}

// currentTiendaId se declara con `let` en el realm de la página (ver
// firebase.js) — asignar window.currentTiendaId = ... NO alcanza esa
// misma variable (son bindings distintos). Para cambiarla de verdad
// desde una prueba, hay que correr la asignación DENTRO del mismo
// realm, como un <script> más.
function setCurrentTiendaId(window, tiendaId) {
  const script = window.document.createElement('script');
  script.textContent = `currentTiendaId = ${JSON.stringify(tiendaId)};`;
  window.document.body.appendChild(script);
}

// A partir de la capa multi-tienda, /products, /clients, /orders y
// /usuarios ya no viven en la raíz de la base — viven bajo
// tiendas/{tiendaId}/... (ver scopedRef() en firebase.js). Esta
// función da a las pruebas un objeto cómodo (store.products,
// store.orders, etc.) que apunta directo a esa carpeta de una
// tienda de prueba, sin tener que escribir la ruta completa en
// cada assert. Crea el nodo tiendas/{tiendaId} si todavía no existe.
function tiendaStore(firebase, tiendaId) {
  if (!firebase._store.tiendas) firebase._store.tiendas = {};
  if (!firebase._store.tiendas[tiendaId]) firebase._store.tiendas[tiendaId] = {};
  return firebase._store.tiendas[tiendaId];
}

module.exports = { loadApp, readSrc, ROOT, tiendaStore, setCurrentTiendaId };
