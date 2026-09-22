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
- **Categorías y orden**: chips de categoría (solo aparecen si hay más
  de una) + selector "Más reciente"/"Nombre A-Z"
  (`ordenarYFiltrar()`). El espejo ahora también guarda
  `actualizadoEn` (copia del `updatedAt` del producto real) para
  poder ordenar por más reciente.
- **Código QR**: se dibuja entero en el navegador (librería `qrcodejs`
  vía CDN, ver `<script>` en `app.html`) — el link nunca sale de la
  máquina de quien está en Configuración para generarlo. Botón
  "Descargar QR" en la misma tarjeta.
- **Vista previa en WhatsApp (Open Graph)**: tags estáticas en el
  `<head>` de `catalogo-publico.html` — a propósito NO dinámicas por
  tienda: el bot que arma la vista previa (WhatsApp, etc.) lee el
  HTML crudo sin correr JavaScript, así que escribir el nombre real
  de la tienda ahí con JS (como hace el resto de la página) no le
  llegaría a ese bot. Personalizarlo de verdad por tienda necesitaría
  que esta página se genere del lado del servidor — no es el caso
  hoy (ver el comentario grande en el propio `<head>`).
- **"Preguntar" con la foto real (cuando el navegador lo permite)**:
  WhatsApp no tiene NINGUNA forma de recibir una imagen adjunta a
  través de un link `wa.me` (esa API solo acepta texto) — eso no es
  un bug de acá, es un límite de WhatsApp. `preguntarPorProducto()`
  intenta primero el selector nativo de "Compartir" del celular (Web
  Share API con archivos), que sí puede adjuntar la foto de verdad;
  si el navegador no lo soporta o algo falla en el camino (CORS, la
  persona cancela el selector), cae al link de texto de siempre, con
  la url de la foto incluida en el mensaje.
- **Disponible / Agotado (automático, sin tocar nada a mano)**: el
  espejo guarda `disponible` (`stock > 0`), nunca la cantidad exacta.
  Se recalcula solo cada vez que el stock TOTAL de un producto cambia
  por cualquier camino — venta (`decrementStock`), ajuste manual
  (`saveProduct`), o cualquiera de las funciones de almacén que tocan
  el total (`addStock`, `updateWarehouseStock`, `setWarehouseStock`,
  `addWarehouseStock` — todas envueltas igual que `saveProduct`/
  `deleteProduct`, ver el comentario grande junto a
  `mirrorCatalogoPublicoProductoAsync()` en `firebase.js`).
  `moveWarehouseStock` (mover entre almacenes del mismo producto) NO
  dispara el espejo a propósito: no cambia el total, así que
  "disponible" no tiene por qué recalcularse ahí. En el catálogo
  público, un producto agotado se muestra igual (con una etiqueta
  "Agotado" y la foto atenuada) — nunca se oculta, porque alguien
  puede querer preguntar cuándo va a haber de nuevo (el botón cambia
  a "Consultar" con un mensaje distinto para ese caso).
- **Link a un producto puntual** (`?producto=P001`, agregado al
  mismo link del catálogo): botón "compartir" en cada tarjeta
  (`compartirProducto()`) arma ese link (Web Share si está
  disponible, si no copia al portapapeles). Al abrirlo, si el
  producto tiene foto se abre el visor de zoom directo; si no tiene,
  hace scroll hasta su tarjeta y la resalta un momento
  (`.cp-item-resaltado`). Un código que ya no existe no rompe nada,
  el catálogo carga normal.
- **Favoritos** (corazón en cada tarjeta, sin cuenta ni login) —
  guardados en `localStorage`, con clave `vaeron_favoritos_{tiendaId}`
  (separados por tienda: mirar el catálogo de dos tiendas distintas
  desde el mismo celular no mezcla sus favoritos). Toggle "Ver solo
  favoritos" en la barra de herramientas.
- **Analítica** (visitas totales + consultas por producto, sin
  nombres ni datos personales — solo números): cada carga de página
  exitosa suma 1 a `catalogoPublico/analitica/visitas`, cada
  "Preguntar"/"Consultar" suma 1 a
  `catalogoPublico/analitica/consultas/{code}` — ambos con
  `.transaction()` (no un `.set()`), porque dos visitas casi
  simultáneas no se pueden leer-y-sumar por separado sin pisarse.
  La regla de Firebase exige que cada escritura sea EXACTAMENTE
  `anterior + 1` (nunca saltos ni resets) y solo si el catálogo está
  activo — ver el nodo `analitica` en `database.rules.json`, con
  lectura restringida al admin de esa tienda (nunca pública, a
  diferencia del resto de `catalogoPublico`). Se ve en Configuración
  → Catálogo público → Analítica (`cargarAnaliticaCatalogoPublico()`
  en `configuracion-logic.js`), con el top 5 de productos más
  consultados con nombre (cruzando con el espejo de productos, sin
  tocar `/products` directo).

De paso encontré otro bug real en `mock-sdk.js`: `.update()` no
soportaba claves con `/` (los "multi-path update" reales de Firebase,
ej. `update({'analitica/visitas': 1})`) — las guardaba como un campo
de nombre literal rarísimo en vez de escribir en la ruta anidada.
Ya corregido.
- **Visor con zoom**: tocar la foto de un producto abre una vista
  ampliada (pellizcar para zoom, arrastrar para mover, doble tap/clic
  para alternar 1x↔2.5x, rueda del mouse en desktop) — todo con
  Pointer Events + `touch-action:none`, sin librerías externas. Usa
  la MISMA url que la miniatura (no hay una versión "grande" guardada
  aparte), así que nunca pixela más de lo que la foto original ya
  traía. Lógica al final del único `<script>` de
  `catalogo-publico.html` — `abrirLightbox()`/`cerrarLightbox()`.

