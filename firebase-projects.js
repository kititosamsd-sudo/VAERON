// =========================================================
// Adonay — Registro de proyectos Firebase (multi-proyecto)
// =========================================================
// Por qué existe esto: cada proyecto Firebase en el plan gratis
// (Spark) regala 10GB de descarga al mes, por proyecto. Con una
// sola tienda operando normal eso alcanza de sobra — pero es una
// cuota que no se puede ampliar sin tarjeta. En vez de esperar a
// que algún día se acerque el límite, cada tienda nueva se reparte
// entre varios proyectos desde ahora: como máximo
// MAX_TIENDAS_POR_PROYECTO tiendas por proyecto, y cuando uno se
// llena, la siguiente tienda se crea en el que le sigue.
//
// Esto NO significa que una tienda vea o comparta datos con otra —
// eso ya estaba resuelto (cada tienda vive en su propio nodo,
// tiendas/{tiendaId}/..., ver AISLAMIENTO POR TIENDA en firebase.js).
// Lo único que cambia es EN CUÁL de los proyectos vive ese nodo.
//
// ── Por qué el login necesita esto ──────────────────────────────
// Firebase Authentication es independiente por proyecto: una cuenta
// creada en el Proyecto A no existe en el Proyecto B. Eso significa
// que, antes de poder revisar la contraseña de alguien, el sistema
// tiene que saber EN CUÁL proyecto vive esa cuenta. Por eso existe
// el "directorio": un mapa correo → proyecto, guardado en el
// proyecto coordinador (ver PROYECTO_COORDINADOR más abajo), que el
// login consulta primero — antes de intentar la contraseña en
// ningún lado. Ver buscarProyectoDeCorreo() y registrarEnDirectorio()
// más abajo, y el flujo completo en login.html.
//
// ── Cómo ve todas las tiendas el súper-admin ────────────────────
// El súper-admin sí necesita ver y administrar tiendas de LOS TRES
// proyectos a la vez (paneles de Tiendas, Facturación, Auditoría).
// Para eso, su cuenta (el correo fijo de auth-guard.js,
// ADMIN_BOOTSTRAP_EMAIL) debe existir en los TRES proyectos — se crea
// una sola vez a mano en cada consola de Firebase, con el mismo
// correo y la misma contraseña. El login, al reconocer ese correo,
// inicia sesión en los tres a la vez (ver login.html). Las reglas de
// cada proyecto deben dar acceso total a tiendas/ cuando
// auth.token.email == 'tu-correo-de-superadmin' — no hace falta una
// entrada en /cuentas en el Proyecto B ni en el C, solo en el
// coordinador (que es donde auth-guard.js decide el rol).
//
// ── CONFIGURACIÓN (hacer esto cuando existan los proyectos reales) ──
//   1) Crea los proyectos Firebase que necesites (para empezar, 3).
//   2) Pega la configuración de cada uno abajo, reemplazando los
//      valores "PENDIENTE-CONFIGURAR-X".
//   3) En cada proyecto, crea a mano la cuenta de súper-admin
//      (mismo correo y contraseña en los tres).
//   4) En las Reglas de cada proyecto, da acceso total a /tiendas y
//      /directorio (solo en el coordinador) al correo de súper-admin,
//      y mantén el resto de las reglas igual que ya tenías (acceso
//      por tienda vía /cuentas/{uid}).
//
// Si por ahora solo tienes un proyecto (o ninguno, y sigues en modo
// demo con mock-sdk.js), no hace falta tocar nada más: con un solo
// proyecto configurado, todo funciona exactamente igual que antes —
// esto no obliga a tener los 3 desde ya, es la preparación para
// cuando los necesites.
// Correo fijo del súper-admin (dueño del sistema, no de una tienda en
// particular). Vive acá y no en auth-guard.js porque el LOGIN también
// lo necesita: es el único correo que, en vez de consultar el
// directorio, inicia sesión en TODOS los proyectos a la vez (ver
// login.html). Debe coincidir EXACTO con la cuenta que se creó a mano
// en cada proyecto.
const ADMIN_BOOTSTRAP_EMAIL = 'adonay@gmail.com';

