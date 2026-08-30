// =========================================================
// Adonay — SDK local de demostración (reemplaza a Firebase)
// =========================================================
// Este archivo NO se conecta a ningún servidor. Implementa, con
// localStorage, la misma forma de API que usa el resto del código
// (firebase.auth()... / firebase.database()...), para que stock.js,
// pedidos-logic.js, etc. funcionen sin ningún cambio mientras no
// exista un proyecto Firebase real para Adonay.
//
// MULTI-PROYECTO: desde que existe firebase-projects.js, esta app
// puede vivir repartida en varios proyectos Firebase (ver el
// comentario grande al inicio de ese archivo). Este mock simula esa
// separación de verdad: cada proyecto (identificado por su
// config.projectId — en modo demo, los placeholders
// "PENDIENTE-CONFIGURAR-A/B/C") guarda sus datos y sus cuentas en un
// cajón de localStorage totalmente aparte del de los demás, igual
// que pasaría con 3 proyectos Firebase reales. Así se puede probar
// el flujo completo (login con directorio, súper-admin viendo
// tiendas de varios proyectos, etc.) sin tener los proyectos reales
// todavía.
//
// Cuando tengas los proyectos Firebase reales de Adonay:
//   1) Borra este archivo (mock-sdk.js) y su <script> en index.html/login.html
//   2) Vuelve a agregar los 3 <script> del SDK real de Firebase (compat)
//   3) Pega tu configuración real en firebase-projects.js
// Todo lo demás (firebase.js, stock.js, pedidos-logic.js, etc.) sigue
// funcionando igual, porque llama a la misma API.
// =========================================================

