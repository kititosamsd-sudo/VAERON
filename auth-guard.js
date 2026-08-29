// =========================================================
// Adonay — Guardia de sesión y roles
// Se carga en TODAS las páginas protegidas (Stock, Pedidos,
// Registros...), después de firebase.js.
// =========================================================
//
// Antes el rol se decidía comparando el correo contra una lista fija
// (ADMIN_EMAILS) y asumiendo "si no es admin, es la única cuenta de
// vendedor". Ahora cada persona tiene su propia cuenta, y hay dos
// capas: /cuentas/{uid} dice a qué tienda pertenece (o si es
// súper-admin, dueño del sistema), y su perfil real —nombre, rol,
// si está activo— vive DENTRO de esa tienda, en
// tiendas/{tiendaId}/usuarios/{uid}:
//   { nombre, correo, rol: 'admin' | 'vendedor', activo: true|false }
// (ver el bloque "MULTI-CUENTA (SaaS)" en firebase.js para el detalle
// completo del modelo — incluye también tiendas/{tiendaId}/info con
// el estado de la mensualidad de esa tienda).
//
// Por qué se revisa esto en cada carga de página (no solo al hacer
// login): si un admin desactiva a alguien mientras esa persona ya
// tiene la app abierta en su celular, su sesión de Firebase Auth
// técnicamente sigue siendo válida — lo que la bloquea de verdad es
// que aquí, y en las reglas del servidor, se exige activo === true.
// En cuanto esa persona recargue o navegue a otra pantalla, se le
// cierra la sesión automáticamente.

// Antes: se ocultaba TODA la página (visibility:hidden) mientras se
// confirmaba la sesión, hecho desde este mismo script. El problema es
// que este archivo se carga con "defer", así que corre DESPUÉS de que
// el HTML ya se parseó — en teoría no debería pintarse nada visible
// todavía, pero no está 100% garantizado en todos los navegadores/
// dispositivos. Ahora el ocultamiento inicial lo hace un script
// bloqueante (sin defer) al principio del <head> de index.html, que
// SIEMPRE corre antes que cualquier otra cosa. Este archivo solo se
// encarga de decidir cuándo volver a mostrar la página: nunca antes
// de tener una sesión confirmada como válida.
//
// Mientras se confirma la sesión se muestra un spinner centrado en
// vez de una pantalla en blanco — se ve intencional, no roto — y si
// por algún motivo la sesión nunca termina de confirmarse (más de
// 8 segundos), se trata como si NO hubiera sesión y se manda a
// login: sin confirmación = fuera, nunca se asume que sí hay sesión.

const authLoadingOverlay = document.createElement('div');
authLoadingOverlay.id = 'authLoadingOverlay';
authLoadingOverlay.style.cssText =
  'position:fixed;inset:0;z-index:99999;background:#F0F3F9;' +
  'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;';
authLoadingOverlay.innerHTML =
  '<div style="width:34px;height:34px;border:3px solid #E2E8F4;border-top-color:#16181D;border-radius:50%;animation:authSpin .7s linear infinite"></div>' +
  '<style>@keyframes authSpin{to{transform:rotate(360deg)}}</style>';

// El logo de marca aparece en dos lugares del HTML según la
// pantalla: #brandIconImg (sidebar, todas las vistas) y
// #topbarHeroBrandImg (fila de marca del topbar de Configuración,
// solo visible en móvil). No siempre están ambos en el DOM a la vez
// — este helper actualiza el que exista, sin fallar si falta uno.
function setBrandLogos(url) {
  ['brandIconImg', 'topbarHeroBrandImg'].forEach(id => {
    const img = document.getElementById(id);
    if (img) img.src = url;
  });
}

function showAuthOverlay() {
  // Vuelve a mostrar la página (el spinner cubre todo con fondo
  // opaco), pero el contenido real de la app sigue sin poder verse
  // porque aún no se resolvió la sesión — solo se ve el spinner.
  document.documentElement.style.visibility = '';
  if (!document.body.contains(authLoadingOverlay)) {
    document.body.appendChild(authLoadingOverlay);
  }
}
function hideAuthOverlay() {
  if (authLoadingOverlay.parentNode) authLoadingOverlay.remove();
}

if (document.body) {
  showAuthOverlay();
} else {
  document.addEventListener('DOMContentLoaded', showAuthOverlay);
}

// Si en 8 segundos la sesión no se resolvió (problema de red, o
// —muy común al probar con doble clic en el archivo, file://—
// la sesión guardada de Firebase no siempre se puede leer ahí),
// se trata como sesión inválida y se manda a login. Nunca se deja
// la app accesible sin una confirmación positiva.
const authTimeout = setTimeout(() => {
  window.location.href = 'login.html';
}, 8000);