const FIREBASE_PROJECTS = {
  proyecto_a: {
    label: 'Proyecto A',
    config: {
      apiKey: "AIzaSyCpppFfqrmdnWoXXXT40XtPvdU_Mr2SdBQ",
      authDomain: "base-a-54389.firebaseapp.com",
      databaseURL: "https://base-a-54389-default-rtdb.firebaseio.com",
      projectId: "base-a-54389",
      storageBucket: "base-a-54389.firebasestorage.app",
      messagingSenderId: "1018769683868",
      appId: "1:1018769683868:web:d792e490420df1471c4459"
    }
  },
  proyecto_b: {
    label: 'Proyecto B',
    config: {
      apiKey: "AIzaSyBISh5CLzYQ48ImsulOZ2XuYXRNjCPk4Yw",
      authDomain: "base-b-6de01.firebaseapp.com",
      databaseURL: "https://base-b-6de01-default-rtdb.firebaseio.com",
      projectId: "base-b-6de01",
      storageBucket: "base-b-6de01.firebasestorage.app",
      messagingSenderId: "1023310403023",
      appId: "1:1023310403023:web:57d7de0823b0ce7a302eba"
    }
  },
  proyecto_c: {
    label: 'Proyecto C',
    config: {
      apiKey: "AIzaSyDJhsqOBdzImDSAqvXAdMXZp7U-Qc_MjX4",
      authDomain: "base-c-bfd38.firebaseapp.com",
      databaseURL: "https://base-c-bfd38-default-rtdb.firebaseio.com",
      projectId: "base-c-bfd38",
      storageBucket: "base-c-bfd38.firebasestorage.app",
      messagingSenderId: "531782990537",
      appId: "1:531782990537:web:945fb83ebc9a8cbf596b18"
    }
  }
};

// El proyecto coordinador aloja el directorio correo → proyecto que
// usa el login (ver arriba). También es donde vive la cuenta de
// súper-admin "principal" — la que auth-guard.js revisa para decidir
// el rol al entrar. Puede tener tiendas propias igual que los demás,
// no está reservado solo para eso.
const PROYECTO_COORDINADOR = 'proyecto_a';

// Cuántas tiendas como máximo se crean en un mismo proyecto antes de
// pasar al siguiente. Subir este número no mueve tiendas que ya
// existen — solo cambia dónde se crean las tiendas NUEVAS de ahí en
// adelante.
const MAX_TIENDAS_POR_PROYECTO = 2;

// Clave usada en localStorage para recordar en qué proyecto(s) vive
// la sesión activa de este navegador — la usan login.html (al
// guardarla) y firebase.js (al arrancar, para inicializar el
// proyecto correcto como app por defecto). Ver el comentario grande
// al inicio de firebase.js para el detalle completo del flujo.
const ADONAY_ACTIVE_PROJECT_KEY = 'adonay_active_project';
const ADONAY_ACTIVE_PROJECTS_KEY = 'adonay_active_projects'; // solo súper-admin: lista completa

// ── Apps de Firebase por proyecto ────────────────────────────────
// Cache de instancias ya inicializadas (firebase.initializeApp() no
// se puede llamar dos veces con el mismo nombre sin que truene).
const _projectApps = {};

function getProjectApp(projectKey) {
  const def = FIREBASE_PROJECTS[projectKey];
  if (!def) throw new Error(`Proyecto desconocido: "${projectKey}". Revisa FIREBASE_PROJECTS en firebase-projects.js.`);
  if (_projectApps[projectKey]) return _projectApps[projectKey];
  const app = firebase.initializeApp(def.config, projectKey);
  _projectApps[projectKey] = app;
  return app;
}

function getProjectDb(projectKey) {
  return getProjectApp(projectKey).database();
}

// ── Esperar a que la sesión de un proyecto esté lista ────────────
// PROBLEMA QUE ESTO ARREGLA: getProjectApp(key) crea una app de
// Firebase CON NOMBRE (ej. "proyecto_b"). login.html ya inició
// sesión ahí antes, y Firebase guardó esa sesión en IndexedDB bajo
// una llave ligada a ese nombre — pero esta página (index.html) es
// una carga nueva, así que aunque el nombre coincida, es un objeto
// de app distinto: tiene que releer esa sesión guardada desde
// IndexedDB, y eso NO es instantáneo (toma un instante, de forma
// asíncrona). Si se lee /tiendas ahí mismo, sin esperar, todavía no
// hay usuario (auth().currentUser === null) y las Reglas de
// Firebase responden permission_denied — no porque falte la cuenta
// o esté mal la regla, sino porque se preguntó demasiado pronto.
//
// Esta función espera a que esa primera confirmación llegue (sea
// con sesión o sin ella) antes de dejar seguir. Se cachea por
// proyecto para no registrar el listener más de una vez.
const _sesionesListas = {};
function esperarSesionProyecto(projectKey) {
  if (!_sesionesListas[projectKey]) {
    _sesionesListas[projectKey] = new Promise(resolve => {
      let resuelto = false;
      const unsubscribe = getProjectApp(projectKey).auth().onAuthStateChanged(user => {
        if (resuelto) return; // solo importa la primera confirmación
        resuelto = true;
        resolve(user);
        // unsubscribe puede no estar asignado todavía si este
        // callback se disparó de forma síncrona (pasa en las
        // pruebas, y a veces también en el SDK real) — se
        // desengancha en el siguiente microtask, ya con la
        // variable asignada.
        Promise.resolve().then(() => unsubscribe && unsubscribe());
      });
    });
  }
  return _sesionesListas[projectKey];
}

