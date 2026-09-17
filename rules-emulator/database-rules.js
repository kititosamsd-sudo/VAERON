// =========================================================
// database.rules.json — pruebas contra el Emulador REAL
// =========================================================
// A diferencia de tests/database-rules-shape.test.js (que solo mira
// la FORMA del JSON — que el texto de la regla siga mencionando
// "rol admin", por ejemplo), esto corre las reglas de verdad contra
// el Emulador de Firebase: cada assertSucceeds()/assertFails() es
// una escritura/lectura real que el motor de reglas evalúa, línea
// por línea, igual que lo haría en producción.
//
// NO corre con `npm test` — necesita el Emulador levantado (baja un
// .jar de storage.googleapis.com la primera vez, así que hace falta
// internet real, no alcanza con lo que tiene este sandbox). Se corre
// aparte:
//
//   npm run test:rules
//
// (ese script levanta el Emulador, corre esto, y lo apaga solo — ver
// "test:rules" en package.json). Si querés dejarlo levantado para ir
// iterando, `npm run emulators` en una terminal y esto en otra.
const { before, after, beforeEach, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');

const RULES_PATH = path.join(__dirname, '..', 'database.rules.json');

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-vaeron-rules-test',
    database: {
      rules: fs.readFileSync(RULES_PATH, 'utf8'),
      host: '127.0.0.1',
      port: 9000
    }
  });
});

after(async () => {
  if (testEnv) await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearDatabase();
});

// Arma una cuenta admin + una vendedor para una tienda de prueba,
// escribiendo /cuentas directo (con las reglas desactivadas — eso es
// lo que testEnv.withSecurityRulesDisabled() es para: sembrar datos
// de partida sin que las reglas que estamos probando se metan en el
// medio).
async function sembrarCuentas(tiendaId) {
  await testEnv.withSecurityRulesDisabled(async context => {
    const db = context.database();
    await db.ref(`cuentas/uid-admin`).set({ rol: 'admin', tiendaId });
    await db.ref(`cuentas/uid-vendedor`).set({ rol: 'vendedor', tiendaId });
    await db.ref(`cuentas/uid-otra-tienda-admin`).set({ rol: 'admin', tiendaId: 'otra-tienda' });
  });
}

function comoAdmin() {
  return testEnv.authenticatedContext('uid-admin', { email: 'admin@tienda.com' }).database();
}
function comoVendedor() {
  return testEnv.authenticatedContext('uid-vendedor', { email: 'vendedor@tienda.com' }).database();
}
function comoAdminDeOtraTienda() {
  return testEnv.authenticatedContext('uid-otra-tienda-admin', { email: 'otro@x.com' }).database();
}
function sinLogin() {
  return testEnv.unauthenticatedContext().database();
}

const TIENDA = 'tda-test-1';

// ── permisosVendedor ─────────────────────────────────────────────
test('permisosVendedor: el admin de la tienda puede activarlo', async () => {
  await sembrarCuentas(TIENDA);
  await assertSucceeds(
    comoAdmin().ref(`tiendas/${TIENDA}/config/permisosVendedor`).set({ verDashboard: true, verForo: false, editarStock: false })
  );
});

test('permisosVendedor: un vendedor de la MISMA tienda NO puede activárselo solo', async () => {
  await sembrarCuentas(TIENDA);
  await assertFails(
    comoVendedor().ref(`tiendas/${TIENDA}/config/permisosVendedor`).set({ verDashboard: true, verForo: true, editarStock: true })
  );
});

test('permisosVendedor: un admin de OTRA tienda no puede tocarlo', async () => {
  await sembrarCuentas(TIENDA);
  await assertFails(
    comoAdminDeOtraTienda().ref(`tiendas/${TIENDA}/config/permisosVendedor`).set({ verDashboard: true, verForo: false, editarStock: false })
  );
});

test('permisosVendedor: un update() genérico sobre TODO config no puede colar un cambio ahí (el candado sigue funcionando)', async () => {
  await sembrarCuentas(TIENDA);
  // Mismo patrón que ya protegía logoUrl/almacenesNombres — confirma
  // que agregar permisosVendedor al candado de arriba (el .write
  // general de "config") no se rompió.
  await assertFails(
    comoVendedor().ref(`tiendas/${TIENDA}/config`).update({ 'permisosVendedor/editarStock': true })
  );
});

