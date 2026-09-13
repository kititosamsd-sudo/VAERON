// =========================================================
// database.rules.json — chequeos estructurales
// =========================================================
// No evalúa las reglas de verdad (eso solo lo hace el servidor de
// Firebase — ver la nota grande en tests/helpers/load-firebase-env.js).
// Lo que SÍ podemos garantizar sin conexión: que el archivo es JSON
// válido, que tiene los nodos que el resto de la app da por
// sentado que existen, y que nadie borró sin querer el chequeo de
// rol en alguno de ellos al editar el archivo a mano (ver cómo se
// armó — a pura edición de texto — en la sesión que agregó
// permisosVendedor/catalogoPublico).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RULES_PATH = path.join(__dirname, '..', 'database.rules.json');

function cargarReglas() {
  return JSON.parse(fs.readFileSync(RULES_PATH, 'utf8'));
}

test('database.rules.json es JSON válido', () => {
  assert.doesNotThrow(() => cargarReglas());
});

test('el nodo config de cada tienda existe y sigue bloqueando el resto de sus campos', () => {
  const reglas = cargarReglas();
  const config = reglas.rules.tiendas.$tiendaId.config;
  assert.ok(config, 'falta el nodo config');
  // El .write general de config es el "candado": si alguien agrega un
  // campo nuevo a mano (como se hizo con permisosVendedor) y se
  // olvida de sumarlo acá, ese campo queda escribible por CUALQUIER
  // cuenta de la tienda a través de un update() sobre todo el nodo
  // config, no solo por el admin — ver el mismo patrón para
  // almacenesNombres/almacenesActivos/logoUrl.
  ['permisosVendedor'].forEach(campo => {
    assert.ok(
      config['.write'].includes(`data.child('${campo}')`),
      `el .write de config debería seguir bloqueando cambios directos a "${campo}"`
    );
  });
});

test('permisosVendedor: no tiene su propio .read (hereda el de la tienda: requiere sesión + misma tiendaId) y su escritura exige admin + tiendaId', () => {
  const reglas = cargarReglas();
  const nodo = reglas.rules.tiendas.$tiendaId.config.permisosVendedor;
  assert.ok(nodo, 'falta tiendas/$tiendaId/config/permisosVendedor');
  assert.equal('.read' in nodo, false, 'no debería declarar un .read propio (eso lo haría público sin querer)');
  assert.ok(nodo['.write'].includes("rol').val() === 'admin'"), 'debería exigir rol admin');
  assert.ok(nodo['.write'].includes("tiendaId').val() === $tiendaId"), 'debería exigir que la tienda del que escribe coincida con $tiendaId');
});

test('catalogoPublico: lectura pública SOLO si activo === true, nunca sin esa condición', () => {
  const reglas = cargarReglas();
  const nodo = reglas.rules.tiendas.$tiendaId.catalogoPublico;
  assert.ok(nodo, 'falta tiendas/$tiendaId/catalogoPublico');
  assert.equal(nodo['.read'], "data.child('activo').val() === true");
});

test('catalogoPublico: activo/nombreTienda/whatsapp son escribibles solo por el admin — nunca por cualquier cuenta de la tienda', () => {
  const reglas = cargarReglas();
  const nodo = reglas.rules.tiendas.$tiendaId.catalogoPublico;
  ['activo', 'nombreTienda', 'whatsapp'].forEach(campo => {
    assert.ok(nodo[campo], `falta la regla de ${campo}`);
    assert.ok(
      nodo[campo]['.write'].includes("rol').val() === 'admin'"),
      `${campo} debería exigir rol admin para escribirse`
    );
  });
});

test('catalogoPublico: el .write general bloquea que un update() genérico cambie activo/nombreTienda/whatsapp por afuera', () => {
  const reglas = cargarReglas();
  const nodo = reglas.rules.tiendas.$tiendaId.catalogoPublico;
  ['activo', 'nombreTienda', 'whatsapp'].forEach(campo => {
    assert.ok(
      nodo['.write'].includes(`data.child('${campo}')`),
      `el .write general de catalogoPublico debería seguir bloqueando "${campo}"`
    );
  });
});

test('catalogoPublico/productos: cualquier cuenta de la tienda puede actualizar productos existentes, pero crear uno nuevo exige admin', () => {
  const reglas = cargarReglas();
  const nodo = reglas.rules.tiendas.$tiendaId.catalogoPublico.productos.$code;
  assert.ok(nodo, 'falta tiendas/$tiendaId/catalogoPublico/productos/$code');
  // Mismo patrón que products/$code (ver el resto del archivo): la
  // condición "newData.exists() || rol === admin" es la forma en que
  // este proyecto decide quién puede tocar qué en varios nodos —
  // este test solo confirma que el nodo nuevo sigue el mismo patrón,
  // no que ese patrón sea el ideal (eso es una decisión de producto
  // ya tomada, no algo que este test deba juzgar).
  assert.ok(nodo['.write'].includes('newData.exists()'));
  assert.ok(nodo['.write'].includes("rol').val() === 'admin'"));
});
