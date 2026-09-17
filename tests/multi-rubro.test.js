// =========================================================
// Multi-rubro: rubroDeTienda() y categorías del Foro por rubro
// =========================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { normalizar } = require('./helpers/load-firebase-env.js');

const ROOT = path.join(__dirname, '..');

function crearEntornoRubro() {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true
  });
  const window = dom.window;
  const document = window.document;
  const script = document.createElement('script');
  script.textContent = [
    fs.readFileSync(path.join(ROOT, 'firebase-projects.js'), 'utf8'),
    fs.readFileSync(path.join(ROOT, 'foro-logic.js'), 'utf8')
  ].join('\n;\n');
  document.body.appendChild(script);
  return window;
}

// ── rubroDeTienda() ──────────────────────────────────────────────
test('rubroDeTienda(): devuelve el rubro guardado si es uno válido', () => {
  const window = crearEntornoRubro();
  assert.equal(window.rubroDeTienda({ rubro: 'farmacia' }), 'farmacia');
});

test('rubroDeTienda(): una tienda vieja sin el campo cae en "instrumentos" (el rubro original de VAERON)', () => {
  const window = crearEntornoRubro();
  assert.equal(window.rubroDeTienda({}), 'instrumentos');
  assert.equal(window.rubroDeTienda(null), 'instrumentos');
  assert.equal(window.rubroDeTienda(undefined), 'instrumentos');
});

test('rubroDeTienda(): un valor guardado que ya no es válido (typo, rubro eliminado) no rompe, cae en el default', () => {
  const window = crearEntornoRubro();
  assert.equal(window.rubroDeTienda({ rubro: 'algo-que-no-existe' }), 'instrumentos');
});

// ── foroCategorias() ─────────────────────────────────────────────
test('foroCategorias(): sin currentTiendaRubro definido, usa las de instrumentos (comportamiento de siempre)', () => {
  const window = crearEntornoRubro();
  const cats = normalizar(window.foroCategorias().map(c => c.id));
  assert.deepEqual(cats, ['instrumentos', 'accesorios', 'repuestos', 'audio', 'otros']);
});

test('foroCategorias(): una tienda de farmacia ve las categorías de farmacia, no las de instrumentos', () => {
  const window = crearEntornoRubro();
  window.currentTiendaRubro = 'farmacia';
  const cats = normalizar(window.foroCategorias().map(c => c.id));
  assert.deepEqual(cats, ['medicamentos', 'cuidado-personal', 'insumos-medicos', 'otros']);
  assert.equal(cats.includes('instrumentos'), false);
});

test('foroCategorias(): las 5 categorías (instrumentos, farmacia, ferretería, importadora, otro) están todas armadas y ninguna vacía', () => {
  const window = crearEntornoRubro();
  ['instrumentos', 'farmacia', 'ferreteria', 'importadora', 'otro'].forEach(rubro => {
    window.currentTiendaRubro = rubro;
    const cats = window.foroCategorias();
    assert.ok(Array.isArray(cats) && cats.length > 0, `el rubro "${rubro}" debería tener categorías`);
    cats.forEach(c => {
      assert.ok(c.id, `categoría sin id en el rubro "${rubro}"`);
      assert.ok(c.nombre, `categoría sin nombre en el rubro "${rubro}"`);
    });
  });
});

test('foroCategorias(): un currentTiendaRubro con un valor inválido no rompe — cae en instrumentos', () => {
  const window = crearEntornoRubro();
  window.currentTiendaRubro = 'esto-no-existe';
  const cats = normalizar(window.foroCategorias().map(c => c.id));
  assert.deepEqual(cats, ['instrumentos', 'accesorios', 'repuestos', 'audio', 'otros']);
});

test('foroCategoriaNombre(): traduce el id al nombre visible según el rubro activo', () => {
  const window = crearEntornoRubro();
  window.currentTiendaRubro = 'ferreteria';
  assert.equal(window.foroCategoriaNombre('herramientas'), 'Herramientas');
  assert.equal(window.foroCategoriaNombre('id-inexistente'), 'id-inexistente', 'sin coincidencia, devuelve el id tal cual');
});
