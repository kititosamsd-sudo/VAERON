# Adonay — Maqueta / esqueleto

Esta app es el mismo esqueleto usado en el proyecto anterior, reutilizado
para **Adonay**. Estado actual:

## Modo demo (sin Firebase)
No está conectada a ningún proyecto Firebase real todavía. En su lugar,
`mock-sdk.js` simula la base de datos y el login guardando todo en el
navegador (localStorage). Los datos de ejemplo (productos y clientes) se
crean solos la primera vez que se abre la app.

**Cuando tengas el proyecto Firebase real de Adonay:**
1. Borra `mock-sdk.js` y su `<script>` en `index.html` y `login.html`.
2. Vuelve a agregar los 3 `<script>` del SDK real de Firebase (compat) —
   quedó comentado dónde iban, en esos mismos archivos.
3. Pega tu configuración real (`firebaseConfig`) al inicio de `firebase.js`.
4. Reemplaza los datos de ejemplo (`SEED_PRODUCTS` / `SEED_CLIENTS`, también
   en `firebase.js`) por el catálogo y cartera real, o bórralos si vas a
   cargar todo por importación de Excel.

## Multi-cuenta (SaaS): tiendas + súper-admin
Esta maqueta ahora soporta varias tiendas/empresas con cuentas
separadas, más un rol de **súper-admin** (el dueño del sistema, vos)
que no pertenece a ninguna tienda y solo administra la lista de
tiendas.

- **Súper-admin (vos)**: entra con `vaeronspa@gmail.com` / `123456` (se
  crea solo la primera vez, igual que antes). Al entrar ve únicamente
  la pantalla **Tiendas**: lista de tiendas, botón "Nueva tienda"
  (crea el nombre de la tienda + su primer usuario admin con correo y
  contraseña reales), y un botón para **Suspender/Reactivar** cada
  tienda — pensado para cuando una tienda no paga la mensualidad.
- **Cuenta de una tienda (admin/vendedor)**: entra con el correo y
  contraseña que le creaste desde "Nueva tienda". Nunca ve la lista
  de otras tiendas ni las secciones del súper-admin.
- Si suspendés una tienda, a sus usuarios se les cierra la sesión al
  instante (estén o no con la app abierta) y no pueden volver a
  entrar hasta que la reactives.

### Jerarquía de roles dentro de una tienda
Cada tienda es dueña de su propia jerarquía — el admin de tienda no
depende del súper-admin para dar de alta vendedores (ver
`registros-logic.js`).

- **Admin de tienda**: dominio total de su tienda — Dashboard, Stock,
  Catálogo, Pedidos, Historial, Foro, Registros (alta y gestión de sus
  vendedores), Configuración y Perfil.
- **Vendedor**: opera dentro de los límites que puso el admin — Stock
  (solo ver), Catálogo, Pedidos/Nota de pedido (crear notas, agregar
  clientes de a uno), Historial, Configuración y Perfil. Sin Dashboard,
  sin Foro, sin Registros, sin ninguna acción administrativa.

Esto se resuelve en `auth-guard.js` (variable `currentUserRole`,
`'superadmin' | 'admin' | 'vendedor'`, clase `role-<rol>` en
`<html>`) y se oculta visualmente en `base.css` vía selectores como
`.role-vendedor .nav-admin-only { display: none !important; }`.

### Permisos configurables del equipo (real)
Además de la jerarquía fija de arriba, el admin de cada tienda puede
abrirle a sus vendedores tres puertas puntuales desde
**Configuración → Tienda y cuenta → Permisos del equipo**:
Ver Dashboard, Ver Foro y Editar Stock (agregar/editar/mover/eliminar
productos — por defecto el vendedor solo puede ver el Stock).

- Se guarda en `tiendas/{tiendaId}/config/permisosVendedor`
  (`getPermisosVendedor()` / `setPermisosVendedor()` /
  `watchPermisosVendedor()` en `firebase.js`), todo en `false` por
  defecto — ninguna tienda cambia de comportamiento hasta que el
  admin toque algo.
- `auth-guard.js` expone `puedeVerDashboard()`, `puedeVerForo()` y
  `puedeEditarStock()` — admin/súper-admin siempre pasan; el vendedor
  solo si el permiso está activo.
- El bloqueo REAL de rutas está en `router.js`
  (`RESTRICCION_ROL_PERMISO`, en vez de la lista fija
  `RESTRICCION_ROL` que usan el resto de páginas) — entrar a mano por
  URL sigue sin servir si el permiso está apagado.
