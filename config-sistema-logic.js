// =========================================================
// VAERON — Configuración del sistema (solo súper-admin)
// Dos cosas reales, sin duplicar lógica que ya existe en otro lado:
//   1) Correo de la cuenta (firebase.auth().currentUser.email) — el
//      cambio de nombre/contraseña en sí ya vive en Perfil (ver
//      perfil-logic.js), acá solo enlazamos ahí.
//   2) Capacidad de cada proyecto Firebase configurado (cuántas
//      tiendas tiene vs. MAX_TIENDAS_POR_PROYECTO) — mismo dato que
//      usa elegirProyectoConEspacio() en firebase-projects.js para
//      decidir dónde crear la próxima tienda.
// =========================================================
window.ConfigSistema = {
  async init() {
    const correoEl = document.getElementById('configSistemaCorreo');
    if (correoEl) {
      const authUser = firebase.auth().currentUser;
      correoEl.textContent = (authUser && authUser.email) || '—';
    }

    const listEl = document.getElementById('configSistemaProyectosList');
    if (!listEl) return;

    try {
      const tiendas = await listarTiendas();
      const conteoPorProyecto = {};
      tiendas.forEach(t => {
        conteoPorProyecto[t.proyecto] = (conteoPorProyecto[t.proyecto] || 0) + 1;
      });

      listEl.innerHTML = allProjectKeys().map(key => {
        const total = conteoPorProyecto[key] || 0;
        const label = (FIREBASE_PROJECTS[key] && FIREBASE_PROJECTS[key].label) || key;
        const lleno = total >= MAX_TIENDAS_POR_PROYECTO;
        return `
          <div class="settings-static-row">
            <span>${escapeHtml(label)}</span>
            <span class="settings-static-val" style="${lleno ? 'color:var(--red)' : ''}">
              ${total} / ${MAX_TIENDAS_POR_PROYECTO} tiendas${lleno ? ' — lleno' : ''}
            </span>
          </div>`;
      }).join('');
    } catch (err) {
      listEl.innerHTML = '<p class="settings-msg" style="color:var(--red)">No se pudo cargar la capacidad de los proyectos.</p>';
    }
  }
};
