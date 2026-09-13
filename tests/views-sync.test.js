// =========================================================
// Sincronía views/*.html ↔ VIEWS_HTML embebido en router.js
// =========================================================
// router.js NO carga views/*.html en tiempo real — las vistas están
// copiadas como texto dentro de router.js a propósito (para que la
// app funcione abriendo index.html con doble clic, sin servidor). Si
// alguien edita views/stock-view.html pensando que eso ya actualiza
// la app, no pasa nada — hay que volver a copiar ese HTML dentro de
// router.js a mano. Esta es la razón por la que existía
// scripts/check-views-sync.js como paso manual; acá se vuelve parte
// de `npm test`, así que una vista desincronizada frena el test en
// vez de depender de que alguien se acuerde de correr el script
// aparte antes de subir a producción.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT, ROUTER_PATH, FILES, extractEmbeddedViews } = require('../scripts/check-views-sync.js');

const routerSrc = fs.readFileSync(ROUTER_PATH, 'utf8');
const embedded = extractEmbeddedViews(routerSrc);

for (const [key, relPath] of Object.entries(FILES)) {
  test(`${relPath} coincide con router.js (VIEWS_HTML["${key}"])`, () => {
    const fileContent = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    const routerContent = embedded[key];
    assert.notEqual(routerContent, undefined, `router.js no tiene VIEWS_HTML["${key}"]`);
    assert.equal(
      fileContent, routerContent,
      `${relPath} quedó desincronizado de router.js — copiá el contenido embebido de ` +
      `VIEWS_HTML["${key}"] a ${relPath}, o si el cambio bueno está en ${relPath}, ` +
      `copialo dentro de router.js.`
    );
  });
}
