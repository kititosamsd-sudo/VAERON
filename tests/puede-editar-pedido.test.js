// =========================================================
// puedeEditarPedido() — quién puede editar/eliminar una nota en
// Historial
// =========================================================
// auth-guard.js completo trae mucho equipaje para un test (crea un
// overlay en el DOM al cargar, arranca un setTimeout de
// authTimeout, y engancha firebase.auth().onAuthStateChanged en su
// nivel de módulo — nada de eso es necesario para probar esta
// función puntual). En vez de cargar todo el archivo o copiar la
// función a mano acá (que se desincroniza el día que alguien la
// cambie y se olvide de actualizar el test), se extrae el texto
// REAL de la función desde auth-guard.js con una regex y se corre
// en un sandbox chico con isAdmin()/currentUserRole/currentUserUid
// simulados — así el test sigue viendo cualquier cambio real a la
// función, sin arrastrar el resto del archivo.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const AUTH_GUARD_PATH = path.join(__dirname, '..', 'auth-guard.js');

function extraerPuedeEditarPedido() {
  const src = fs.readFileSync(AUTH_GUARD_PATH, 'utf8');
  const inicio = src.indexOf('function puedeEditarPedido(nota) {');
  if (inicio === -1) throw new Error('No se encontró puedeEditarPedido() en auth-guard.js — ¿se renombró?');
  const fin = src.indexOf('\n}', inicio) + 2;
  return src.slice(inicio, fin);
}

function crearPuedeEditarPedido({ esAdmin, rol, uid }) {
  const sandbox = {
    isAdmin: () => esAdmin,
    currentUserRole: rol,
    currentUserUid: uid,
  };
  vm.createContext(sandbox);
  vm.runInContext(extraerPuedeEditarPedido(), sandbox);
  return sandbox.puedeEditarPedido;
}

test('el admin puede editar cualquier pedido, sea de quien sea', () => {
  const puedeEditarPedido = crearPuedeEditarPedido({ esAdmin: true, rol: 'admin', uid: 'uid-admin' });
  assert.equal(puedeEditarPedido({ vendedorUid: 'uid-cualquiera' }), true);
  assert.equal(puedeEditarPedido({}), true, 'incluso una nota sin vendedorUid (creada antes de este campo)');
});

test('un vendedor puede editar SU PROPIO pedido', () => {
  const puedeEditarPedido = crearPuedeEditarPedido({ esAdmin: false, rol: 'vendedor', uid: 'uid-juan' });
  assert.equal(puedeEditarPedido({ vendedorUid: 'uid-juan' }), true);
});

test('un vendedor NO puede editar el pedido de otro vendedor', () => {
  const puedeEditarPedido = crearPuedeEditarPedido({ esAdmin: false, rol: 'vendedor', uid: 'uid-juan' });
  assert.equal(puedeEditarPedido({ vendedorUid: 'uid-maria' }), false);
});

test('un vendedor no puede editar una nota vieja sin vendedorUid guardado', () => {
  const puedeEditarPedido = crearPuedeEditarPedido({ esAdmin: false, rol: 'vendedor', uid: 'uid-juan' });
  assert.equal(puedeEditarPedido({}), false);
  assert.equal(puedeEditarPedido(null), false);
});
