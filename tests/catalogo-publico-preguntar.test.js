// =========================================================
// Catálogo público — "Preguntar" por un producto
// =========================================================
// WhatsApp no tiene forma de recibir una imagen adjunta a través de
// un link wa.me (solo acepta texto) — preguntarPorProducto() intenta
// primero el selector nativo de "Compartir" (Web Share con
// archivos), que SÍ puede adjuntar la foto real, y solo si eso no
// está disponible o falla cae al link de texto de siempre (con la
// url de la foto incluida en el mensaje). Ver el comentario grande
// en catalogo-publico.html.
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function crearEntornoCatalogoPublico() {
  const html = fs.readFileSync(path.join(ROOT, 'catalogo-publico.html'), 'utf8');
  const conInline = html
    .replace(
      /<script src="https:\/\/www.gstatic.com\/firebasejs\/10.12.2\/firebase-app-compat.js"><\/script>\n<script src="https:\/\/www.gstatic.com\/firebasejs\/10.12.2\/firebase-database-compat.js"><\/script>/,
      '<script>window.firebase = { initializeApp: () => ({ database: () => ({ ref: () => ({ once: () => Promise.resolve({ val: () => ({ activo:true, nombreTienda:"x", whatsapp:"51987654321", productos:{} }) }) }) }) }) };</script>'
    )
    .replace(/<script src="firebase-projects.js"><\/script>/, '<script>' + fs.readFileSync(path.join(ROOT, 'firebase-projects.js'), 'utf8') + '</script>');

  return new JSDOM(conInline, {
    url: 'http://localhost/?proyecto=proyecto_a&tienda=x',
    runScripts: 'dangerously',
    pretendToBeVisual: true
  }).window;
}

function esperarCarga() {
  return new Promise(r => setTimeout(r, 30));
}

test('sin Web Share disponible, cae al link de WhatsApp con la foto incluida como texto', async () => {
  const window = crearEntornoCatalogoPublico();
  await esperarCarga();

  let abierto = null;
  window.open = url => { abierto = url; };

  await window.preguntarPorProducto('Guitarra Acústica', 'https://ejemplo.com/foto.jpg', true);

  assert.ok(abierto, 'debería haber llamado a window.open');
  assert.match(abierto, /^https:\/\/wa\.me\/51987654321\?text=/);
  assert.match(decodeURIComponent(abierto), /Hola, quería consultar por: Guitarra Acústica/);
  assert.match(decodeURIComponent(abierto), /https:\/\/ejemplo\.com\/foto\.jpg/);
});

test('con Web Share + archivos soportado, comparte la foto real en vez de abrir el link', async () => {
  const window = crearEntornoCatalogoPublico();
  await esperarCarga();

  let abierto = null, compartido = null;
  window.open = url => { abierto = url; };
  window.fetch = async () => ({ blob: async () => new window.Blob(['x'], { type: 'image/jpeg' }) });
  window.navigator.share = async data => { compartido = data; };
  window.navigator.canShare = () => true;

  await window.preguntarPorProducto('Bajo eléctrico', 'https://ejemplo.com/bajo.jpg', true);

  assert.equal(abierto, null, 'no debería haber abierto el link de WhatsApp');
  assert.ok(compartido, 'debería haber llamado a navigator.share');
  assert.equal(compartido.text, 'Hola, quería consultar por: Bajo eléctrico');
  assert.equal(compartido.files[0].name, 'producto.jpg');
});

test('con Web Share disponible pero canShare() rechazando archivos, cae al link igual', async () => {
  const window = crearEntornoCatalogoPublico();
  await esperarCarga();

  let abierto = null;
  window.open = url => { abierto = url; };
  window.navigator.share = async () => { throw new Error('no debería llamarse'); };
  window.navigator.canShare = () => false;

  await window.preguntarPorProducto('Platillo', 'https://ejemplo.com/platillo.jpg', true);

  assert.ok(abierto, 'debería haber caído al link de WhatsApp');
});

test('si navigator.share() falla o la persona cancela el selector, cae al link en vez de romperse', async () => {
  const window = crearEntornoCatalogoPublico();
  await esperarCarga();

  let abierto = null;
  window.open = url => { abierto = url; };
  window.fetch = async () => ({ blob: async () => new window.Blob(['x'], { type: 'image/jpeg' }) });
  window.navigator.canShare = () => true;
  window.navigator.share = async () => { throw new Error('AbortError: el usuario canceló'); };

  await window.preguntarPorProducto('Micrófono', 'https://ejemplo.com/mic.jpg', true);

  assert.ok(abierto, 'debería caer al link en vez de dejar la promesa rechazada sin manejar');
});

test('sin foto de referencia, nunca intenta Web Share — va directo al link de texto', async () => {
  const window = crearEntornoCatalogoPublico();
  await esperarCarga();

  let abierto = null, seLlamoShare = false;
  window.open = url => { abierto = url; };
  window.navigator.share = async () => { seLlamoShare = true; };
  window.navigator.canShare = () => true;

  await window.preguntarPorProducto('Producto sin foto', '', true);

  assert.equal(seLlamoShare, false);
  assert.ok(abierto);
  assert.doesNotMatch(decodeURIComponent(abierto), /\n/, 'sin foto, el mensaje no debería tener una segunda línea vacía');
});

test('cuando el producto está agotado (disponible=false), el mensaje pregunta por reposición en vez del genérico', async () => {
  const window = crearEntornoCatalogoPublico();
  await esperarCarga();

  let abierto = null;
  window.open = url => { abierto = url; };

  await window.preguntarPorProducto('Bajo eléctrico', '', false);

  assert.ok(abierto);
  assert.match(decodeURIComponent(abierto), /agotado/i);
  assert.match(decodeURIComponent(abierto), /cuándo van a tener más/i);
});