// ADMIN_BOOTSTRAP_EMAIL ya está declarado en firebase-projects.js (lo
// necesita también login.html, para saber cuándo iniciar sesión en
// todos los proyectos a la vez en vez de consultar el directorio).

let currentUserRole = null; // 'superadmin' | 'admin' | 'vendedor'
let currentUserName = null; // nombre para mostrar y para marcar "quién hizo esto"
let currentUserUid  = null;
// Perfil completo tal como se leyó al iniciar sesión (nombre, correo,
// activo, creadoEn, usuario...) — lo usa la pantalla de Perfil para
// mostrar datos reales (correo, fecha de alta) sin tener que volver
// a consultar la base.
let currentUserProfile = null;
// Plan de la tienda ('basico' | 'medio' | 'premium') — lo fija el
// súper-admin desde Facturación (tiendas/{tiendaId}/info/plan). Se
// carga acá abajo junto con tiendaInfo, y lo consume plan-limits.js
// (planActual()/limitePlan()) para saber qué puede hacer cada
// pantalla. null para el súper-admin (no aplica, no pertenece a
// ninguna tienda).
let currentTiendaPlan = null;
// Nombre comercial de la tienda (tiendas/{tiendaId}/info/nombre) —
// distinto del nombre de la PERSONA (currentUserName). Lo usa el
// Foro para firmar publicaciones como "Guitarras Lima" en vez de
// "Juan Pérez": la tienda publica, no el empleado.
let currentTiendaNombre = null;
// currentTiendaId ya está declarado en firebase.js (null si es
// súper-admin, o si esta página no cargó firebase.js todavía).

// Motivo por el que se manda de vuelta a login.html, para mostrar un
// mensaje claro en vez de un simple "vuelve a intentar" genérico.
function redirectToLogin(motivo) {
  window.location.href = 'login.html' + (motivo ? ('?motivo=' + encodeURIComponent(motivo)) : '');
}

