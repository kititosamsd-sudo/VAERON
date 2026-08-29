// =========================================================
// Adonay — Perfil (ver y editar cuenta)
// Tres cosas reales, conectadas a Firebase Auth / Realtime DB:
//   1) Correo real de la cuenta (firebase.auth().currentUser.email)
//   2) Nombre para mostrar — editable, se guarda de verdad
//      (tiendas/{tiendaId}/usuarios/{uid} para admin/vendedor,
//      cuentas/{uid} para el súper-admin — ver updateOwnName en
//      firebase.js)
//   3) Cambiar contraseña — reautenticación + updatePassword real
//      contra Firebase Auth (ver changeOwnPassword en auth-guard.js)
// =========================================================
window.Perfil = {
  init() {
    const nameEl      = document.getElementById('profileName');
    const emailEl      = document.getElementById('profileEmail');
    const roleEl       = document.getElementById('profileRoleBadge');
    const avatarEl     = document.getElementById('profileAvatar');
    const sinceEl       = document.getElementById('profileSince');
    const nombreInput  = document.getElementById('editNombreInput');

    const nombre = (typeof currentUserName === 'string' && currentUserName) || '—';
    const rol    = typeof currentUserRole !== 'undefined' ? currentUserRole : null;
    const authUser = firebase.auth().currentUser;

    if (nameEl)   nameEl.textContent = nombre;
    if (roleEl) {
      roleEl.textContent = rol === 'superadmin' ? 'Súper-admin' : rol === 'admin' ? 'Administrador' : rol === 'vendedor' ? 'Vendedor' : '—';
      roleEl.classList.remove('role-superadmin', 'role-admin', 'role-vendedor');
      if (rol === 'superadmin' || rol === 'admin' || rol === 'vendedor') roleEl.classList.add('role-' + rol);
    }
    if (avatarEl) avatarEl.textContent = nombre.slice(0, 2).toUpperCase();
    if (emailEl)  emailEl.textContent = (authUser && authUser.email) || '';
    if (nombreInput) nombreInput.value = nombre;
    actualizarContadorNombre();

    if (sinceEl) {
      const perfil = typeof currentUserProfile !== 'undefined' ? currentUserProfile : null;
      const creadoEn = perfil && perfil.creadoEn;
      sinceEl.textContent = creadoEn
        ? 'Miembro desde ' + new Date(creadoEn).toLocaleDateString('es-PE', { year: 'numeric', month: 'long', day: 'numeric' })
        : '';
    }

    // Limpiar formularios y mensajes cada vez que se entra a la
    // pantalla (si venías de un guardado anterior en otra sesión de
    // navegación, no queremos dejar mensajes ni contraseñas viejas).
    const nombreMsg = document.getElementById('nombreMsg');
    if (nombreMsg) nombreMsg.textContent = '';
    const pwMsg = document.getElementById('pwMsg');
    if (pwMsg) pwMsg.textContent = '';
    ['pwActual', 'pwNueva', 'pwConfirmar'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    evaluarFuerzaPassword();
  }
};

// ── Contador de caracteres del nombre para mostrar (en vivo) ──────
function actualizarContadorNombre() {
  const input = document.getElementById('editNombreInput');
  const hint = document.getElementById('nombreContador');
  if (!input || !hint) return;
  const max = Number(input.getAttribute('maxlength')) || 40;
  const len = input.value.length;
  hint.textContent = `${len}/${max} caracteres`;
  hint.classList.toggle('warn', len >= max - 5 && len < max);
  hint.classList.toggle('bad', len >= max);
}

// ── Ojito de mostrar/ocultar contraseña ─────────────────────────
// Alterna el input entre type="password" (oculto, por defecto) y
// type="text" (visible) — el valor nunca se toca, solo cómo se ve.
function togglePasswordVisibility(inputId, btnEl) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const mostrando = input.type === 'text';
  input.type = mostrando ? 'password' : 'text';
  if (btnEl) {
    btnEl.classList.toggle('showing', !mostrando);
    btnEl.setAttribute('aria-label', mostrando ? 'Mostrar contraseña' : 'Ocultar contraseña');
  }
}