- El menú (`nav.js`, función `aplicarPermisosVendedor()`) y las
  acciones de Stock (`stock.js`, función
  `applyStockRoleRestrictions()`) se actualizan en vivo: si el admin
  prende o apaga un permiso mientras el vendedor ya tiene la app
  abierta, se aplica al toque, sin recargar.

### CRM de clientes (real)
Cada cliente (en Pedidos → tabla de clientes) tiene, además de
RUC/razón social/ciudad, datos de seguimiento: **teléfono, correo,
cumpleaños (día y mes, sin año), qué le interesa y notas internas**
— todo opcional, editable desde el mismo modal de "Editar cliente"
(`saveClient()` en `firebase.js`, con `null` para los campos que
quedan vacíos, así Firebase no guarda basura).

El botón **"Ver"** de cada fila (disponible para admin y vendedor —
a diferencia de "Editar", que sigue siendo solo admin) abre una
ficha de solo lectura con esos datos más el **historial de compras
real**: todos los pedidos de `/orders` cuyo `cliente.ruc` coincide,
con fecha, número y total, más el total gastado acumulado
(`getOrders()` en `firebase.js` — lectura puntual, no un listener
en vivo, para no interferir con el de Historial; ver
`openClientDetail()` en `pedidos-logic.js`).

### Catálogo público (real, standalone)
Página pública sin login: `catalogo-publico.html?proyecto=X&tienda=Y`
(link generado en Configuración → Catálogo público, solo admin).
Muestra nombre, foto y categoría de cada producto — **nunca precio,
costo ni stock** — con botón de WhatsApp por producto y uno flotante
general.

- No pasa por `router.js`/`auth-guard.js`: es una página aparte, sin
  sesión, que se conecta directo al proyecto Firebase correspondiente
  usando `firebase-projects.js`.
- Los datos viven en `tiendas/{tiendaId}/catalogoPublico` — un espejo
  con SOLO `{nombre, categoria, imagen}` por producto, nunca el
  producto real (que sí tiene precio/costo/stock). Se arma solo:
  `saveProduct()`, `deleteProduct()` y `renameProductCode()` en
  `firebase.js` llaman a `mirrorCatalogoPublicoProducto()` en cada
  alta/edición/borrado/cambio de código — nadie tiene que
  mantenerlo a mano.
- Lectura pública permitida SOLO si `activo === true` (el switch de
  Configuración) — ver el nodo `catalogoPublico` en
  `database.rules.json`. Mientras esté apagado, el link no muestra
  nada aunque alguien lo tenga guardado.
- El link en sí (`?proyecto=X&tienda=Y`) lo arma
  `calcularLinkCatalogoPublico()` en `configuracion-logic.js`, usando
  `proyectoActivo` (cuál de los proyectos Firebase aloja esa tienda,
  ver `firebase-projects.js`) + `currentTiendaId`.
- **Backfill de productos viejos**: `mirrorCatalogoPublicoProducto()`
  solo espeja un producto cada vez que se guarda/edita/borra DE ACÁ EN
  ADELANTE — una tienda con productos cargados ANTES de esta función
  ve "0 productos" en el catálogo hasta correr
  `sincronizarCatalogoPublico()` (en `firebase.js`), que espeja todo
  el Stock existente de una sola vez. Se dispara solo la primera vez
  que se activa el switch (en `toggleCatalogoPublicoActivo()`,
  `configuracion-logic.js`), y también hay un botón manual "Volver a
  sincronizar productos" en la misma tarjeta de Configuración, por si
  hace falta repetirlo (ej. después de una importación masiva).

### RUC o DNI (real)
El documento del cliente (Pedidos → Editar cliente) acepta RUC (11
dígitos) o DNI (8 dígitos) — antes solo RUC, pensado para clientes
B2B. El campo interno se sigue llamando `ruc` (no se migró el nombre
del campo en Firebase, solo la validación y las etiquetas visibles),
así que un DNI de 8 dígitos queda guardado ahí igual.

### Próximos cumpleaños en el Dashboard (real)
Nuevo panel junto a "Stock bajo" — mismo gate de plan que la tarjeta
de clientes (Medio/Premium, `aplicarVisibilidadClientes()`): sin eso
no hay `/clients` que mirar. Ventana fija de 14 días
(`VENTANA_CUMPLEANOS_DIAS` en `dashboard-logic.js`), calculada con
`diasHastaProximoCumple()` sobre `cumpleDia`/`cumpleMes` del CRM (sin
año, no lo guarda). Se recalcula con el mismo `watchClients()` que ya
alimentaba la tarjeta de clientes — no abre un listener nuevo.

