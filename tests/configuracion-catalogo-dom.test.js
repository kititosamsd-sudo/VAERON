// =========================================================
// configuracion-logic.js — tarjetas de Catálogo público y Permisos
// del equipo (DOM real)
// =========================================================
// Mismo criterio que tests/pedidos-cliente-dom.test.js: carga el
// HTML real de views/configuracion-view.html + configuracion-logic.js,
// y dispara las funciones tal como las llama un onclick real.
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEntornoConfiguracion, prepararTienda, normalizar } = require('./helpers/load-firebase-env.js');

function nuevoEntorno() {
  const window = crearEntornoConfiguracion();
  prepararTienda(window, 'tienda-1');
  return window;
}

function esperar() {
  return new Promise(r => setTimeout(r, 0));
}

test('cargarCatalogoPublico() precarga el link, el nombre de la tienda y dibuja el QR', async () => {
  const window = nuevoEntorno();
  window.cargarCatalogoPublico();
  await esperar();

  const d = window.document;
  assert.match(d.getElementById('catalogoPublicoLink').value, /catalogo-publico\.html\?proyecto=.*&tienda=tienda-1/);
  assert.equal(d.getElementById('cpNombreTienda').value, 'Tienda de prueba');
  assert.ok(d.getElementById('catalogoPublicoQR').querySelector('canvas'), 'debería haber dibujado el QR');
});

test('un vendedor no carga la tarjeta de Catálogo público (defensa extra, además de que el HTML ya la oculta)', async () => {
  const window = nuevoEntorno();
  window.currentUserRole = 'vendedor';
  // Sembramos un valor previo para confirmar que cargarCatalogoPublico()
  // no lo pisa ni lo toca si no es admin.
  window.document.getElementById('cpNombreTienda').value = 'sin tocar';

  window.cargarCatalogoPublico();
  await esperar();

  assert.equal(window.document.getElementById('cpNombreTienda').value, 'sin tocar');
});

test('toggleCatalogoPublicoActivo() activa el catálogo y lo refleja en Firebase', async () => {
  const window = nuevoEntorno();
  const btn = window.document.getElementById('toggleCatalogoPublico');
  assert.equal(btn.classList.contains('active'), false);

  window.toggleCatalogoPublicoActivo(btn);
  await esperar();

  assert.equal(btn.classList.contains('active'), true);
  const cfg = normalizar(await window.getCatalogoPublicoConfig());
  assert.equal(cfg.activo, true);
});

test('toggleCatalogoPublicoActivo() revierte el switch visualmente si falla el guardado', async () => {
  const window = nuevoEntorno();
  const original = window.setCatalogoPublicoConfig;
  window.setCatalogoPublicoConfig = () => Promise.reject(new Error('PERMISSION_DENIED'));
  window.alert = () => {}; // silenciar el alert del error, no es lo que se está probando acá

  const btn = window.document.getElementById('toggleCatalogoPublico');
  window.toggleCatalogoPublicoActivo(btn);
  await esperar();

  assert.equal(btn.classList.contains('active'), false, 'debería volver a apagado, no quedarse prendido si falló el guardado');
  window.setCatalogoPublicoConfig = original;
});

test('guardarCatalogoPublicoDatos() guarda nombre y whatsapp, limpiando el whatsapp a solo dígitos', async () => {
  const window = nuevoEntorno();
  const d = window.document;
  d.getElementById('cpNombreTienda').value = 'Instrumentos del Sur';
  d.getElementById('cpWhatsapp').value = '+51 987-654-321';

  window.guardarCatalogoPublicoDatos();
  await esperar();

  const cfg = normalizar(await window.getCatalogoPublicoConfig());
  assert.equal(cfg.nombreTienda, 'Instrumentos del Sur');
  assert.equal(cfg.whatsapp, '51987654321');
  assert.match(d.getElementById('catalogoPublicoMsg').textContent, /Guardado/);
});

test('descargarQRCatalogoPublico() no revienta si ya hay un QR dibujado', async () => {
  const window = nuevoEntorno();
  window.cargarCatalogoPublico();
  await esperar();

  let seDescargo = false;
  const clickOriginal = window.HTMLAnchorElement.prototype.click;
  window.HTMLAnchorElement.prototype.click = function () { seDescargo = true; };
  // jsdom no implementa canvas.toDataURL() de verdad — alcanza con que
  // no tire una excepción no manejada.
  assert.doesNotThrow(() => window.descargarQRCatalogoPublico());
  window.HTMLAnchorElement.prototype.click = clickOriginal;
});

test('cargarPermisosVendedor() pinta los tres toggles según lo que haya guardado', async () => {
  const window = nuevoEntorno();
  await window.setPermisosVendedor({ verDashboard: true, verForo: false, editarStock: true });

  window.cargarPermisosVendedor();
  await esperar();

  const d = window.document;
  assert.equal(d.getElementById('togglePermisoDashboard').classList.contains('active'), true);
  assert.equal(d.getElementById('togglePermisoForo').classList.contains('active'), false);
  assert.equal(d.getElementById('togglePermisoEditarStock').classList.contains('active'), true);
});

test('togglePermisoVendedor() prende un permiso puntual sin tocar los otros dos', async () => {
  const window = nuevoEntorno();
  const btn = window.document.getElementById('togglePermisoEditarStock');

  window.togglePermisoVendedor('editarStock', btn);
  await esperar();

  const cfg = normalizar(await window.getPermisosVendedor());
  assert.equal(cfg.editarStock, true);
  assert.equal(cfg.verDashboard, false);
  assert.equal(cfg.verForo, false);
});

test('cargarAnaliticaCatalogoPublico() muestra las visitas totales y el top de productos más consultados, con nombre', async () => {
  const window = nuevoEntorno();
  await window.refCatalogoPublico.update({
    'analitica/visitas': 42,
    'analitica/consultas/P1': 5,
    'analitica/consultas/P2': 9,
    'productos/P1': { nombre: 'Guitarra', categoria: 'x', imagen: '' },
    'productos/P2': { nombre: 'Bajo', categoria: 'x', imagen: '' }
  });

  window.cargarAnaliticaCatalogoPublico();
  await esperar();

  const d = window.document;
  assert.equal(d.getElementById('catalogoPublicoVisitas').textContent, '42');
  const html = d.getElementById('catalogoPublicoTopConsultas').innerHTML;
  assert.match(html, /9 × Bajo/);
  assert.match(html, /5 × Guitarra/);
  assert.ok(html.indexOf('Bajo') < html.indexOf('Guitarra'), 'Bajo (9 consultas) debería listarse antes que Guitarra (5)');
});

test('cargarAnaliticaCatalogoPublico() sin ninguna consulta todavía muestra el mensaje vacío, no un error', async () => {
  const window = nuevoEntorno();
  window.cargarAnaliticaCatalogoPublico();
  await esperar();

  assert.equal(window.document.getElementById('catalogoPublicoVisitas').textContent, '0');
  assert.match(window.document.getElementById('catalogoPublicoTopConsultas').innerHTML, /Todavía no hay consultas/);
});
