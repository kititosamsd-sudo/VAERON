// tests/registros-editar-vendedor.test.js
//
// Verifica, montando la vista REAL (views/registros-view.html), el
// modal "Editar cuenta" agregado en esta ronda: precarga de datos,
// que "Guardar cambios" sin tocar la contraseña solo actualiza
// nombre/correo, y que cambiarla de verdad permite iniciar sesión
// con la nueva (y ya NO con la vieja) — lo cual ejercita el mismo
// truco de instancia secundaria que createVendorAccount.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApp, readSrc, tiendaStore } = require('./helpers/load-app');

const VIEW_HTML = readSrc('views/registros-view.html');
const TIENDA = 'tienda-reg-editar';

function setup() {
  const { window, firebase } = loadApp(
    ['firebase.js', 'plan-limits.js', 'registros-logic.js'],
    VIEW_HTML, TIENDA
  );
  const store = tiendaStore(firebase, TIENDA);
  // renderRegistros() usa currentUserUid (normalmente lo fija
  // auth-guard.js al iniciar sesión) para no dejar que el admin se
  // elimine/edite a sí mismo desde esta lista — acá se simula con un
  // uid que nunca va a coincidir con los vendedores de prueba.
  const s = window.document.createElement('script');
  s.textContent = `currentUserUid = 'admin-uid-test';`;
  window.document.body.appendChild(s);
  return { window, firebase, store };
}

test('openEditVendor: precarga nombre, correo y contraseña actual (oculta) del vendedor', async () => {
  const { window, store } = setup();
  const uid = await window.createVendorAccount('pedro', 'clave123', 'Pedro Ruiz', 'pedro@vaeron.com');
  await window.loadRegistros();

  await window.openEditVendor(uid);

  assert.equal(window.document.getElementById('editVendorNombre').value, 'Pedro Ruiz');
  assert.equal(window.document.getElementById('editVendorEmail').value, 'pedro@vaeron.com');
  assert.equal(window.document.getElementById('editVendorCurrentPass').value, 'clave123', 'debe traerla desde vendorSecrets, ya no desde /usuarios');
  assert.equal(window.document.getElementById('editVendorCurrentPass').type, 'password', 'debe empezar oculta');
  assert.equal(window.document.getElementById('editVendorOverlay').classList.contains('open'), true);

  window.toggleEditVendorPasswordVisibility();
  assert.equal(window.document.getElementById('editVendorCurrentPass').type, 'text');
});

test('submitEditVendor: sin escribir contraseña nueva, solo actualiza nombre y correo (y NO cambia passwordActual)', async () => {
  const { window, firebase, store } = setup();
  const uid = await window.createVendorAccount('maria', 'clave456', 'Maria Lopez', '');
  await window.loadRegistros();

  await window.openEditVendor(uid);
  window.document.getElementById('editVendorNombre').value = 'María López';
  window.document.getElementById('editVendorEmail').value = 'maria@vaeron.com';
  window.document.getElementById('editVendorPassword').value = ''; // sin cambiarla

  await window.submitEditVendor();

  assert.equal(store.usuarios[uid].nombre, 'María López');
  assert.equal(store.usuarios[uid].correo, 'maria@vaeron.com');
  assert.equal(firebase._store.vendorSecrets[TIENDA][uid], 'clave456', 'no debe tocarse si se dejó vacía');
  assert.equal(window.document.getElementById('editVendorOverlay').classList.contains('open'), false, 'se cierra al guardar bien');
});

test('submitEditVendor: cambiar la contraseña realmente permite iniciar sesión con la nueva y ya no con la vieja', async () => {
  const { window, firebase, store } = setup();
  const uid = await window.createVendorAccount('carla', 'viejaClave1', 'Carla Reyes');
  await window.loadRegistros();

  await window.openEditVendor(uid);
  window.document.getElementById('editVendorPassword').value = 'nuevaClave2';
  await window.submitEditVendor();

  assert.equal(firebase._store.vendorSecrets[TIENDA][uid], 'nuevaClave2', 'debe guardar la copia de la nueva contraseña');

  const authEmail = window.usernameToAuthEmail('carla');
  const appLogin = firebase.initializeApp({}, 'login-check-' + Date.now());

  await assert.rejects(
    () => appLogin.auth().signInWithEmailAndPassword(authEmail, 'viejaClave1'),
    (err) => err.code === 'auth/wrong-password',
    'la contraseña vieja ya no debe funcionar'
  );
  const cred = await appLogin.auth().signInWithEmailAndPassword(authEmail, 'nuevaClave2');
  assert.equal(cred.user.uid, uid);
});

test('submitEditVendor: rechaza una contraseña nueva demasiado corta sin llegar a tocar Firebase', async () => {
  const { window, firebase, store } = setup();
  const uid = await window.createVendorAccount('luis', 'clave789', 'Luis Paredes');
  await window.loadRegistros();

  await window.openEditVendor(uid);
  window.document.getElementById('editVendorPassword').value = '123'; // menos de 6

  await window.submitEditVendor();

  assert.equal(firebase._store.vendorSecrets[TIENDA][uid], 'clave789', 'no debe haber cambiado nada');
  assert.equal(window.document.getElementById('editVendorError').style.display, 'block');
  assert.equal(window.document.getElementById('editVendorOverlay').classList.contains('open'), true, 'el modal sigue abierto para corregir');
});
