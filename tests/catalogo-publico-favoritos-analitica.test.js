// =========================================================
// Catálogo público — favoritos, compartir, analítica, ?producto=
// =========================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

const PRODUCTOS_MOCK = {
  P1: { nombre: 'Guitarra', categoria: 'cuerdas', imagen: 'https://x/foto.jpg', disponible: true, actualizadoEn: 1 },
  P2: { nombre: 'Bajo sin foto', categoria: 'cuerdas', imagen: '', disponible: true, actualizadoEn: 2 }
};

// A diferencia de otros archivos de esta suite, acá el mock de
// Firebase se arma como texto e se inyecta DENTRO del <script>
// combinado — no se puede pisar window.firebase DESPUÉS de crear el
// jsdom, porque con runScripts:"dangerously" el <script> ya corrió
// (y ya intentó usar firebase.initializeApp) para cuando el
// constructor de JSDOM termina.
function crearEntornoCatalogoPublico({ producto = '', transaction = () => Promise.resolve({ committed: true }) } = {}) {
  const html = fs.readFileSync(path.join(ROOT, 'catalogo-publico.html'), 'utf8');
  const mockScript = `
    window.__transactions = [];
    window.firebase = {
      initializeApp: () => ({
        database: () => ({
          ref: (path) => ({
            once: () => Promise.resolve({ val: () => ({
              activo: true, nombreTienda: 'Tienda X', whatsapp: '51987654321',
              productos: ${JSON.stringify(PRODUCTOS_MOCK)}
            }) }),
            transaction: (fn) => {
              window.__transactions.push(path);
              return (${transaction.toString()})(fn);
            }
          })
        })
      })
    };
  `;
  const conInline = html
    .replace(
      /<script src="https:\/\/www.gstatic.com\/firebasejs\/10.12.2\/firebase-app-compat.js"><\/script>\n<script src="https:\/\/www.gstatic.com\/firebasejs\/10.12.2\/firebase-database-compat.js"><\/script>/,
      '<script>' + mockScript + '</script>'
    )
    .replace(/<script src="firebase-projects.js"><\/script>/, '<script>' + fs.readFileSync(path.join(ROOT, 'firebase-projects.js'), 'utf8') + '</script>');

  const url = 'http://localhost/?proyecto=proyecto_a&tienda=tda_test' + (producto ? '&producto=' + producto : '');
  return new JSDOM(conInline, { url, runScripts: 'dangerously', pretendToBeVisual: true }).window;
}

function esperarCarga() {
  return new Promise(r => setTimeout(r, 80));
}

// ── Favoritos ────────────────────────────────────────────────────
test('tocar el corazón de un producto lo guarda en localStorage, scopeado a esa tienda', async () => {
  const window = crearEntornoCatalogoPublico();
  await esperarCarga();

  const corazon = window.document.querySelector('.cp-fav-btn');
  corazon.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  assert.equal(corazon.classList.contains('activo'), true);
  const guardado = JSON.parse(window.localStorage.getItem('vaeron_favoritos_tda_test'));
  assert.equal(Array.isArray(guardado), true);
  assert.equal(guardado.length, 1);
});

test('tocar el corazón de nuevo lo saca de favoritos', async () => {
  const window = crearEntornoCatalogoPublico();
  await esperarCarga();

  const corazon = window.document.querySelector('.cp-fav-btn');
  corazon.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  corazon.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  assert.equal(corazon.classList.contains('activo'), false);
  const guardado = JSON.parse(window.localStorage.getItem('vaeron_favoritos_tda_test'));
  assert.equal(guardado.length, 0);
});

