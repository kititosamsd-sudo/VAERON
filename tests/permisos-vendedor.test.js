// =========================================================
// Permisos configurables del vendedor (Configuración → Permisos
// del equipo)
// =========================================================
// Solo prueba la capa de datos (getPermisosVendedor/
// setPermisosVendedor en firebase.js) — puedeVerDashboard()/
// puedeVerForo()/puedeEditarStock() viven en auth-guard.js, que
// estos tests no cargan (ver el comentario en
// tests/helpers/load-firebase-env.js sobre el alcance elegido).
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEntornoFirebase, prepararTienda, normalizar } = require('./helpers/load-firebase-env.js');

function nuevoEntorno() {
  const window = crearEntornoFirebase();
  prepararTienda(window, 'tienda-1');
  return window;
}

test('una tienda nueva, sin tocar nada, tiene los tres permisos en false — el comportamiento de siempre', async () => {
  const window = nuevoEntorno();
  const permisos = normalizar(await window.getPermisosVendedor());
  assert.deepEqual(permisos, { verDashboard: false, verForo: false, editarStock: false });
});

test('setPermisosVendedor() guarda solo lo que se le pasa y lo demás queda en false', async () => {
  const window = nuevoEntorno();
  await window.setPermisosVendedor({ editarStock: true });

  const permisos = await window.getPermisosVendedor();
  assert.equal(permisos.editarStock, true);
  assert.equal(permisos.verDashboard, false);
  assert.equal(permisos.verForo, false);
});

test('setPermisosVendedor() convierte cualquier valor "truthy" a booleano real, no lo guarda tal cual', async () => {
  const window = nuevoEntorno();
  // Así es como lo llama togglePermisoVendedor() en
  // configuracion-logic.js: toma el estado actual completo y le
  // cambia un solo campo — acá lo simulamos directo.
  await window.setPermisosVendedor({ verDashboard: 'sí', verForo: 1, editarStock: 0 });

  const permisos = await window.getPermisosVendedor();
  assert.equal(permisos.verDashboard, true);
  assert.equal(permisos.verForo, true);
  assert.equal(permisos.editarStock, false);
});

test('cada tienda tiene sus propios permisos — no se pisan entre sí', async () => {
  const windowA = crearEntornoFirebase();
  prepararTienda(windowA, 'tienda-a');
  const windowB = windowA; // mismo "Firebase" (mismo mock), pero cambiamos de tienda activa
  await windowA.setPermisosVendedor({ editarStock: true });

  prepararTienda(windowB, 'tienda-b');
  const permisosB = await windowB.getPermisosVendedor();
  assert.equal(permisosB.editarStock, false, 'tienda-b no debería heredar el permiso de tienda-a');

  prepararTienda(windowA, 'tienda-a');
  const permisosA = await windowA.getPermisosVendedor();
  assert.equal(permisosA.editarStock, true, 'tienda-a debe seguir con su propio permiso intacto');
});
