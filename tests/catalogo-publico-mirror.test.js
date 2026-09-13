// =========================================================
// Espejo automático hacia el Catálogo público
// =========================================================
// Cubre lo más nuevo y frágil de la sesión que agregó
// mirrorCatalogoPublicoProducto(): que saveProduct()/deleteProduct()/
// renameProductCode() (los wrappers, no los *Core) mantengan
// tiendas/{tiendaId}/catalogoPublico/productos EXACTAMENTE en
// sincronía con /products — sin precio, costo ni stock — cada vez
// que un producto se crea, edita, borra o cambia de código.
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEntornoFirebase, prepararTienda, normalizar } = require('./helpers/load-firebase-env.js');

function nuevoEntorno() {
  const window = crearEntornoFirebase();
  prepararTienda(window, 'tienda-1');
  return window;
}

async function leerEspejo(window, code) {
  const snap = await window.refCatalogoPublico.child('productos').child(code).once('value');
  return normalizar(snap.val());
}

// mirrorCatalogoPublicoProducto() es fire-and-forget A PROPÓSITO (ver
// el comentario grande en firebase.js: no debe poder tumbar la
// operación real si el espejo falla) — no devuelve la promesa de su
// propia cadena interna, así que awaitear su resultado no alcanza
// para saber cuándo terminó de verdad. setTimeout(…, 0) es una
// macrotarea: para cuando se dispara, TODAS las microtareas ya
// encoladas (la cadena interna de mirrorCatalogoPublicoProducto
// incluida) ya corrieron.
function esperarEspejo() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

test('saveProduct() crea el espejo con solo nombre/categoría/imagen — nunca precio, costo ni stock', async () => {
  const window = nuevoEntorno();
  await window.saveProduct('P001', {
    name: 'Guitarra Acústica', category: 'cuerdas', image: 'https://x/img.jpg',
    price: 850, cost: 500, stock: 12
  }, undefined, true);
  await esperarEspejo();

  const espejo = await leerEspejo(window, 'P001');
  assert.deepEqual(espejo, { nombre: 'Guitarra Acústica', categoria: 'cuerdas', imagen: 'https://x/img.jpg' });
  assert.equal('price' in espejo, false, 'el espejo no debe tener precio');
  assert.equal('cost' in espejo, false, 'el espejo no debe tener costo');
  assert.equal('stock' in espejo, false, 'el espejo no debe tener stock');
});

test('saveProduct() sin imagen todavía deja el campo imagen vacío, no undefined ni ausente', async () => {
  const window = nuevoEntorno();
  await window.saveProduct('P002', { name: 'Cuerdas de repuesto', category: 'accesorios', price: 25, stock: 40 }, undefined, true);
  await esperarEspejo();

  const espejo = await leerEspejo(window, 'P002');
  assert.equal(espejo.imagen, '');
});

test('editar un producto ya existente actualiza el espejo (no lo duplica ni lo deja viejo)', async () => {
  const window = nuevoEntorno();
  await window.saveProduct('P003', { name: 'Amplificador', category: 'audio', price: 300, stock: 3 }, undefined, true);
  await window.saveProduct('P003', { name: 'Amplificador 40W', category: 'audio', price: 350 }, undefined, false);
  await esperarEspejo();

  const espejo = await leerEspejo(window, 'P003');
  assert.equal(espejo.nombre, 'Amplificador 40W');
});

test('deleteProduct() saca al producto del espejo también', async () => {
  const window = nuevoEntorno();
  await window.saveProduct('P004', { name: 'Pedal de distorsión', category: 'accesorios', price: 90, stock: 7 }, undefined, true);
  await esperarEspejo();
  assert.notEqual(await leerEspejo(window, 'P004'), null);

  await window.deleteProduct('P004');
  await esperarEspejo();
  assert.equal(await leerEspejo(window, 'P004'), null);
});

test('renameProductCode() mueve la entrada del espejo al código nuevo, sin dejar la vieja duplicada', async () => {
  const window = nuevoEntorno();
  await window.saveProduct('OLD-001', { name: 'Violín 4/4', category: 'cuerdas', price: 600, stock: 2 }, undefined, true);
  await esperarEspejo();

  await window.renameProductCode('OLD-001', 'NEW-001');
  await esperarEspejo();

  assert.equal(await leerEspejo(window, 'OLD-001'), null, 'el código viejo no debe seguir en el espejo');
  const nuevo = await leerEspejo(window, 'NEW-001');
  assert.equal(nuevo.nombre, 'Violín 4/4');
});

test('un producto marcado deleted no debería quedar visible en el espejo público', async () => {
  const window = nuevoEntorno();
  await window.saveProduct('P005', { name: 'Micrófono', category: 'audio', price: 200, stock: 5 }, undefined, true);
  await esperarEspejo();
  // Simula un borrado "suave" (deleted: true) escrito directo, como
  // hacen algunos flujos de import/undo en stock.js.
  await window.refProducts.child('P005').update({ deleted: true });
  // mirrorCatalogoPublicoProducto() se dispara desde saveProduct/
  // deleteProduct — para este caso puntual (escritura directa del
  // flag) lo llamamos nosotros mismos, como haría cualquier código
  // que toque ese flag.
  window.mirrorCatalogoPublicoProducto('P005');
  await esperarEspejo();

  assert.equal(await leerEspejo(window, 'P005'), null);
});

test('sincronizarCatalogoPublico() espeja productos que ya existían ANTES de que existiera este sistema (el bug real que reportó Coyi)', async () => {
  const window = nuevoEntorno();
  // Simula productos cargados directo a Firebase, sin pasar por
  // saveProduct() — exactamente lo que tiene cualquier tienda que ya
  // usaba VAERON antes de que el catálogo público existiera.
  await window.refProducts.child('VIEJO-1').set({ name: 'Bajo eléctrico', category: 'cuerdas', price: 900, stock: 2 });
  await window.refProducts.child('VIEJO-2').set({ name: 'Platillo Crash', category: 'baterías', price: 250, stock: 4 });

  assert.equal(await leerEspejo(window, 'VIEJO-1'), null, 'todavía no debería tener espejo — nunca pasó por saveProduct()');

  await window.sincronizarCatalogoPublico();

  const e1 = await leerEspejo(window, 'VIEJO-1');
  const e2 = await leerEspejo(window, 'VIEJO-2');
  assert.equal(e1.nombre, 'Bajo eléctrico');
  assert.equal(e2.nombre, 'Platillo Crash');
});

test('sincronizarCatalogoPublico() no espeja productos borrados (deleted: true)', async () => {
  const window = nuevoEntorno();
  await window.refProducts.child('BORRADO-1').set({ name: 'Producto descontinuado', category: 'otros', price: 10, stock: 0, deleted: true });

  await window.sincronizarCatalogoPublico();

  assert.equal(await leerEspejo(window, 'BORRADO-1'), null);
});

test('sincronizarCatalogoPublico() con la tienda sin productos todavía no falla, solo no hace nada', async () => {
  const window = nuevoEntorno();
  await assert.doesNotReject(() => window.sincronizarCatalogoPublico());
});