### Historial: un vendedor puede editar sus propios pedidos (real)
Antes "Editar"/"Eliminar" en Historial no tenían NINGÚN chequeo de
rol del lado del cliente (aunque `database.rules.json` sí lo exigía
del lado del servidor: `orders/$orderId` ya bloqueaba a un vendedor
editando un pedido ajeno) — el bug era de experiencia, no de
seguridad: un vendedor veía el botón, lo tocaba, y Firebase se lo
rechazaba en silencio. Ahora `puedeEditarPedido(nota)`
(`auth-guard.js`) decide si mostrar esos botones: el admin siempre,
un vendedor solo si `nota.vendedorUid` es el suyo (mismo campo que
ya guardaba `nueva-nota-logic.js` al crear la nota). Ver
`abrirVerNotaHistorial()` en `historial-logic.js`.

**Estado del catálogo:** el catálogo (productos, clientes, notas)
ya vive separado por tienda, bajo `/tiendas/{tiendaId}/products`,
`/clients`, `/orders`, etc. — totalmente aislado entre tiendas (ver
`scopedRef()` en `firebase.js`).

## Login de administrador (demo)
- Correo: `vaeronspa@gmail.com`
- Clave: `123456`

Se crea automáticamente la primera vez que se inicia sesión con esas
credenciales — no necesitas configurar nada más para probar la app.

## Qué cambió respecto al esqueleto anterior
- Rediseño visual completo: paleta verde botella + cobre, tipografía
  Sora / JetBrains Mono, fondo de login con degradado animado (sin fotos).
- Se agregó una pantalla nueva de **Dashboard** (resumen general con
  gráficos: ventas de los últimos 7 días, stock por almacén, stock por
  categoría, además de valor de inventario, stock bajo, clientes y
  últimas notas) como pantalla de inicio.
- Se quitaron el logo y las referencias de la empresa anterior.
- Se quitó la conexión real a Firebase (ver arriba).
- **Stock ahora tiene 3 almacenes** (Almacén 1/2/3), cada uno con su propia
  cantidad por producto. Ver detalle abajo.

## Almacenes en Stock
La pantalla de Stock tiene pestañas arriba: "Todos los almacenes" y
Almacén 1/2/3.

- **Todos los almacenes**: se ve el stock TOTAL de cada producto (como
  antes) — es la suma de los 3 almacenes. El botón "Editar" de acá edita
  nombre, precio, descripción y cantidad total igual que siempre.
- **Un almacén específico**: la columna "Stock" muestra solo la cantidad
  de ESE almacén. El botón "Editar" ahí abre un modal chico para ajustar
  solo esa cantidad (no toca nombre/precio). Los botones de la barra
  cambian a **"Importar cantidad"** y **"Exportar"**, y ambos trabajan
  solo sobre el almacén activo:
  - *Importar cantidad*: sube un Excel/CSV con columnas Código y
    Cantidad — SUMA esa cantidad al almacén seleccionado (no crea
    productos nuevos, no toca el precio).
  - *Exportar*: baja un Excel con Código, Nombre y Cantidad de ese
    almacén.

El total (pestaña "Todos") siempre se mantiene igual a la suma de los 3
almacenes — se actualiza solo cada vez que se edita o importa un
almacén específico.

## Optimizaciones internas
- `mock-sdk.js` ya no vuelve a leer y parsear todo el localStorage en
  cada operación — mantiene una copia en memoria y solo la persiste al
  escribir, y solo avisa a las pantallas (Dashboard, Stock, Pedidos...)
  que realmente están escuchando esa parte de los datos que cambiaron
  (antes recorría y recalculaba todos los listeners abiertos con cada
  escritura, sin importar si les correspondía o no).
- El Dashboard ya no vuelve a dibujar los 3 gráficos completos cada vez
  que llega cualquier dato — un cambio de stock solo repinta los
  gráficos de almacén/categoría, y una nota nueva solo repinta el de
  ventas.
- Se quitó una definición duplicada de `escapeHtml()` (había dos
  versiones ligeramente distintas en el proyecto original; una de
  ellas tenía un bug menor con el valor `0` y quedaba tapada en
  silencio por la otra).

## Datos de ejemplo
Los productos y clientes que ves al abrir la app son de ejemplo
(Producto A/B/C..., Cliente de ejemplo 1-4). Bórralos o reemplázalos desde
Stock / Registros de clientes, o edita `SEED_PRODUCTS` / `SEED_CLIENTS` en
`firebase.js` antes de la primera vez que se abra la app en un dispositivo.