// ── catalogoPublico ──────────────────────────────────────────────
test('catalogoPublico: nadie (ni logueado) puede leerlo si activo !== true', async () => {
  await sembrarCuentas(TIENDA);
  await testEnv.withSecurityRulesDisabled(async context => {
    await context.database().ref(`tiendas/${TIENDA}/catalogoPublico`).set({
      activo: false, nombreTienda: 'x', whatsapp: '51999999999',
      productos: { P1: { nombre: 'Guitarra', categoria: 'x', imagen: '' } }
    });
  });
  await assertFails(sinLogin().ref(`tiendas/${TIENDA}/catalogoPublico`).once('value'));
});

test('catalogoPublico: CUALQUIERA (sin login) puede leerlo si activo === true', async () => {
  await sembrarCuentas(TIENDA);
  await testEnv.withSecurityRulesDisabled(async context => {
    await context.database().ref(`tiendas/${TIENDA}/catalogoPublico`).set({
      activo: true, nombreTienda: 'x', whatsapp: '51999999999',
      productos: { P1: { nombre: 'Guitarra', categoria: 'x', imagen: '' } }
    });
  });
  await assertSucceeds(sinLogin().ref(`tiendas/${TIENDA}/catalogoPublico`).once('value'));
});

test('catalogoPublico: solo el admin de la tienda puede activarlo', async () => {
  await sembrarCuentas(TIENDA);
  await assertSucceeds(comoAdmin().ref(`tiendas/${TIENDA}/catalogoPublico/activo`).set(true));
  await assertFails(comoVendedor().ref(`tiendas/${TIENDA}/catalogoPublico/activo`).set(true));
});

test('catalogoPublico/productos: cualquier cuenta de la tienda puede actualizar un producto existente', async () => {
  await sembrarCuentas(TIENDA);
  await testEnv.withSecurityRulesDisabled(async context => {
    await context.database().ref(`tiendas/${TIENDA}/catalogoPublico/productos/P1`).set({ nombre: 'x', categoria: 'x', imagen: '' });
  });
  await assertSucceeds(
    comoVendedor().ref(`tiendas/${TIENDA}/catalogoPublico/productos/P1`).update({ nombre: 'Nombre nuevo' })
  );
});

test('catalogoPublico/productos: un vendedor NO puede crear un producto nuevo ahí (recién editar uno que ya existe)', async () => {
  await sembrarCuentas(TIENDA);
  await assertFails(
    comoVendedor().ref(`tiendas/${TIENDA}/catalogoPublico/productos/P-NUEVO`).set({ nombre: 'x', categoria: 'x', imagen: '' })
  );
  await assertSucceeds(
    comoAdmin().ref(`tiendas/${TIENDA}/catalogoPublico/productos/P-NUEVO`).set({ nombre: 'x', categoria: 'x', imagen: '' })
  );
});

test('catalogoPublico: nadie de otra tienda puede escribir acá, ni siquiera un admin', async () => {
  await sembrarCuentas(TIENDA);
  await assertFails(comoAdminDeOtraTienda().ref(`tiendas/${TIENDA}/catalogoPublico/activo`).set(true));
});

// ── orders: un vendedor solo edita SU propio pedido ─────────────
test('orders: un vendedor puede crear un pedido propio', async () => {
  await sembrarCuentas(TIENDA);
  await assertSucceeds(
    comoVendedor().ref(`tiendas/${TIENDA}/orders/o1`).set({
      vendedorUid: 'uid-vendedor', subtotal: 100, total: 100, cliente: { ruc: '20111111111' }
    })
  );
});

test('orders: un vendedor NO puede editar un pedido creado por otro vendedor', async () => {
  await sembrarCuentas(TIENDA);
  await testEnv.withSecurityRulesDisabled(async context => {
    await context.database().ref(`tiendas/${TIENDA}/orders/o2`).set({
      vendedorUid: 'uid-otro-vendedor', subtotal: 50, total: 50, cliente: { ruc: '20222222222' }
    });
  });
  await assertFails(
    comoVendedor().ref(`tiendas/${TIENDA}/orders/o2`).update({ total: 999 })
  );
});

test('orders: el admin SÍ puede editar el pedido de cualquier vendedor', async () => {
  await sembrarCuentas(TIENDA);
  await testEnv.withSecurityRulesDisabled(async context => {
    await context.database().ref(`tiendas/${TIENDA}/orders/o3`).set({
      vendedorUid: 'uid-vendedor', subtotal: 50, total: 50, cliente: { ruc: '20333333333' }
    });
  });
  await assertSucceeds(
    comoAdmin().ref(`tiendas/${TIENDA}/orders/o3`).update({ total: 50, subtotal: 50 })
  );
});
