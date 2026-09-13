// =========================================================
// router.js — bloqueo de rutas por rol / permiso
// =========================================================
// Prueba lo que de verdad protege cada página cuando alguien escribe
// #dashboard, #tiendas, etc. a mano en la URL — no solo que el link
// del menú esté escondido (eso lo prueban los tests de nav.js /
// permisos-vendedor, no estos). Ver el comentario grande en go()
// dentro de router.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const { crearEntornoRouter } = require('./helpers/load-firebase-env.js');

test('un vendedor sin permisos no puede entrar a dashboard/foro/tiendas/registros — lo redirige a stock', () => {
  const window = crearEntornoRouter();
  window.currentUserRole = 'vendedor';
  window.puedeVerDashboard = () => false;
  window.puedeVerForo = () => false;

  window.Router.go('dashboard');
  assert.equal(window.Router.currentPage, 'stock');

  window.Router.go('foro');
  assert.equal(window.Router.currentPage, 'stock');

  window.Router.go('tiendas'); // superadmin-only
  assert.equal(window.Router.currentPage, 'stock');

  window.Router.go('registros'); // admin-only
  assert.equal(window.Router.currentPage, 'stock');
});

test('un vendedor CON el permiso de Dashboard/Foro activado sí puede entrar', () => {
  const window = crearEntornoRouter();
  window.currentUserRole = 'vendedor';
  window.puedeVerDashboard = () => true;
  window.puedeVerForo = () => true;

  window.Router.go('dashboard');
  assert.equal(window.Router.currentPage, 'dashboard');

  window.Router.go('foro');
  assert.equal(window.Router.currentPage, 'foro');
});

test('el permiso de Dashboard y el de Foro son independientes entre sí', () => {
  const window = crearEntornoRouter();
  window.currentUserRole = 'vendedor';
  window.puedeVerDashboard = () => false;
  window.puedeVerForo = () => true;

  window.Router.go('foro');
  assert.equal(window.Router.currentPage, 'foro', 'con solo el de Foro activado, Foro debería abrir');

  window.Router.go('dashboard');
  assert.equal(window.Router.currentPage, 'stock', 'sin el de Dashboard, Dashboard debería seguir bloqueado (cae en stock, la página de inicio de un vendedor sin ese permiso)');
});

test('stock/catalogo/pedidos/historial/configuracion son accesibles para admin y vendedor por igual (rol fijo, no depende de ningún permiso)', () => {
  const window = crearEntornoRouter();
  ['stock', 'catalogo', 'pedidos', 'historial', 'configuracion'].forEach(pagina => {
    window.currentUserRole = 'admin';
    window.Router.go(pagina, { force: true });
    assert.equal(window.Router.currentPage, pagina, `admin debería poder entrar a ${pagina}`);

    window.currentUserRole = 'vendedor';
    window.Router.go(pagina, { force: true });
    assert.equal(window.Router.currentPage, pagina, `vendedor debería poder entrar a ${pagina}`);
  });
});

test('un admin (o un vendedor) nunca puede entrar a las páginas de súper-admin', () => {
  const window = crearEntornoRouter();
  ['tiendas', 'facturacion', 'auditoria', 'config-sistema'].forEach(pagina => {
    window.currentUserRole = 'admin';
    window.Router.go(pagina, { force: true });
    assert.notEqual(window.Router.currentPage, pagina, `admin NO debería poder entrar a ${pagina}`);
  });
});

test('un súper-admin no puede entrar a páginas de una tienda (dashboard, stock...)', () => {
  const window = crearEntornoRouter();
  window.currentUserRole = 'superadmin';

  window.Router.go('stock');
  assert.notEqual(window.Router.currentPage, 'stock');
  assert.equal(window.Router.currentPage, 'tiendas', 'debería caer en su página de inicio (Tiendas)');
});

test('paginaDeInicioParaRol(): vendedor va a dashboard si tiene el permiso, si no a stock', () => {
  const window = crearEntornoRouter();
  window.puedeVerDashboard = () => true;
  assert.equal(window.Router.paginaDeInicioParaRol('vendedor'), 'dashboard');

  window.puedeVerDashboard = () => false;
  assert.equal(window.Router.paginaDeInicioParaRol('vendedor'), 'stock');

  assert.equal(window.Router.paginaDeInicioParaRol('admin'), 'dashboard');
  assert.equal(window.Router.paginaDeInicioParaRol('superadmin'), 'tiendas');
});

test('registros es exclusivo del admin — ni siquiera con permisos de vendedor activados', () => {
  const window = crearEntornoRouter();
  window.currentUserRole = 'vendedor';
  window.puedeVerDashboard = () => true;
  window.puedeVerForo = () => true;

  window.Router.go('registros');
  assert.notEqual(window.Router.currentPage, 'registros');
});