const authReady = new Promise(resolve => {
  firebase.auth().onAuthStateChanged(async user => {
    clearTimeout(authTimeout);
    if (!user) {
      redirectToLogin();
      return;
    }

    let cuenta;
    try {
      cuenta = await getCuenta(user.uid);
    } catch (err) {
      // Sin conexión a la base para confirmar la cuenta = no se
      // asume nada, se trata igual que "sin sesión válida".
      redirectToLogin('error-conexion');
      return;
    }

    // Auto-arranque del súper-admin: la primera vez que esa cuenta
    // fija inicia sesión, se le crea su rol de súper-admin solo. No
    // pertenece a ninguna tienda — administra la lista de tiendas.
    if (!cuenta && user.email === ADMIN_BOOTSTRAP_EMAIL) {
      try {
        await refCuentas.child(user.uid).set({ rol: 'superadmin' });
        cuenta = await getCuenta(user.uid);
      } catch (err) {
        // Si el auto-arranque falla (ej. sin red), sigue el camino
        // normal de abajo: sin cuenta, no se deja pasar.
      }
    }

    // Cuenta de Firebase Auth que existe pero no tiene /cuentas/{uid}
    // (por ejemplo se creó a mano y se olvidaron de asignarla a una
    // tienda) — no se asume ningún rol por defecto, se bloquea.
    if (!cuenta || (cuenta.rol !== 'superadmin' && cuenta.rol !== 'admin' && cuenta.rol !== 'vendedor')) {
      await firebase.auth().signOut();
      redirectToLogin('sin-perfil');
      return;
    }

    let perfil = { nombre: cuenta.nombre || 'Súper-admin', activo: true };

    if (cuenta.rol === 'superadmin') {
      currentTiendaId = null;
    } else {
      // Cuenta de una tienda: además de la cuenta, hace falta el
      // perfil DENTRO de esa tienda (nombre a mostrar, si está
      // activo) y que la tienda misma no esté suspendida.
      currentTiendaId = cuenta.tiendaId;
      let tiendaInfo, perfilTienda;
      try {
        [tiendaInfo, perfilTienda] = await Promise.all([
          getTiendaInfo(currentTiendaId),
          refTiendas.child(currentTiendaId).child('usuarios').child(user.uid).once('value').then(s => s.val())
        ]);
      } catch (err) {
        redirectToLogin('error-conexion');
        return;
      }

      if (!perfilTienda) {
        await firebase.auth().signOut();
        redirectToLogin('sin-perfil');
        return;
      }
      // activo !== false a propósito: un perfil viejo sin el campo
      // explícito no queda bloqueado por accidente, pero en cuanto el
      // admin de esa tienda lo apague una vez, sí se respeta ya mismo.
      if (perfilTienda.activo === false) {
        await firebase.auth().signOut();
        redirectToLogin('deshabilitada');
        return;
      }
      // La mensualidad de la tienda no está al día: se bloquea el
      // acceso de TODOS los usuarios de esa tienda, admin incluido.
      if (tiendaInfo && tiendaInfo.estado === 'suspendida') {
        await firebase.auth().signOut();
        redirectToLogin('tienda-suspendida');
        return;
      }
      perfil = perfilTienda;
      currentTiendaPlan = (tiendaInfo && tiendaInfo.plan) || 'basico';
      currentTiendaNombre = (tiendaInfo && tiendaInfo.nombre) || currentUserName;

      // Antes acá se llamaba a seedIfEmpty() para armarle a cada tienda
      // nueva un catálogo/cartera de "ejemplo" (MODO DEMO). Se quitó:
      // toda tienda nueva debe arrancar 100% vacía — sin datos
      // compartidos con ninguna otra tienda, ni siquiera de ejemplo.
    }

    currentUserRole = cuenta.rol;
    currentUserName = perfil.nombre || user.email;
    currentUserUid  = user.uid;
    currentUserProfile = perfil;
    document.documentElement.classList.add('role-' + currentUserRole);
    if (currentTiendaId && typeof currentTiendaPlan === 'string') {
      document.documentElement.classList.add('plan-' + currentTiendaPlan);
    }
    hideAuthOverlay();

    // Vigilancia en tiempo real: si te desactivan (o suspenden tu
    // tienda) MIENTRAS ya estás usando la app, esto se entera de
    // inmediato — sin esperar a recargar ni a que un guardado falle.
    if (currentTiendaId) {
      refTiendas.child(currentTiendaId).child('usuarios').child(user.uid).on('value', snap => {
        const live = snap.val();
        if (live && live.activo === false) {
          refTiendas.child(currentTiendaId).child('usuarios').child(user.uid).off('value');
          showAuthOverlay();
          firebase.auth().signOut().then(() => redirectToLogin('deshabilitada'));
        }
      });
      refTiendas.child(currentTiendaId).child('info').on('value', snap => {
        const live = snap.val();
        if (live && live.estado === 'suspendida') {
          refTiendas.child(currentTiendaId).child('info').off('value');
          showAuthOverlay();
          firebase.auth().signOut().then(() => redirectToLogin('tienda-suspendida'));
          return;
        }
        // Cambio de plan en vivo: si el súper-admin sube/baja el plan
        // de la tienda MIENTRAS esta sesión ya está abierta, no hace
        // falta cerrar sesión para que se note — se actualiza acá y
        // se vuelve a aplicar el gating en cualquier pantalla que
        // esté montada ahora mismo (cada función ya revisa por su
        // cuenta si sus elementos existen en el DOM, así que llamarla
        // sin estar en esa pantalla no hace nada).
        if (live && live.plan && live.plan !== currentTiendaPlan) {
          document.documentElement.classList.remove('plan-' + currentTiendaPlan);
          currentTiendaPlan = live.plan;
          document.documentElement.classList.add('plan-' + currentTiendaPlan);
          if (typeof aplicarBloqueoPorPlan === 'function') aplicarBloqueoPorPlan();
          if (typeof aplicarConfigAlmacenes === 'function') aplicarConfigAlmacenes();
          if (typeof aplicarCamposPrecioPorPlan === 'function') aplicarCamposPrecioPorPlan();
          // aplicarConfigAlmacenes() de arriba es la de stock.js (las
          // PESTAÑAS de Catálogo/Stock). La tarjeta de Almacenes de
          // Configuración es otra cosa — su lista y el botón "Agregar
          // almacén" dependen de almacenesState/maxAlmacenes, que
          // quedaron calculados con el plan viejo la última vez que
          // se pintaron. Sin este refresh, si cambian de plan
          // mientras la persona está justo en Configuración, el
          // botón "Agregar" se queda bloqueado (o desbloqueado de
          // más) hasta que recargue.
          if (typeof renderAlmacenesList === 'function') renderAlmacenesList();
          if (typeof renderRegistros === 'function' && typeof usersCache !== 'undefined') renderRegistros();
          // Etiqueta de plan + panel de Rentabilidad del Dashboard: si
          // cambian el plan mientras la persona ya está parada ahí,
          // que se note al toque, sin recargar. Dashboard.refreshPlan()
          // ya revisa por su cuenta si el DOM de esa vista existe, así
          // que llamarla sin estar en el Dashboard no hace nada.
          if (window.Dashboard && typeof Dashboard.refreshPlan === 'function') Dashboard.refreshPlan();
          if (typeof limitePlan === 'function' && limitePlan('logoPersonalizable') && typeof getTiendaLogo === 'function') {
            getTiendaLogo().then(url => {
              if (url) setBrandLogos(url);
            }).catch(() => {});
          } else {
            setBrandLogos('logo-vaeron-icon.png');
          }
        }
      });
    }

    // Si la página tiene la tarjeta de usuario del sidebar, la
    // actualiza con el nombre y rol real, y la conecta para cerrar sesión.
    const userCard = document.querySelector('.user-card');
    if (userCard) {
      const nameEl = userCard.querySelector('.user-name');
      const roleEl = userCard.querySelector('.user-role');
      const avatarEl = userCard.querySelector('.avatar');
      const roleLabel = currentUserRole === 'superadmin' ? 'Súper-admin' : currentUserRole === 'admin' ? 'Admin' : 'Vendedor';
      if (nameEl)   nameEl.textContent = currentUserName;
      if (roleEl)   roleEl.textContent = roleLabel;
      if (avatarEl) avatarEl.textContent = currentUserName.slice(0, 2).toUpperCase();
      userCard.style.cursor = 'pointer';
      userCard.title = 'Opciones de cuenta';
    }

    // Logo propio de la tienda (plan Medio/Premium) — reemplaza el
    // ícono genérico de VAERON del sidebar (y, en Configuración, el
    // de la fila de marca del topbar) por el que la tienda subió en
    // Configuración. Si no aplica (Básico, o Medio/Premium sin logo
    // subido todavía), se queda tal cual está en el HTML.
    if (currentTiendaId && typeof limitePlan === 'function' && limitePlan('logoPersonalizable') && typeof getTiendaLogo === 'function') {
      getTiendaLogo().then(url => {
        if (url) setBrandLogos(url);
      }).catch(() => {});
    }

    // Formato de números (Configuración → Moneda y formato) — se
    // cachea una sola vez acá, ANTES de que Dashboard o Stock
    // pinten nada, para que ya salgan con el formato correcto desde
    // el primer render en vez de "saltar" de es-PE al elegido apenas
    // termine de cargar.
    if (currentTiendaId && typeof getTiendaConfig === 'function' && typeof setFormatoNumeroCache === 'function') {
      getTiendaConfig().then(cfg => {
        if (cfg && cfg.formatoNumero) setFormatoNumeroCache(cfg.formatoNumero);
      }).catch(() => {});
    }

    resolve({ user, role: currentUserRole, name: currentUserName, uid: currentUserUid, tiendaId: currentTiendaId, profile: currentUserProfile });
  });
});