## Antes de subir a producción (checklist)
- **No subas `reiniciar-cuentas.html`** al hosting público — es una
  herramienta de desarrollo que solo borra el mock local
  (`localStorage`), no toca Firebase, pero no tiene sentido dejarla
  accesible en el servidor real.
- **Sí subas `catalogo-publico.html`** al hosting — a diferencia de
  `reiniciar-cuentas.html`, esta es una página real que un cliente
  final puede recibir como link (ver Configuración → Catálogo
  público). También necesita `variables.css` y `firebase-projects.js`
  disponibles ahí, que ya se suben junto con el resto de la app.
- Verifica que `database.rules.json` esté publicado (idéntico) en las
  **8** bases de Firebase — correr `node scripts/check-views-sync.js`
  solo valida que las vistas y el router coincidan, no reemplaza subir
  las reglas a la consola.
- Corre `npm test` y confirma que todas las pruebas pasen antes de
  armar el zip final.

### Suite de tests (`tests/`)
Reconstruida en la sesión del catálogo público, después de detectar
que el zip subido no traía ninguna (`npm test` daba 0 pruebas pese a
haberse hablado antes de una suite de 75+). Si en algún momento
aparece esa suite vieja en otro lado, es preferible recuperarla —
esto es una base nueva, no un reemplazo con la misma cobertura.

- `tests/helpers/load-firebase-env.js` — el harness: levanta un
  "Firebase" real pero local (`mock-sdk.js` + `firebase-projects.js` +
  `firebase.js`, concatenados en un solo `<script>` de jsdom — ver el
  comentario grande ahí sobre por qué no se pueden cargar por
  separado) y, para los tests que tocan DOM, también
  `selection.js` + `stock.js` + `pedidos-logic.js` más el HTML real
  de `views/pedidos-view.html`.
  - **Ojo con el alcance**: prueba la LÓGICA de la app contra un mock
    local, no las reglas de seguridad de `database.rules.json` (esas
    solo las aplica el servidor de Firebase de verdad — para
    probarlas haría falta el Firebase Emulator Suite, que no está
    instalado acá).
- `tests/catalogo-publico-mirror.test.js` — que `saveProduct()`/
  `deleteProduct()`/`renameProductCode()` mantengan el espejo de
  `catalogoPublico` en sincronía (sin precio/costo/stock).
- `tests/crm-clientes.test.js` — campos nuevos del cliente, que los
  opcionales en `null` no queden guardados, y `getOrders()` filtrado
  por RUC para el historial de compras.
- `tests/permisos-vendedor.test.js` — defaults en `false`, que cada
  tienda tenga sus propios permisos.
- `tests/pedidos-cliente-dom.test.js` — `saveEdit()`/`openNewClient()`/
  `openEdit()`/`openClientDetail()` disparados sobre el HTML real
  (validación de RUC/DNI/correo/nombre, documento duplicado, precarga
  de campos, historial de compras real en la ficha, restricción para
  vendedor).
- `tests/puede-editar-pedido.test.js` — quién puede editar/eliminar
  una nota en Historial (admin siempre; vendedor solo la suya),
  extrayendo la función real de `auth-guard.js` sin cargar todo ese
  archivo (overlay del DOM, timers, `firebase.auth()` — ver el
  comentario del propio test).
- `tests/router-permisos.test.js` — bloqueo real de rutas en
  `router.js` (no solo el link del menú escondido): rol fijo,
  permiso configurable, página de inicio por rol, súper-admin fuera
  de las páginas de una tienda y viceversa.
- `tests/database-rules-shape.test.js` — chequeos estructurales de
  `database.rules.json` (JSON válido, que los nodos nuevos sigan
  exigiendo rol admin, que el candado de `config`/`catalogoPublico`
  no se haya roto).
- `tests/views-sync.test.js` — el mismo chequeo de
  `scripts/check-views-sync.js` (ahora exportado desde ahí, un solo
  parser para los dos) pero como parte de `npm test`.

De paso, armar el harness hizo notar dos bugs reales en
`mock-sdk.js` (no en producción, pero sí en la fidelidad del modo
demo): `transaction()` no resolvía `ServerValue.TIMESTAMP`, y `.set()`
no limpiaba campos anidados en `null` (Firebase real trata `null`
como "borrar esa clave" en cualquier tipo de escritura) — los dos ya
están corregidos.