(function () {
  const DB_PREFIX      = 'adonay_mock_db_v1__';
  const USERS_PREFIX   = 'adonay_mock_users_v1__';
  const SESSION_PREFIX = 'adonay_mock_session__';

  // ---- Caché en memoria, una por proyecto (ns) --------------------------
  // Antes cada operación (set/update/get/fireListeners...) volvía a leer
  // y a JSON.parse-ar TODO localStorage, incluso varias veces dentro de
  // una misma escritura. Con varios "proyectos" simulados a la vez, cada
  // uno tiene su propia caché — nunca se mezclan entre sí.
  const dbCacheByNs = {};
  const usersCacheByNs = {};

  function loadDB(ns) {
    if (dbCacheByNs[ns] !== undefined) return dbCacheByNs[ns];
    try {
      dbCacheByNs[ns] = JSON.parse(localStorage.getItem(DB_PREFIX + ns)) || {};
    } catch (e) {
      dbCacheByNs[ns] = {};
    }
    return dbCacheByNs[ns];
  }
  function saveDB(ns, root) {
    dbCacheByNs[ns] = root;
    localStorage.setItem(DB_PREFIX + ns, JSON.stringify(root));
  }
  function loadUsers(ns) {
    if (usersCacheByNs[ns] !== undefined) return usersCacheByNs[ns];
    try {
      usersCacheByNs[ns] = JSON.parse(localStorage.getItem(USERS_PREFIX + ns)) || {};
    } catch (e) {
      usersCacheByNs[ns] = {};
    }
    return usersCacheByNs[ns];
  }
  function saveUsers(ns, u) {
    usersCacheByNs[ns] = u;
    localStorage.setItem(USERS_PREFIX + ns, JSON.stringify(u));
  }

  function getNode(root, parts) {
    let node = root;
    for (const p of parts) {
      if (node == null || typeof node !== 'object') return undefined;
      node = node[p];
    }
    return node;
  }
  function setNode(root, parts, value) {
    if (parts.length === 0) return value;
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      if (typeof node[p] !== 'object' || node[p] === null) node[p] = {};
      node = node[p];
    }
    const last = parts[parts.length - 1];
    if (value === null || value === undefined) delete node[last];
    else node[last] = value;
    return root;
  }

  function resolveServerValues(value) {
    if (Array.isArray(value)) return value.map(resolveServerValues);
    if (value && typeof value === 'object') {
      if (value['.sv'] === 'timestamp') return Date.now();
      const out = {};
      Object.keys(value).forEach(k => { out[k] = resolveServerValues(value[k]); });
      return out;
    }
    return value;
  }

  function makeSnapshot(key, val) {
    return {
      key,
      val: () => (val === undefined ? null : val),
      exists: () => val !== undefined && val !== null,
      forEach: (cb) => {
        if (val && typeof val === 'object') {
          Object.keys(val).forEach(k => cb(makeSnapshot(k, val[k])));
        }
      }
    };
  }

  // ---- listener registry (revisado tras cada escritura) ----
  // Cada listener recuerda a qué proyecto (ns) pertenece, para que una
  // escritura en el Proyecto A nunca despierte a un listener que vive
  // en el Proyecto B — aunque, por coincidencia, escuchen el mismo path
  // (ej. "tiendas") en cada uno.
  const listeners = []; // {ns, parts, event, cb, query, lastMap}

  function isPathRelated(a, b) {
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  function applyQuery(childrenObj, query) {
    let entries = Object.keys(childrenObj || {}).map(k => ({ key: k, val: childrenObj[k] }));
    if (query && query.field) {
      entries = entries.filter(e => {
        const v = e.val ? e.val[query.field] : undefined;
        if (query.startAt !== undefined && !(v >= query.startAt)) return false;
        if (query.endAt !== undefined && !(v <= query.endAt)) return false;
        if (query.endBefore !== undefined && !(v < query.endBefore)) return false;
        return true;
      });
      entries.sort((a, b) => {
        const av = a.val ? a.val[query.field] : 0;
        const bv = b.val ? b.val[query.field] : 0;
        return (av || 0) - (bv || 0);
      });
    }
    if (query && query.limitToLast) entries = entries.slice(-query.limitToLast);
    const out = {};
    entries.forEach(e => { out[e.key] = e.val; });
    return out;
  }

  function fireListeners(ns, changedPath) {
    const root = loadDB(ns);
    listeners.forEach(l => {
      if (l.ns !== ns) return;
      if (changedPath && !isPathRelated(l.parts, changedPath)) return;
      const node = getNode(root, l.parts);
      if (l.event === 'value') {
        const serialized = JSON.stringify(node === undefined ? null : node);
        if (serialized !== l.lastSerialized) {
          l.lastSerialized = serialized;
          l.cb(makeSnapshot(l.parts[l.parts.length - 1] || null, node));
        }
        return;
      }
      // child_added / child_changed / child_removed
      const filtered = applyQuery(node || {}, l.query);
      const newMap = {};
      Object.keys(filtered).forEach(k => { newMap[k] = JSON.stringify(filtered[k]); });
      Object.keys(newMap).forEach(k => {
        if (!(k in l.lastMap)) {
          if (l.event === 'child_added') l.cb(makeSnapshot(k, filtered[k]));
        } else if (l.lastMap[k] !== newMap[k]) {
          if (l.event === 'child_changed') l.cb(makeSnapshot(k, filtered[k]));
        }
      });
      Object.keys(l.lastMap).forEach(k => {
        if (!(k in newMap)) {
          if (l.event === 'child_removed') l.cb(makeSnapshot(k, null));
        }
      });
      l.lastMap = newMap;
    });
  }

  function makeRef(ns, parts, query) {
    const path = parts;
    const ref = {
      get key() { return path.length ? path[path.length - 1] : null; },
      child(k) { return makeRef(ns, path.concat(String(k).split('/')), null); },
      push(value) {
        const id = '-mk' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
        const newRef = makeRef(ns, path.concat([id]), null);
        if (value === undefined) return newRef;
        // Firebase real: ref.push(valor) devuelve algo que es A LA VEZ
        // una ref (se puede seguir usando .child(), .key, etc.) Y una
        // promesa (se le puede encadenar .then()/.catch()). Antes esta
        // función ignoraba "value" por completo y nunca guardaba nada
        // — quien llamaba a push(valor).catch(...) (ej. registrarEvento
        // en firebase.js) tronaba con "catch is not a function" y el
        // evento de auditoría se perdía en silencio.
        const p = newRef.set(value).then(() => newRef);
        newRef.then = p.then.bind(p);
        newRef.catch = p.catch.bind(p);
        return newRef;
      },
      orderByChild(field) { return makeRef(ns, path, Object.assign({}, query, { field })); },
      startAt(v) { return makeRef(ns, path, Object.assign({}, query, { startAt: v })); },
      endAt(v) { return makeRef(ns, path, Object.assign({}, query, { endAt: v })); },
      endBefore(v) { return makeRef(ns, path, Object.assign({}, query, { endBefore: v })); },
      limitToLast(n) { return makeRef(ns, path, Object.assign({}, query, { limitToLast: n })); },
      set(value) {
        return Promise.resolve().then(() => {
          const root = loadDB(ns);
          setNode(root, path, resolveServerValues(value));
          saveDB(ns, root);
          fireListeners(ns, path);
        });
      },
      update(obj) {
        return Promise.resolve().then(() => {
          const root = loadDB(ns);
          const current = getNode(root, path) || {};
          const merged = (typeof current === 'object' && current !== null) ? Object.assign({}, current) : {};
          Object.keys(obj).forEach(k => {
            const v = obj[k];
            if (v === null) delete merged[k];
            else merged[k] = resolveServerValues(v);
          });
          setNode(root, path, merged);
          saveDB(ns, root);
          fireListeners(ns, path);
        });
      },
      remove() {
        return Promise.resolve().then(() => {
          const root = loadDB(ns);
          setNode(root, path, null);
          saveDB(ns, root);
          fireListeners(ns, path);
        });
      },
      once(event) {
        return Promise.resolve().then(() => {
          const root = loadDB(ns);
          const node = getNode(root, path);
          if (query && query.field) {
            return makeSnapshot(ref.key, applyQuery(node || {}, query));
          }
          return makeSnapshot(ref.key, node === undefined ? null : node);
        });
      },
      get() { return ref.once('value'); },
      transaction(updateFn) {
        return Promise.resolve().then(() => {
          const root = loadDB(ns);
          const current = getNode(root, path);
          const result = updateFn(current === undefined ? null : current);
          if (result === undefined) {
            return { committed: false, snapshot: makeSnapshot(ref.key, current) };
          }
          setNode(root, path, result);
          saveDB(ns, root);
          fireListeners(ns, path);
          return { committed: true, snapshot: makeSnapshot(ref.key, result) };
        });
      },
      on(event, cb, errCb) {
        const l = {
          ns,
          parts: path,
          event,
          cb,
          query,
          lastMap: {},
          lastSerialized: undefined
        };
        listeners.push(l);
        // emit initial state
        try {
          const root = loadDB(ns);
          const node = getNode(root, path);
          if (event === 'value') {
            l.lastSerialized = JSON.stringify(node === undefined ? null : node);
            cb(makeSnapshot(ref.key, node === undefined ? null : node));
          } else {
            const filtered = applyQuery(node || {}, query);
            Object.keys(filtered).forEach(k => {
              l.lastMap[k] = JSON.stringify(filtered[k]);
              if (event === 'child_added') cb(makeSnapshot(k, filtered[k]));
            });
          }
        } catch (e) { if (errCb) errCb(e); }
        return cb;
      },
      off(event) {
        for (let i = listeners.length - 1; i >= 0; i--) {
          const l = listeners[i];
          if (l.ns === ns && l.parts.join('/') === path.join('/') && (!event || l.event === event)) {
            listeners.splice(i, 1);
          }
        }
      }
    };
    return ref;
  }

  // ---- Auth (una instancia independiente por proyecto) ----
  // persist=false se usa para las apps "Secondary-..." que crearTienda()
  // y createVendorAccount() abren para crear una cuenta sin tocar la
  // sesión ya activa. ANTES, esas instancias secundarias leían Y
  // escribían la MISMA clave de sesión que la app principal: al crear
  // una cuenta, su sesión (y el signOut() que se le hace enseguida)
  // pisaba/borraba la sesión persistida de quien la estaba creando.
  // Ahora las apps secundarias no tocan la sesión persistida en
  // absoluto: viven solo en memoria y se descartan junto con la app al
  // terminar — pero SÍ comparten los datos (ns) del proyecto al que
  // pertenecen, para que lo que crean quede donde debe.
  function makeAuth(ns, persist) {
    let currentUser = null;
    let persistence = 'local';
    const stateListeners = [];
    const sessionKey = SESSION_PREFIX + ns;

    function restoreSession() {
      if (!persist) return;
      try {
        const raw = localStorage.getItem(sessionKey) || sessionStorage.getItem(sessionKey);
        currentUser = raw ? JSON.parse(raw) : null;
      } catch (e) { currentUser = null; }
    }
    restoreSession();

    function persistSession(user) {
      if (!persist) return;
      const raw = user ? JSON.stringify(user) : null;
      if (persistence === 'session') {
        if (raw) sessionStorage.setItem(sessionKey, raw); else sessionStorage.removeItem(sessionKey);
        localStorage.removeItem(sessionKey);
      } else {
        if (raw) localStorage.setItem(sessionKey, raw); else localStorage.removeItem(sessionKey);
        sessionStorage.removeItem(sessionKey);
      }
    }

    function notify() {
      stateListeners.forEach(cb => cb(currentUser));
    }

    return {
      get currentUser() { return currentUser; },
      onAuthStateChanged(cb) {
        stateListeners.push(cb);
        cb(currentUser);
        return () => {
          const i = stateListeners.indexOf(cb);
          if (i >= 0) stateListeners.splice(i, 1);
        };
      },
      setPersistence(mode) {
        persistence = (mode === 'session') ? 'session' : 'local';
        return Promise.resolve();
      },
      signInWithEmailAndPassword(email, password) {
        return Promise.resolve().then(() => {
          const users = loadUsers(ns);
          const rec = users[String(email).toLowerCase()];
          if (!rec) {
            // Arranque automático de la cuenta demo de súper-admin, la
            // primera vez que se intenta entrar con ella en CADA
            // proyecto (en modo demo hace las veces de "ya la creaste a
            // mano en la consola de cada proyecto", ver
            // firebase-projects.js).
            if (String(email).toLowerCase() === 'vaeronspa@gmail.com' && password === '123456') {
              const uid = 'u_admin_demo';
              users[email.toLowerCase()] = { uid, password: '123456' };
              saveUsers(ns, users);
              currentUser = { uid, email: email.toLowerCase() };
              persistSession(currentUser);
              notify();
              return { user: currentUser };
            }
            const err = new Error('No existe esa cuenta.');
            err.code = 'auth/user-not-found';
            throw err;
          }
          if (rec.password !== password) {
            const err = new Error('Contraseña incorrecta.');
            err.code = 'auth/wrong-password';
            throw err;
          }
          currentUser = { uid: rec.uid, email: String(email).toLowerCase() };
          persistSession(currentUser);
          notify();
          return { user: currentUser };
        });
      },
      createUserWithEmailAndPassword(email, password) {
        return Promise.resolve().then(() => {
          const users = loadUsers(ns);
          const key = String(email).toLowerCase();
          if (users[key]) {
            const err = new Error('Ese correo ya está en uso.');
            err.code = 'auth/email-already-in-use';
            throw err;
          }
          const uid = 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
          users[key] = { uid, password };
          saveUsers(ns, users);
          currentUser = { uid, email: key };
          persistSession(currentUser);
          notify();
          return { user: currentUser };
        });
      },
      sendPasswordResetEmail(email) {
        // Modo demo: no hay bandeja de correo real. Se simula éxito
        // para no romper el flujo de la pantalla de login.
        return Promise.resolve();
      },
      signOut() {
        return Promise.resolve().then(() => {
          currentUser = null;
          persistSession(null);
          notify();
        });
      }
    };
  }

  // ---- firebase.initializeApp() y apps con nombre (multi-proyecto) ----
  // ns identifica el PROYECTO (no la "app" en sí): se toma de
  // config.projectId cuando existe, así que dos initializeApp() con la
  // misma config (aunque tengan nombres de app distintos, como pasa con
  // las instancias "Secondary-...") comparten los mismos datos —
  // exactamente como pasaría con el SDK real, donde el projectId es lo
  // que de verdad determina a qué proyecto se conecta cada app.
  const apps = {}; // cache de apps persistentes, por ns
  let defaultAppNs = null;

  const firebase = {
    get apps() {
      // firebase.apps: lista de apps ya inicializadas, igual que el
      // SDK real — firebase.js la consulta para no llamar
      // initializeApp() dos veces con el mismo nombre. Se expone como
      // getter (no un array guardado aparte) para no tener que
      // mantenerlo sincronizado a mano en cada alta/baja de `apps`.
      return Object.values(apps);
    },
    initializeApp(config, name) {
      const ns = (config && config.projectId) ? config.projectId : (name || '[DEFAULT]');
      const isThrowaway = !!(name && /^Secondary-/.test(name));

      // Sin "name", esta es la app por defecto de la página — la que
      // usan firebase.auth()/firebase.database() sin argumentos (igual
      // que en el SDK real).
      if (!name) defaultAppNs = ns;

      if (!isThrowaway && apps[ns]) return apps[ns];

      const dbInstance = { ref: (path) => makeRef(ns, path ? String(path).split('/').filter(Boolean) : []) };
      const authInstance = makeAuth(ns, !isThrowaway);
      const app = {
        name: name || '[DEFAULT]',
        auth: () => authInstance,
        database: () => dbInstance,
        delete: () => Promise.resolve()
      };
      if (!isThrowaway) apps[ns] = app;
      return app;
    },
    auth() {
      if (!defaultAppNs || !apps[defaultAppNs]) {
        throw new Error('firebase.auth() se llamó antes de firebase.initializeApp().');
      }
      return apps[defaultAppNs].auth();
    },
    database() {
      if (!defaultAppNs || !apps[defaultAppNs]) {
        throw new Error('firebase.database() se llamó antes de firebase.initializeApp().');
      }
      return apps[defaultAppNs].database();
    }
  };
  firebase.auth.Auth = { Persistence: { LOCAL: 'local', SESSION: 'session' } };
  firebase.database.ServerValue = { TIMESTAMP: { '.sv': 'timestamp' } };

  window.firebase = firebase;
})();