test('"Ver solo favoritos" filtra la grilla a solo los productos marcados', async () => {
  const window = crearEntornoCatalogoPublico();
  await esperarCarga();

  const totalAntes = window.document.querySelectorAll('.cp-item').length;
  assert.equal(totalAntes, 2, 'de partida deberían verse los 2 productos del mock');

  window.document.querySelector('.cp-fav-btn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  window.toggleSoloFavoritosPublico(window.document.getElementById('cpFavToggle'));

  assert.equal(window.document.querySelectorAll('.cp-item').length, 1);
});

test('sacar un favorito mientras el filtro "solo favoritos" está activo lo saca de la vista al toque', async () => {
  const window = crearEntornoCatalogoPublico();
  await esperarCarga();

  const corazon = window.document.querySelector('.cp-fav-btn');
  corazon.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); // lo marca
  window.toggleSoloFavoritosPublico(window.document.getElementById('cpFavToggle'));
  assert.equal(window.document.querySelectorAll('.cp-item').length, 1);

  // Ojo: tras el re-render de arriba, el corazón es un elemento NUEVO
  // del DOM — hay que volver a tomarlo, no reusar la referencia vieja.
  window.document.querySelector('.cp-fav-btn').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  assert.equal(window.document.querySelectorAll('.cp-item').length, 0);
});

// ── Compartir un producto puntual ─────────────────────────────────
test('compartirProducto() arma el link con &producto=CODIGO sobre la URL actual', async () => {
  const window = crearEntornoCatalogoPublico();
  await esperarCarga();

  let copiado = null;
  window.navigator.clipboard = { writeText: t => { copiado = t; return Promise.resolve(); } };
  window.alert = () => {}; // silenciar el "Link copiado."

  window.compartirProducto('P1', 'Guitarra');
  await esperarCarga();

  assert.match(copiado, /[?&]producto=P1/);
  assert.match(copiado, /tienda=tda_test/);
  assert.match(copiado, /proyecto=proyecto_a/);
});

test('compartirProducto() usa Web Share si está disponible, en vez del portapapeles', async () => {
  const window = crearEntornoCatalogoPublico();
  await esperarCarga();

  let compartido = null;
  window.navigator.share = data => { compartido = data; return Promise.resolve(); };

  window.compartirProducto('P2', 'Bajo sin foto');

  assert.ok(compartido);
  assert.equal(compartido.title, 'Bajo sin foto');
  assert.match(compartido.url, /producto=P2/);
});

// ── Link directo a un producto (?producto=) ───────────────────────
test('?producto=P1 (con foto) abre el visor de zoom directo, sin que la persona toque nada', async () => {
  const window = crearEntornoCatalogoPublico({ producto: 'P1' });
  await esperarCarga();

  assert.equal(window.document.getElementById('cpLightbox').classList.contains('open'), true);
  assert.equal(window.document.getElementById('cpLightboxImg').src, 'https://x/foto.jpg');
});

test('?producto=P2 (sin foto) resalta la tarjeta en vez de abrir un visor vacío', async () => {
  const window = crearEntornoCatalogoPublico({ producto: 'P2' });
  await esperarCarga();
  await new Promise(r => setTimeout(r, 150)); // el resaltado tiene su propio setTimeout interno

  assert.equal(window.document.getElementById('cpLightbox').classList.contains('open'), false);
  const tarjeta = Array.from(window.document.querySelectorAll('.cp-item')).find(el => el.dataset.code === 'P2');
  assert.equal(tarjeta.classList.contains('cp-item-resaltado'), true);
});

test('?producto= con un código que no existe no rompe nada — el catálogo carga normal', async () => {
  const window = crearEntornoCatalogoPublico({ producto: 'NO-EXISTE' });
  await esperarCarga();

  assert.equal(window.document.querySelectorAll('.cp-item').length, 2);
  assert.equal(window.document.getElementById('cpLightbox').classList.contains('open'), false);
});

// ── Analítica ──────────────────────────────────────────────────
test('cargar la página registra UNA visita (transaction sobre analitica/visitas)', async () => {
  const window = crearEntornoCatalogoPublico();
  await esperarCarga();

  const rutas = window.__transactions.filter(p => p.includes('analitica/visitas'));
  assert.equal(rutas.length, 1);
});

test('tocar "Preguntar" registra una consulta para ESE producto puntual', async () => {
  const window = crearEntornoCatalogoPublico();
  await esperarCarga();
  window.open = () => {}; // no abrir de verdad wa.me en el test

  await window.preguntarPorProducto('P1', 'Guitarra', 'https://x/foto.jpg', true);

  const rutas = window.__transactions.filter(p => p.includes('analitica/consultas/P1'));
  assert.equal(rutas.length, 1);
});