// ── Fuerza de la nueva contraseña + coincidencia con la confirmación
//    (en vivo, mientras la persona escribe — no espera al submit) ──
function evaluarFuerzaPassword() {
  const nueva = (document.getElementById('pwNueva') || {}).value || '';
  const confirmar = (document.getElementById('pwConfirmar') || {}).value || '';
  const fill = document.getElementById('pwStrengthFill');
  const label = document.getElementById('pwStrengthLabel');
  const matchHint = document.getElementById('pwMatchHint');

  if (fill && label) {
    let score = 0;
    if (nueva.length >= 6) score++;
    if (nueva.length >= 10) score++;
    if (/[0-9]/.test(nueva) && /[a-zA-Z]/.test(nueva)) score++;
    if (/[^a-zA-Z0-9]/.test(nueva)) score++;

    const niveles = [
      { pct: 0,   color: 'var(--red)',   texto: '' },
      { pct: 25,  color: 'var(--red)',   texto: 'Débil — usa al menos 6 caracteres.' },
      { pct: 55,  color: 'var(--amber)', texto: 'Aceptable.' },
      { pct: 80,  color: 'var(--accent)',texto: 'Buena.' },
      { pct: 100, color: 'var(--green)', texto: 'Muy segura.' }
    ];
    const nivel = nueva.length === 0 ? niveles[0] : niveles[Math.min(score + 1, niveles.length - 1)];
    fill.style.width = nivel.pct + '%';
    fill.style.background = nivel.color;
    label.textContent = nivel.texto;
    label.classList.remove('warn', 'ok', 'bad');
    if (nueva.length > 0 && nueva.length < 6) label.classList.add('bad');
  }

  if (matchHint) {
    if (!confirmar) {
      matchHint.textContent = '';
      matchHint.classList.remove('ok', 'bad');
    } else if (confirmar === nueva) {
      matchHint.textContent = 'Las contraseñas coinciden.';
      matchHint.classList.add('ok');
      matchHint.classList.remove('bad');
    } else {
      matchHint.textContent = 'Todavía no coinciden.';
      matchHint.classList.add('bad');
      matchHint.classList.remove('ok');
    }
  }
}

function guardarNombrePerfil() {
  const input = document.getElementById('editNombreInput');
  const msg   = document.getElementById('nombreMsg');
  const btn   = document.getElementById('btnGuardarNombre');
  const nuevo = (input.value || '').trim();

  if (!nuevo) {
    if (msg) { msg.textContent = 'El nombre no puede estar vacío.'; msg.style.color = 'var(--red)'; }
    return;
  }
  if (nuevo === currentUserName) {
    if (msg) { msg.textContent = 'Ese ya es tu nombre actual.'; msg.style.color = 'var(--text-3)'; }
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Guardando…';
  updateOwnName(currentUserUid, nuevo)
    .then(() => {
      currentUserName = nuevo;
      if (typeof currentUserProfile === 'object' && currentUserProfile) currentUserProfile.nombre = nuevo;

      const profileNameEl   = document.getElementById('profileName');
      const profileAvatarEl = document.getElementById('profileAvatar');
      if (profileNameEl)   profileNameEl.textContent = nuevo;
      if (profileAvatarEl) profileAvatarEl.textContent = nuevo.slice(0, 2).toUpperCase();

      // La tarjeta de usuario del sidebar (abajo a la izquierda)
      // también muestra el nombre — se actualiza sin recargar.
      const userCardName   = document.querySelector('.user-card .user-name');
      const userCardAvatar = document.querySelector('.user-card .avatar');
      if (userCardName)   userCardName.textContent = nuevo;
      if (userCardAvatar) userCardAvatar.textContent = nuevo.slice(0, 2).toUpperCase();

      if (msg) { msg.textContent = 'Nombre actualizado.'; msg.style.color = 'var(--text-3)'; }
    })
    .catch(err => {
      if (msg) { msg.textContent = 'No se pudo guardar: ' + (err.message || err); msg.style.color = 'var(--red)'; }
    })
    .finally(() => {
      btn.disabled = false;
      btn.textContent = 'Guardar';
    });
}

function cambiarPasswordPerfil() {
  const actual    = document.getElementById('pwActual').value;
  const nueva     = document.getElementById('pwNueva').value;
  const confirmar = document.getElementById('pwConfirmar').value;
  const msg       = document.getElementById('pwMsg');
  const btn       = document.getElementById('btnCambiarPassword');

  if (!actual || !nueva || !confirmar) {
    if (msg) { msg.textContent = 'Completa los tres campos.'; msg.style.color = 'var(--red)'; }
    return;
  }
  if (nueva.length < 6) {
    if (msg) { msg.textContent = 'La nueva contraseña debe tener al menos 6 caracteres.'; msg.style.color = 'var(--red)'; }
    return;
  }
  if (nueva !== confirmar) {
    if (msg) { msg.textContent = 'Las contraseñas nuevas no coinciden.'; msg.style.color = 'var(--red)'; }
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Guardando…';
  changeOwnPassword(actual, nueva)
    .then(() => {
      if (msg) { msg.textContent = 'Contraseña actualizada correctamente.'; msg.style.color = 'var(--text-3)'; }
      ['pwActual', 'pwNueva', 'pwConfirmar'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      evaluarFuerzaPassword();
    })
    .catch(err => {
      const code = err && err.code;
      let texto = 'No se pudo cambiar la contraseña.';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') texto = 'La contraseña actual no es correcta.';
      else if (code === 'auth/too-many-requests') texto = 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
      else if (code === 'auth/weak-password') texto = 'La nueva contraseña es muy débil. Usa al menos 6 caracteres.';
      else if (err && err.message) texto = err.message;
      if (msg) { msg.textContent = texto; msg.style.color = 'var(--red)'; }
    })
    .finally(() => {
      btn.disabled = false;
      btn.textContent = 'Cambiar contraseña';
    });
}