function isAdmin() {
  return currentUserRole === 'admin' || currentUserRole === 'superadmin';
}

function isSuperAdmin() {
  return currentUserRole === 'superadmin';
}

// Cierra sesión en todos los proyectos donde login.html la abrió —
// para una cuenta de tienda es solo uno, pero el súper-admin queda
// conectado a varios a la vez (ver ADONAY_ACTIVE_PROJECTS_KEY en
// firebase-projects.js). Cerrar solo la del proyecto activo dejaría
// las demás sesiones vivas en este navegador sin que se note.
function signOutDeTodosLosProyectos() {
  let claves = [PROYECTO_COORDINADOR];
  try {
    const guardadas = JSON.parse(localStorage.getItem(ADONAY_ACTIVE_PROJECTS_KEY) || '[]');
    if (Array.isArray(guardadas) && guardadas.length) claves = guardadas;
  } catch (e) { /* usa el valor por defecto de arriba */ }

  // Además de las apps "con nombre" (una por proyecto), el login deja
  // una sesión en la app "por defecto" (sin nombre) — es la que esta
  // misma página usa para firebase.auth().onAuthStateChanged(). Si no
  // se cierra también esa, la página sigue viendo una sesión válida y
  // vuelve a entrar sola después de "cerrar sesión".
  const signOuts = claves.map(key => getProjectApp(key).auth().signOut().catch(() => {}));
  signOuts.push(firebase.auth().signOut().catch(() => {}));

  return Promise.all(signOuts).finally(() => {
    localStorage.removeItem(ADONAY_ACTIVE_PROJECT_KEY);
    localStorage.removeItem(ADONAY_ACTIVE_PROJECTS_KEY);
  });
}