### El visor de imagen del sistema (Stock/Catálogo) también hace zoom
El modal `imageViewModal` (`openImageView()` en `stock.js`, compartido
por Stock y Catálogo — no es el mismo visor del catálogo público de
arriba) tiene el mismo mecanismo de pellizco/arrastre/doble tap/rueda
del mouse. Como acá el `<img>` se RECREA cada vez que `router.js`
cambia de vista (a diferencia del catálogo público, que es una sola
página), `engancharZoomImageView()` usa un flag en el propio elemento
(`dataset.zoomListo`) en vez de una variable global, para enganchar de
nuevo en cada vista sin duplicar los listeners si se reabre varias
veces sin cambiar de pantalla.

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
- `tests/image-zoom.test.js` — pellizco/doble tap/rueda del mouse en
  el visor de imagen compartido de Stock/Catálogo (`imageViewModal`,
  `stock.js`), y que reabrir con otra foto resetee el zoom sin
  duplicar los listeners.
- `tests/configuracion-catalogo-dom.test.js` — tarjetas "Catálogo
  público" y "Permisos del equipo" en `configuracion-logic.js`, sobre
  el HTML real (activar, guardar, QR, revertir si falla).
- `tests/stock-permisos-dom.test.js` — permisos de edición en
  `stock.js` sobre el HTML real: abrir "Agregar producto", crear un
  producto, código duplicado, `applyStockRoleRestrictions()`,
  botones de importar/exportar por almacén.

### Suite de reglas contra el Emulador real (`rules-emulator/`)
A diferencia de todo lo de arriba (que prueba la LÓGICA de la app
contra `mock-sdk.js`, un mock local), esto corre `database.rules.json`
de verdad contra el **Emulador de Firebase** — el mismo motor de
reglas que usa producción, no una aproximación.

- **No vive dentro de `tests/`** a propósito: `node --test` (sin
  argumentos, lo que corre `npm test`) recorre automáticamente
  CUALQUIER archivo dentro de una carpeta llamada `test`/`tests` —
  sin importar el nombre del archivo — así que si esto viviera ahí,
  `npm test` intentaría correrlo también y fallaría (no hay Emulador
  levantado). Por eso vive en `/rules-emulator/database-rules.js`,
  fuera de esa carpeta.
- Se corre aparte: `npm run test:rules` (levanta el Emulador, corre
  la suite, lo apaga solo) o `npm run emulators` en una terminal +
  correrlo a mano en otra, para ir iterando.
- Usa `@firebase/rules-unit-testing` (librería oficial) — cubre
  `permisosVendedor`, `catalogoPublico` (lectura pública solo con
  `activo === true`, escritura admin-only, que un `update()` genérico
  no cuele un cambio) y `orders` (que un vendedor solo edite sus
  propios pedidos).
- **Importante**: el Emulador necesita bajar un `.jar` de
  `storage.googleapis.com` la primera vez — no se pudo instalar ni
  correr dentro del sandbox donde se armó esto (ese dominio no está
  en la lista de permitidos ahí). La suite está escrita, con la API
  de `@firebase/rules-unit-testing` verificada contra los tipos
  TypeScript del paquete instalado, pero **nunca se corrió de
  verdad** — hace falta correrla una vez en una máquina con internet
  normal antes de confiar en que efectivamente pasa.
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

### Multi-rubro — fase 1 (Rubro + Foro dinámico)
VAERON ya no es solo para tiendas de instrumentos musicales.
`RUBROS_DISPONIBLES` (`firebase-projects.js`): instrumentos, farmacia,
ferretería, importadora, otro.

- Campo **Rubro** al crear una tienda (Tiendas → Nueva tienda, solo
  súper-admin) y editable después (Tiendas → Editar). Se guarda en
  `tiendas/{tiendaId}/info.rubro`; toda tienda vieja sin este campo
  cae en `'instrumentos'` (`rubroDeTienda()`, nunca `undefined`).
  `currentTiendaRubro` (`auth-guard.js`) lo carga al iniciar sesión,
  igual que `currentTiendaPlan`.
- **Categorías del Foro por rubro**: antes eran un único array fijo
  pensado solo para instrumentos — ahora `FORO_CATEGORIAS_POR_RUBRO`
  (`foro-logic.js`) tiene un set por rubro, y `foroCategorias()`
  elige el de `currentTiendaRubro` (con `'instrumentos'` de
  respaldo si el valor guardado no es válido). Una ferretería ya no
  ve "Amplificación y sonido" como categoría.
- **Lo que falta** (no construido todavía): campos personalizados por
  producto según el rubro (fecha de vencimiento para farmacia, unidad
  de medida para ferretería, etc.) — es la pieza más grande del
  multi-rubro y queda pendiente para otra sesión.

### Dashboard: Ventas de los últimos 30 días + Producto más vendido
Antes el Dashboard tenía gráficos de STOCK (categorías, ABC, salud de
inventario) pero ninguno de VENTAS. Nuevo en `dashboard-logic.js`:
`renderSalesChart()` (línea, últimos 30 días, con relleno) y
`renderTopProductsPanel()` (top 5 por cantidad vendida) — ambos leen
`/orders` con una lectura puntual (`getOrders()`, no un listener en
vivo: no hace falta que se actualicen al segundo de cada venta).
Mismo gate de plan que la tarjeta de clientes/cumpleaños
(`aplicarVisibilidadClientes()` — sin Pedidos en Básico, no hay
ventas que mostrar). "Producto más vendido" suma cantidades del
mismo código a través de TODOS los pedidos del período, y un pedido
con varios productos distintos aporta a cada uno (mismo tipo de
bug que ya había corregido antes en `decrementStock()` — acá lo cubre
un test explícito).

