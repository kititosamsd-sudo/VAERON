// =========================================================
// Visor de imagen del sistema (imageViewModal) — zoom/pan
// =========================================================
// Mismo mecanismo que el visor del catálogo público
// (catalogo-publico.html), pero acá el modal vive en stock.js y lo
// comparten las vistas de Stock y Catálogo. Harness chico y propio
// en vez de reusar crearEntornoPedidos() — ese harness ya carga
// stock.js, pero su DOM es el de Pedidos, que no tiene
// imageViewModal/imageViewImg/imageViewFrame.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');

function crearEntornoVisorImagen() {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>
    <div id="imageViewModal">
      <div class="image-view-frame" id="imageViewFrame">
        <img id="imageViewImg" src="" alt="">
      </div>
    </div>
    <h2 id="imageViewName"></h2>
    <p id="imageViewCode"></p>
    <a id="imageViewDownload" href=""></a>
  </body></html>`, { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true });
  const window = dom.window;
  const document = window.document;

  // authReady y displayProductCode los define auth-guard.js/stock.js
  // en otro lado — acá alcanza con un stub mínimo, ninguno de los dos
  // participa en la lógica de zoom en sí.
  window.authReady = window.Promise.resolve();
  window.displayProductCode = c => c;

  const script = document.createElement('script');
  script.textContent = fs.readFileSync(path.join(ROOT, 'stock.js'), 'utf8');
  document.body.appendChild(script);

  return window;
}

function pointerEvent(window, el, type, id, x, y) {
  const ev = new window.MouseEvent(type, { clientX: x, clientY: y, bubbles: true });
  Object.defineProperty(ev, 'pointerId', { value: id });
  el.dispatchEvent(ev);
}

test('openImageView() carga la imagen y engancha el zoom la primera vez', () => {
  const window = crearEntornoVisorImagen();
  window.openImageView('https://ejemplo.com/foto.jpg', 'Guitarra', 'P001');

  const img = window.document.getElementById('imageViewImg');
  assert.equal(img.src, 'https://ejemplo.com/foto.jpg');
  assert.equal(window.document.getElementById('imageViewName').textContent, 'Guitarra');
  assert.equal(img.dataset.zoomListo, '1');
});

test('pellizcar con dos dedos amplía la imagen, respetando el tope de 4x', () => {
  const window = crearEntornoVisorImagen();
  window.openImageView('https://ejemplo.com/foto.jpg', 'Guitarra', 'P001');
  const img = window.document.getElementById('imageViewImg');
  img.setPointerCapture = () => {};

  pointerEvent(window, img, 'pointerdown', 1, 100, 100);
  pointerEvent(window, img, 'pointerdown', 2, 120, 100);
  pointerEvent(window, img, 'pointermove', 1, 60, 100);
  pointerEvent(window, img, 'pointermove', 2, 160, 100); // separación x5 → clamp a 4x

  assert.match(img.style.transform, /scale\(4\)/);
});

test('doble tap alterna entre 1x y 2.5x', () => {
  const window = crearEntornoVisorImagen();
  window.openImageView('https://ejemplo.com/foto.jpg', 'Guitarra', 'P001');
  const img = window.document.getElementById('imageViewImg');
  img.setPointerCapture = () => {};

  pointerEvent(window, img, 'pointerdown', 1, 50, 50);
  pointerEvent(window, img, 'pointerup', 1, 50, 50);
  pointerEvent(window, img, 'pointerdown', 2, 51, 51); // segundo tap, cerca y rápido

  assert.match(img.style.transform, /scale\(2\.5\)/);
});

test('reabrir el visor con otra imagen resetea el zoom y no re-engancha los listeners', () => {
  const window = crearEntornoVisorImagen();
  window.openImageView('https://ejemplo.com/foto.jpg', 'Guitarra', 'P001');
  const img = window.document.getElementById('imageViewImg');
  img.setPointerCapture = () => {};

  pointerEvent(window, img, 'pointerdown', 1, 100, 100);
  pointerEvent(window, img, 'pointerdown', 2, 120, 100);
  pointerEvent(window, img, 'pointermove', 1, 60, 100);
  pointerEvent(window, img, 'pointermove', 2, 160, 100);
  assert.match(img.style.transform, /scale\(4\)/, 'confirma que quedó ampliada antes de reabrir');

  window.openImageView('https://ejemplo.com/otra-foto.jpg', 'Bajo', 'P002');

  assert.equal(img.src, 'https://ejemplo.com/otra-foto.jpg');
  assert.match(img.style.transform, /scale\(1\)/);
  assert.equal(img.dataset.zoomListo, '1', 'sigue en 1, no en 2 — no se enganchó de nuevo');
});

test('la rueda del mouse hace zoom sobre el marco de la imagen', () => {
  const window = crearEntornoVisorImagen();
  window.openImageView('https://ejemplo.com/foto.jpg', 'Guitarra', 'P001');
  const frame = window.document.getElementById('imageViewFrame');
  const img = window.document.getElementById('imageViewImg');

  const evIn = new window.WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true });
  frame.dispatchEvent(evIn);
  assert.match(img.style.transform, /scale\(1\.3\)/);
});