function logout() {
  if (!confirm('¿Cerrar sesión?')) return;
  // stopRealtimeWatchers() va en try/catch: si llegara a lanzar un
  // error (p. ej. algo nuevo que no contempló su propio try/catch
  // interno), NO debe impedir que la sesión se cierre igual.
  try {
    if (typeof stopRealtimeWatchers === 'function') stopRealtimeWatchers();
  } catch (e) {
    console.error('[auth-guard] stopRealtimeWatchers() falló, se continúa con signOut de todos modos:', e);
  }
  signOutDeTodosLosProyectos().then(() => {
    window.location.href = 'login.html';
  });
}

// Cambia la contraseña de LA PROPIA cuenta (pantalla de Perfil).
// Firebase exige "reautenticarse" (confirmar la contraseña actual)
// antes de dejar cambiarla — si la sesión tiene más de un rato,
// updatePassword() sola falla con auth/requires-recent-login. Por
// eso primero se reautentica con la contraseña actual y RECIÉN
// después se pide el cambio; así el error de "contraseña actual
// incorrecta" queda claro y separado de cualquier otro problema.
// Funciona igual para admin (correo real) y vendedor (correo
// interno usuario@adonay.local): en ambos casos currentUser.email
// YA es el correo con el que inició sesión, así que no hace falta
// pedirlo de nuevo.
async function changeOwnPassword(currentPassword, newPassword) {
  const user = firebase.auth().currentUser;
  if (!user || !user.email) {
    throw new Error('No se pudo confirmar la sesión actual. Vuelve a iniciar sesión e inténtalo de nuevo.');
  }
  const cred = firebase.auth.EmailAuthProvider.credential(user.email, currentPassword);
  await user.reauthenticateWithCredential(cred);
  await user.updatePassword(newPassword);
}

// Cambiar de cuenta: cierra la sesión actual y manda a la pantalla
// de login (login.html), sin la confirmación de "logout"
// normal — es una acción intencional de cambio, no un cierre final.
function switchAccount() {
  try {
    if (typeof stopRealtimeWatchers === 'function') stopRealtimeWatchers();
  } catch (e) {
    console.error('[auth-guard] stopRealtimeWatchers() falló, se continúa con signOut de todos modos:', e);
  }
  signOutDeTodosLosProyectos().then(() => {
    window.location.href = 'login.html';
  });
}

// ── Menú de cuenta (tarjeta inferior del sidebar) ──────────────
// Al hacer clic en la tarjeta o en su flecha se abre un menú con
// dos opciones: "Cambiar de cuenta" y "Cerrar sesión". Antes un
// solo clic en la tarjeta cerraba sesión de inmediato.
document.addEventListener('DOMContentLoaded', () => {
  const userCard       = document.querySelector('.user-card');
  const userMenuToggle = document.getElementById('userMenuToggle');
  const userMenu       = document.getElementById('userMenu');
  const switchAccountBtn = document.getElementById('switchAccountBtn');

  if (!userCard || !userMenu) return;

  function openMenu() {
    userMenu.style.display = 'block';
    userCard.classList.add('menu-open');
  }
  function closeMenu() {
    userMenu.style.display = 'none';
    userCard.classList.remove('menu-open');
  }
  function toggleMenu(e) {
    e.stopPropagation();
    if (userMenu.style.display === 'none') openMenu(); else closeMenu();
  }

  userCard.addEventListener('click', toggleMenu);
  if (userMenuToggle) userMenuToggle.addEventListener('click', toggleMenu);

  if (switchAccountBtn) {
    switchAccountBtn.addEventListener('click', e => {
      e.stopPropagation();
      closeMenu();
      switchAccount();
    });
  }

  document.addEventListener('click', e => {
    if (!userCard.contains(e.target) && !userMenu.contains(e.target)) closeMenu();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeMenu();
  });
});

// ── Botón de cerrar sesión visible (barra inferior de escritorio y
// móvil, dentro del menú de cuenta). Funciona igual para admin y
// vendedor — logout() no depende del rol, solo cierra la sesión
// de Firebase.
document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.getElementById('logoutBtn');
  const logoutNavItem = document.getElementById('logoutNavItem');

  if (logoutBtn) {
    logoutBtn.addEventListener('click', e => {
      e.stopPropagation(); // evita que el click también dispare el de .user-card
      logout();
    });
  }
  if (logoutNavItem) {
    logoutNavItem.addEventListener('click', e => {
      e.preventDefault();
      logout();
    });
  }
});