// Igual que getProjectDb(), pero espera primero a que la sesión de
// ese proyecto haya terminado de confirmarse (ver esperarSesionProyecto
// arriba). Usar esta versión en vez de getProjectDb() directo en
// cualquier lectura/escritura que dependa de auth != null en las
// Reglas — es decir, en toda la sección "MULTI-CUENTA (SaaS)" de
// firebase.js.
async function getProjectDbListo(projectKey) {
  await esperarSesionProyecto(projectKey);
  return getProjectDb(projectKey);
}

function allProjectKeys() {
  return Object.keys(FIREBASE_PROJECTS);
}

// ── Directorio correo → proyecto (vive SOLO en el coordinador) ──
function normalizarCorreoParaDirectorio(correo) {
  // Las claves de Firebase no admiten . # $ [ ] — se reemplazan por
  // "_" para poder usar el correo tal cual como clave del nodo.
  return String(correo || '').trim().toLowerCase().replace(/[.#$/[\]]/g, '_');
}

function buscarProyectoDeCorreo(correo) {
  const key = normalizarCorreoParaDirectorio(correo);
  if (!key) return Promise.resolve(null);
  // Nota: esta lectura NO necesita esperarSesionProyecto() — el nodo
  // /directorio tiene ".read": true (sin exigir auth), justamente
  // porque login.html la consulta ANTES de que exista cualquier
  // sesión. Solo escribir ahí (registrarEnDirectorio/quitarDeDirectorio,
  // abajo) exige sesión de súper-admin.
  return getProjectDb(PROYECTO_COORDINADOR).ref('directorio').child(key).once('value')
    .then(snap => snap.val());
}

async function registrarEnDirectorio(correo, projectKey) {
  const key = normalizarCorreoParaDirectorio(correo);
  const projectDb = await getProjectDbListo(PROYECTO_COORDINADOR);
  return projectDb.ref('directorio').child(key).set(projectKey);
}

async function quitarDeDirectorio(correo) {
  const key = normalizarCorreoParaDirectorio(correo);
  const projectDb = await getProjectDbListo(PROYECTO_COORDINADOR);
  return projectDb.ref('directorio').child(key).remove().catch(() => {});
}

// ── Elegir en qué proyecto crear la próxima tienda ───────────────
// Cuenta cuántas tiendas tiene cada proyecto (nodo /tiendas de cada
// uno) y devuelve el primero que todavía tenga espacio. Si los tres
// están llenos, avisa con un error claro en vez de crear una cuarta
// tienda amontonada en el último — en ese punto hay que agregar un
// proyecto nuevo a FIREBASE_PROJECTS a mano.
async function elegirProyectoConEspacio() {
  // Orden estricto: se llena Proyecto A por completo primero, luego
  // B, luego C — nunca "el que tenga más espacio". allProjectKeys()
  // devuelve las claves en el mismo orden en que están escritas en
  // FIREBASE_PROJECTS (proyecto_a, proyecto_b, proyecto_c), así que
  // aquí basta con revisarlas UNA POR UNA, en ese orden, y quedarse
  // en la primera que todavía tenga espacio.
  const keys = allProjectKeys();
  const fallos = [];

  for (const key of keys) {
    let n;
    try {
      const snap = await (await getProjectDbListo(key)).ref('tiendas').once('value');
      n = 0;
      snap.forEach(() => { n++; });
    } catch (err) {
      // No se pudo leer este proyecto (típicamente porque la cuenta de
      // súper-admin no tiene sesión activa ahí) — se anota el motivo y
      // se sigue probando el siguiente proyecto en el orden, en vez de
      // tronar de inmediato.
      fallos.push({ key, error: err });
      continue;
    }
    if (n < MAX_TIENDAS_POR_PROYECTO) return key;
  }

  if (fallos.length === keys.length) {
    throw new Error(
      `No se pudo leer /tiendas en ningún proyecto configurado ` +
      `(${keys.map(k => FIREBASE_PROJECTS[k].label).join(', ')}). Esto casi ` +
      `siempre pasa cuando tu cuenta de súper-admin no tiene sesión activa ahí ` +
      `— créala en Authentication → Users con la misma contraseña en cada ` +
      `proyecto. Detalle técnico: ${fallos[0].error && fallos[0].error.message}`
    );
  }

  const avisoFallos = fallos.length
    ? ` (Nota: ${fallos.map(f => FIREBASE_PROJECTS[f.key].label).join(', ')} ` +
      `no se pudo leer — revisa ahí la sesión de tu cuenta de súper-admin.)`
    : '';
  throw new Error(
    `Los proyectos configurados (${keys.map(k => FIREBASE_PROJECTS[k].label).join(', ')}) ` +
    `ya están al máximo (${MAX_TIENDAS_POR_PROYECTO} tiendas cada uno).${avisoFallos} ` +
    `Agrega un proyecto nuevo en FIREBASE_PROJECTS (firebase-projects.js) antes de crear otra tienda.`
  );
}
