// =========================================================
// Adonay — Configuración
// Tres tarjetas con lógica real, todas guardadas en
// tiendas/{tiendaId}/config (ver getTiendaConfig() en firebase.js):
//   1) Moneda y tasa de cambio — usada por el catálogo (Stock) para
//      mostrar el equivalente en dólares de cada precio.
//   2) Umbral de stock bajo ("Notificaciones" del plan Medio/Premium)
//      — usado por el Dashboard para decidir qué productos entran en
//      la tarjeta/lista de "Stock bajo" (antes era un "≤ 5" fijo en
//      el código; ver dashboard-logic.js). Bloqueada en plan Básico.
//   3) Almacenes — nombres de los almacenes del Catálogo. En Básico
//      son 2, fijos ("Almacén 1"/"Almacén 2"). En Medio (hasta 3) y
//      Premium (hasta 6) se pueden renombrar, agregar y eliminar
//      (menos Almacén 1, que siempre existe) — ver plan-limits.js,
//      eliminarAlmacen() en firebase.js y aplicarConfigAlmacenes() en
//      stock.js.
// =========================================================
window.Configuracion = {
  init() {
    cargarTasaCambio();
    aplicarBloqueoPorPlan();
    cargarUmbralStock();
    cargarAlmacenesForm();
    cargarLogoPreview();
    actualizarTemaLabel();
    renderConfigPlanBadge();
    cargarAlertaDashboard();
    cargarMonedaPrincipal();
    cargarFormatoNumero();
  }
};

// Muestra/oculta el bloque de edición de una fila (Tasa de cambio,
// Umbral de stock, nombre de un almacén). Los controles reales
// dentro del bloque nunca se sacan del DOM, solo se ocultan con
// CSS — por eso previsualizarTasaCambio(), guardarUmbralStock(),
// etc. siguen funcionando igual estén visibles o no.
function toggleCfgEdit(boxId) {
  const box = document.getElementById(boxId);
  if (!box) return;
  box.classList.toggle('open');
}

// Mismo patrón que renderPlanBadge() en dashboard-logic.js —
// misma fuente de verdad (planActual()/nombrePlan() de
// plan-limits.js), nunca un "if (plan === 'medio')" suelto nuevo.
function renderConfigPlanBadge() {
  const tag = document.getElementById('configPlanTag');
  if (!tag) return;
  if (typeof planActual !== 'function' || typeof nombrePlan !== 'function') return;
  const plan = planActual();
  tag.className = 'dash-plan-tag plan-tag-' + plan;
  tag.textContent = 'Plan ' + nombrePlan(plan);
  tag.style.display = '';
}

/* ── Tema oscuro/claro ──────────────────────────────────────────
   Preferencia del dispositivo (localStorage), no de la tienda: cada
   quien puede tener su propio tema sin afectar a los demás. El
   script bloqueante en <head> de app.html ya aplica el tema guardado
   ANTES del primer paint (evita el flash blanco→oscuro); acá solo
   se encarga de cambiarlo cuando la persona toca la fila "Tema" y
   de reflejar el estado actual en la etiqueta. */
function toggleTema() {
  const activarOscuro = document.documentElement.getAttribute('data-theme') !== 'dark';
  if (activarOscuro) {
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  try { localStorage.setItem('vaeron-theme', activarOscuro ? 'dark' : 'light'); } catch (e) {}
  actualizarTemaLabel();
}

function actualizarTemaLabel() {
  const label = document.getElementById('temaValLabel');
  if (!label) return;
  const esOscuro = document.documentElement.getAttribute('data-theme') === 'dark';
  const chevron = label.querySelector('svg');
  label.textContent = esOscuro ? 'Oscuro ' : 'Claro ';
  if (chevron) label.appendChild(chevron);
}

/* ── Logo de la tienda ───────────────────────────────────────── */

function cargarLogoPreview() {
  const preview = document.getElementById('logoPreview');
  if (!preview || typeof getTiendaLogo !== 'function') return;
  getTiendaLogo()
    .then(url => {
      if (url) preview.innerHTML = `<img src="${url}" alt="Logo" style="width:100%;height:100%;object-fit:contain">`;
    })
    .catch(() => {});
}

// Mismo patrón que la imagen de producto en Stock (comprimir a
// canvas, subir a Cloudinary, guardar solo la URL) — ver
// previewProductImage() en stock.js. Se sube y se guarda apenas se
// elige el archivo, sin un botón "Guardar" aparte.
function subirLogoTienda(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const preview = document.getElementById('logoPreview');
  const msg = document.getElementById('logoMsg');
  if (preview) preview.innerHTML = '<span style="font-size:10px;color:var(--text-3);text-align:center">Subiendo…</span>';
  if (msg) msg.textContent = '';

  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const maxW = 240; // el logo se ve chico en el sidebar — no hace falta más resolución que eso
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(blob => {
        if (!blob) {
          if (msg) { msg.textContent = 'No se pudo procesar la imagen.'; msg.style.color = 'var(--red)'; }
          return;
        }
        const folder = (typeof currentTiendaId !== 'undefined' && currentTiendaId) ? `tiendas/${currentTiendaId}/logo` : 'logos';
        let subidaUrl = '';
        uploadImageToCloudinary(blob, folder)
          .then(url => {
            subidaUrl = url;
            return setTiendaLogo(url);
          })
          .then(() => {
            if (preview) preview.innerHTML = `<img src="${subidaUrl}" alt="Logo" style="width:100%;height:100%;object-fit:contain">`;
            if (msg) { msg.textContent = 'Logo actualizado. Se verá así la próxima vez que inicien sesión.'; msg.style.color = 'var(--text-3)'; }
          })
          .catch(err => {
            if (msg) { msg.textContent = 'No se pudo subir el logo: ' + err.message; msg.style.color = 'var(--red)'; }
            cargarLogoPreview();
          });
      }, 'image/png', 0.9);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// Bloquea (visualmente, con nota) las tarjetas que el plan actual no
// incluye, o que el rol actual (vendedor) no puede tocar. No oculta
// las tarjetas — así la persona ve qué existe y qué le falta subir
// de plan para usar, en vez de que la función simplemente desaparezca.
function aplicarBloqueoPorPlan() {
  const esAdmin = (typeof currentUserRole === 'undefined') || currentUserRole === 'admin';

  if (typeof limitePlan === 'function' && !limitePlan('notificaciones')) {
    const input = document.getElementById('inputUmbralStock');
    const btn = document.getElementById('btnGuardarUmbral');
    const btnMenos = document.getElementById('btnUmbralMenos');
    const btnMas = document.getElementById('btnUmbralMas');
    const msg = document.getElementById('umbralStockMsg');
    if (input) input.disabled = true;
    if (btn) btn.disabled = true;
    if (btnMenos) btnMenos.disabled = true;
    if (btnMas) btnMas.disabled = true;
    if (msg) { msg.textContent = `Disponible desde el plan Medio (tu plan actual: ${nombrePlan()}).`; msg.style.color = 'var(--text-3)'; }
  }

  // A diferencia del resto de tarjetas bloqueadas por plan (que se ven
  // deshabilitadas con una nota, para mostrar qué se desbloquea al
  // subir), "Logo de la tienda" se oculta por completo en Básico: no
  // tiene sentido dejar visible un control de foto vacío/deshabilitado
  // para una función que la tienda no puede usar en ningún otro lado
  // de la app todavía.
  const logoCard = document.getElementById('configCardLogo');
  const logoDisponibleEnPlan = (typeof limitePlan === 'function') ? limitePlan('logoPersonalizable') : true;
  if (logoCard) logoCard.style.display = logoDisponibleEnPlan ? '' : 'none';
  if (logoDisponibleEnPlan && !esAdmin) {
    const logoNota = document.getElementById('logoPlanNote');
    const logoLabel = document.getElementById('logoFileLabel');
    if (logoNota) logoNota.textContent = 'Solo el administrador de la tienda puede cambiar el logo.';
    if (logoLabel) logoLabel.style.display = 'none';
  }

  // La tarjeta de Almacenes todavía no tiene sus filas en el DOM en
  // este punto (se generan en renderAlmacenesList(), llamada después
  // por cargarAlmacenesForm() — ver Configuracion.init()). Por eso
  // el bloqueo por plan/rol de esa tarjeta se resuelve ahí mismo, no
  // acá, pasándole el flag esAdmin.
  almacenesEsAdmin = esAdmin;
}

/* ── Moneda y tasa de cambio ─────────────────────────────────── */

function previsualizarTasaCambio() {
  const input = document.getElementById('inputTasaCambio');
  const preview = document.getElementById('tasaCambioPreview');
  if (!input || !preview) return;
  const valor = parseFloat(input.value);
  if (!valor || valor <= 0) {
    preview.textContent = '';
    return;
  }
  const ejemploSoles = 100;
  const ejemploDolares = (ejemploSoles / valor).toFixed(2);
  preview.textContent = `Ejemplo: S/ ${ejemploSoles} equivalen a $ ${ejemploDolares}`;
}

function cargarTasaCambio() {
  const input = document.getElementById('inputTasaCambio');
  const msg = document.getElementById('tasaCambioMsg');
  const sub = document.getElementById('tasaCambioSub');
  if (!input) return;
  getTiendaConfig()
    .then(cfg => {
      if (cfg && cfg.tasaCambio) {
        input.value = cfg.tasaCambio;
        if (msg) msg.textContent = '';
        if (sub) sub.textContent = `1 USD = ${cfg.tasaCambio} soles`;
      } else {
        if (msg) msg.textContent = 'Todavía no configuraste una tasa. Mientras tanto, el catálogo solo muestra cada precio en su propia moneda, sin conversión.';
        if (sub) sub.textContent = 'Sin configurar';
      }
      previsualizarTasaCambio();
    })
    .catch(() => {
      if (msg) msg.textContent = 'No se pudo cargar la tasa de cambio.';
    });
}

function guardarTasaCambio() {
  const input = document.getElementById('inputTasaCambio');
  const msg = document.getElementById('tasaCambioMsg');
  const btn = document.getElementById('btnGuardarTasa');
  const valor = parseFloat(input.value);

  if (!valor || valor <= 0) {
    if (msg) { msg.textContent = 'Ingresa una tasa válida, mayor a 0.'; msg.style.color = 'var(--red)'; }
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Guardando…';
  setTasaCambio(valor)
    .then(() => {
      if (msg) { msg.textContent = 'Tasa guardada. El catálogo ya la usa para mostrar el equivalente en cada producto.'; msg.style.color = 'var(--text-3)'; }
      const sub = document.getElementById('tasaCambioSub');
      if (sub) sub.textContent = `1 USD = ${valor} soles`;
      // Si la vista de Stock ya cargó productos con la tasa vieja
      // (o sin tasa), esto la actualiza en caliente sin que la
      // persona tenga que recargar la página.
      if (typeof currentTasaCambio !== 'undefined') {
        currentTasaCambio = valor;
        if (typeof renderProducts === 'function') renderProducts();
      }
    })
    .catch(err => {
      if (msg) { msg.textContent = 'No se pudo guardar: ' + (err.message || err); msg.style.color = 'var(--red)'; }
    })
    .finally(() => {
      btn.disabled = false;
      btn.textContent = 'Guardar';
    });
}

/* ── Moneda principal ─────────────────────────────────────────── */
function cargarMonedaPrincipal() {
  const select = document.getElementById('selectMonedaPrincipal');
  const sub = document.getElementById('monedaPrincipalSub');
  if (!select) return;
  getTiendaConfig()
    .then(cfg => {
      const moneda = (cfg && cfg.monedaPrincipal === 'USD') ? 'USD' : 'PEN';
      select.value = moneda;
      if (sub) sub.textContent = moneda === 'USD' ? 'Dólares ($)' : 'Soles (S/)';
    })
    .catch(() => {});
}

function guardarMonedaPrincipal() {
  const select = document.getElementById('selectMonedaPrincipal');
  const msg = document.getElementById('monedaPrincipalMsg');
  const btn = document.getElementById('btnGuardarMonedaPrincipal');
  const moneda = select.value === 'USD' ? 'USD' : 'PEN';

  btn.disabled = true;
  btn.textContent = 'Guardando…';
  setMonedaPrincipal(moneda)
    .then(() => {
      if (msg) { msg.textContent = 'Guardado. Así viene marcada la próxima vez que agregues un producto.'; msg.style.color = 'var(--text-3)'; }
      const sub = document.getElementById('monedaPrincipalSub');
      if (sub) sub.textContent = moneda === 'USD' ? 'Dólares ($)' : 'Soles (S/)';
      // Si Stock ya está montado en esta misma sesión (SPA), que el
      // próximo "Agregar producto" ya la use sin recargar.
      if (typeof monedaPrincipalCache !== 'undefined') monedaPrincipalCache = moneda;
    })
    .catch(err => {
      if (msg) { msg.textContent = 'No se pudo guardar: ' + (err.message || err); msg.style.color = 'var(--red)'; }
    })
    .finally(() => {
      btn.disabled = false;
      btn.textContent = 'Guardar';
    });
}

/* ── Formato de números ───────────────────────────────────────── */
function cargarFormatoNumero() {
  const select = document.getElementById('selectFormatoNumero');
  const sub = document.getElementById('formatoNumeroSub');
  if (!select) return;
  getTiendaConfig()
    .then(cfg => {
      const formato = (cfg && cfg.formatoNumero === 'es-ES') ? 'es-ES' : 'es-PE';
      select.value = formato;
      if (sub) sub.textContent = formato === 'es-ES' ? '1.234,56' : '1,234.56';
    })
    .catch(() => {});
}

function guardarFormatoNumero() {
  const select = document.getElementById('selectFormatoNumero');
  const msg = document.getElementById('formatoNumeroMsg');
  const btn = document.getElementById('btnGuardarFormatoNumero');
  const formato = select.value === 'es-ES' ? 'es-ES' : 'es-PE';

  btn.disabled = true;
  btn.textContent = 'Guardando…';
  setFormatoNumero(formato)
    .then(() => {
      if (msg) { msg.textContent = 'Formato guardado. Se aplica desde ahora en toda la app.'; msg.style.color = 'var(--text-3)'; }
      const sub = document.getElementById('formatoNumeroSub');
      if (sub) sub.textContent = formato === 'es-ES' ? '1.234,56' : '1,234.56';
      // setFormatoNumero() de firebase.js ya actualizó el cache en
      // memoria (formatoNumeroActivo()) — si Dashboard o Stock ya
      // están montados en esta misma sesión, se repintan para que
      // se note al toque, sin esperar a navegar de nuevo a esa vista.
      if (window.Dashboard && typeof window.Dashboard.refreshFormatoNumero === 'function') window.Dashboard.refreshFormatoNumero();
      if (typeof renderProducts === 'function') renderProducts();
    })
    .catch(err => {
      if (msg) { msg.textContent = 'No se pudo guardar: ' + (err.message || err); msg.style.color = 'var(--red)'; }
    })
    .finally(() => {
      btn.disabled = false;
      btn.textContent = 'Guardar';
    });
}
// y se re-renderiza en el DOM cada vez que cambia (agregar/eliminar).
// Los nombres solo se mandan a Firebase al tocar "Guardar nombres";
// agregar y eliminar sí pegan a Firebase al toque, porque eliminar
// mueve stock real de inmediato y no tiene sentido dejarlo "a medio
// guardar".
let almacenesState = { nombres: {}, activos: {} };
let almacenesEsAdmin = true;

function cargarAlmacenesForm() {
  if (typeof getAlmacenesConfig !== 'function' || !document.getElementById('almacenesList')) return;
  getAlmacenesConfig()
    .then(({ nombres, activos }) => {
      almacenesState = { nombres, activos };
      renderAlmacenesList();
    })
    .catch(() => {
      const msg = document.getElementById('almacenesMsg');
      if (msg) msg.textContent = 'No se pudieron cargar los almacenes.';
    });
}

function renderAlmacenesList() {
  const cont = document.getElementById('almacenesList');
  const btnAgregar = document.getElementById('btnAgregarAlmacen');
  if (!cont) return;

  const maxAlmacenes = (typeof limitePlan === 'function') ? limitePlan('maxAlmacenes') : 2;
  const editable = (typeof limitePlan === 'function' ? limitePlan('almacenesEditable') : false) && almacenesEsAdmin;
  const eliminable = (typeof limitePlan === 'function' ? limitePlan('almacenesEliminables') : false) && almacenesEsAdmin;

  const activosOrdenados = ['alm1'];
  for (let n = 2; n <= maxAlmacenes; n++) {
    const id = 'alm' + n;
    if (almacenesState.activos[id]) activosOrdenados.push(id);
  }

  const iconAlmacen = '<svg viewBox="0 0 24 24"><path d="M3 21V10l9-6 9 6v11"/><path d="M3 10h18"/><rect x="9" y="13" width="6" height="8"/></svg>';

  cont.innerHTML = activosOrdenados.map(id => {
    const esAlm1 = id === 'alm1';
    const nombre = escapeHtml(almacenesState.nombres[id] || id);
    const numero = id.replace('alm', '');
    const botonEliminar = (!esAlm1 && eliminable)
      ? `<button type="button" class="btn-reg-delete" title="Eliminar almacén" onclick="confirmarEliminarAlmacen('${id}')">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>`
      : '';
    const filaEdicion = editable
      ? `<div class="cfg-edit-box" id="boxAlm_${id}">
          <div style="display:flex;gap:8px;align-items:center;margin-top:6px">
            <input class="form-input" id="inputNombre_${id}" type="text" maxlength="30" value="${nombre}" style="flex:1">
            ${botonEliminar}
          </div>
        </div>`
      : `<input class="form-input" id="inputNombre_${id}" type="text" maxlength="30" value="${nombre}" disabled style="display:none">`;
    return `
      <div class="cfg-row" data-alm="${id}">
        <div class="cfg-row-left">
          <span class="cfg-row-icon green">${iconAlmacen}</span>
          <div class="cfg-row-text">
            <div class="cfg-row-label">Almacén ${numero}</div>
            <div class="cfg-row-sub">${esAlm1 ? 'Principal' : nombre}</div>
          </div>
        </div>
        <div class="cfg-row-right">
          ${editable ? `<button type="button" class="btn btn-primary btn-sm" onclick="toggleCfgEdit('boxAlm_${id}')">Editar</button>` : ''}
        </div>
      </div>
      ${filaEdicion}`;
  }).join('');

  const hayEspacio = activosOrdenados.length < maxAlmacenes;
  if (btnAgregar) btnAgregar.style.display = (editable && eliminable && hayEspacio) ? '' : 'none';
}

// Activa el siguiente slot libre (alm2..maxAlmacenes) con nombre por
// defecto. Pega directo a Firebase — no espera al botón "Guardar
// nombres" — así, si la persona cierra la pestaña sin guardar
// nombres, el almacén igual queda creado (y disponible en Stock).
function agregarAlmacen() {
  const maxAlmacenes = (typeof limitePlan === 'function') ? limitePlan('maxAlmacenes') : 2;
  let libre = null;
  for (let n = 2; n <= maxAlmacenes; n++) {
    if (!almacenesState.activos['alm' + n]) { libre = 'alm' + n; break; }
  }
  const msg = document.getElementById('almacenesMsg');
  if (!libre) {
    if (msg) { msg.textContent = `Tu plan (${nombrePlan()}) permite hasta ${maxAlmacenes} almacenes.`; msg.style.color = 'var(--red)'; }
    return;
  }

  const nuevosActivos = { ...almacenesState.activos, [libre]: true };
  setAlmacenesConfig({ nombres: almacenesState.nombres, activos: nuevosActivos })
    .then(({ nombres, activos }) => {
      almacenesState = { nombres, activos };
      renderAlmacenesList();
      if (msg) { msg.textContent = 'Almacén agregado. Ya puedes renombrarlo y usarlo en Stock.'; msg.style.color = 'var(--text-3)'; }
      if (window.Stock && typeof aplicarConfigAlmacenes === 'function') aplicarConfigAlmacenes();
    })
    .catch(err => {
      if (msg) { msg.textContent = 'No se pudo agregar: ' + (err.message || err); msg.style.color = 'var(--red)'; }
    });
}

// Pide confirmación (avisando que el stock cargado se mueve al
// almacén anterior, no se pierde) y recién ahí elimina de verdad.
function confirmarEliminarAlmacen(whId) {
  if (whId === 'alm1') return; // el botón ni debería existir para alm1, pero por las dudas
  const nombre = almacenesState.nombres[whId] || whId;
  const ok = window.confirm(
    `¿Eliminar "${nombre}"?\n\nSi tiene stock cargado, se moverá automáticamente al almacén anterior para que no se pierda. Esta acción no se puede deshacer desde aquí.`
  );
  if (!ok) return;

  const msg = document.getElementById('almacenesMsg');
  if (msg) { msg.textContent = 'Eliminando…'; msg.style.color = 'var(--text-3)'; }

  eliminarAlmacen(whId)
    .then(({ destino }) => {
      almacenesState.activos[whId] = false;
      renderAlmacenesList();
      const nombreDestino = almacenesState.nombres[destino] || destino;
      if (msg) { msg.textContent = `Almacén eliminado. Su stock (si tenía) se movió a "${nombreDestino}".`; msg.style.color = 'var(--text-3)'; }
      if (window.Stock && typeof aplicarConfigAlmacenes === 'function') aplicarConfigAlmacenes();
    })
    .catch(err => {
      if (msg) { msg.textContent = 'No se pudo eliminar: ' + (err.message || err); msg.style.color = 'var(--red)'; }
    });
}

function guardarAlmacenesForm() {
  const msg = document.getElementById('almacenesMsg');
  const btn = document.getElementById('btnGuardarAlmacenes');

  const nombres = { ...almacenesState.nombres };
  let huboVacio = false;
  document.querySelectorAll('#almacenesList input[id^="inputNombre_"]').forEach(input => {
    const id = input.id.replace('inputNombre_', '');
    const valor = (input.value || '').trim();
    if (!valor) huboVacio = true;
    nombres[id] = valor || nombres[id];
  });

  if (huboVacio) {
    if (msg) { msg.textContent = 'Ningún nombre de almacén puede quedar vacío.'; msg.style.color = 'var(--red)'; }
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Guardando…';
  setAlmacenesConfig({ nombres, activos: almacenesState.activos })
    .then(({ nombres: n, activos: a }) => {
      almacenesState = { nombres: n, activos: a };
      // Vuelve a pintar las filas para que el subtítulo (nombre
      // resumido junto a "Almacén N") refleje lo recién guardado —
      // antes el input de toda la vida ya mostraba el valor nuevo
      // sin necesitar esto, pero ahora el nombre vive en un
      // resumen colapsado, no en el input siempre visible.
      renderAlmacenesList();
      if (msg) { msg.textContent = 'Nombres guardados. El Catálogo ya los muestra así.'; msg.style.color = 'var(--text-3)'; }
      // Si Stock ya está montado en esta misma sesión (SPA), refresca
      // sus pestañas al toque en vez de esperar a que recarguen.
      if (window.Stock && typeof aplicarConfigAlmacenes === 'function') aplicarConfigAlmacenes();
    })
    .catch(err => {
      if (msg) { msg.textContent = 'No se pudo guardar: ' + (err.message || err); msg.style.color = 'var(--red)'; }
    })
    .finally(() => {
      btn.disabled = false;
      btn.textContent = 'Guardar nombres';
    });
}

function previsualizarUmbralStock() {
  const input = document.getElementById('inputUmbralStock');
  const preview = document.getElementById('umbralStockPreview');
  if (!input || !preview) return;
  const valor = parseInt(input.value, 10);
  if (isNaN(valor) || valor < 0) {
    preview.textContent = '';
    return;
  }
  preview.textContent = valor === 0
    ? 'Solo se marcarán como stock bajo los productos con 0 unidades.'
    : `Se marcarán como stock bajo los productos con ${valor} ${valor === 1 ? 'unidad' : 'unidades'} o menos.`;
}

// Botones −/+ del stepper: mismo input de siempre, solo le suman o
// restan 1 y disparan la previsualización — no tocan Firebase (eso
// sigue siendo cosa del botón "Guardar", como con el valor escrito
// a mano).
function ajustarUmbralStock(delta) {
  const input = document.getElementById('inputUmbralStock');
  if (!input || input.disabled) return;
  const actual = parseInt(input.value, 10);
  const base = isNaN(actual) ? 0 : actual;
  input.value = Math.max(0, base + delta);
  previsualizarUmbralStock();
}

function cargarUmbralStock() {
  const input = document.getElementById('inputUmbralStock');
  const msg = document.getElementById('umbralStockMsg');
  const sub = document.getElementById('umbralStockSub');
  if (!input) return;
  getTiendaConfig()
    .then(cfg => {
      const umbral = (cfg && cfg.stockBajoUmbral !== undefined && cfg.stockBajoUmbral !== null)
        ? cfg.stockBajoUmbral
        : 5;
      input.value = umbral;
      if (msg) msg.textContent = (cfg && cfg.stockBajoUmbral !== undefined) ? '' : 'Todavía no lo configuraste — el Dashboard usa 5 unidades por defecto.';
      if (sub) sub.textContent = `${umbral} ${umbral === 1 ? 'unidad' : 'unidades'} o menos`;
      previsualizarUmbralStock();
    })
    .catch(() => {
      if (msg) msg.textContent = 'No se pudo cargar el umbral de stock bajo.';
    });
}

function guardarUmbralStock() {
  const input = document.getElementById('inputUmbralStock');
  const msg = document.getElementById('umbralStockMsg');
  const btn = document.getElementById('btnGuardarUmbral');
  const valor = parseInt(input.value, 10);

  if (isNaN(valor) || valor < 0) {
    if (msg) { msg.textContent = 'Ingresa un número de 0 o más.'; msg.style.color = 'var(--red)'; }
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Guardando…';
  setUmbralStock(valor)
    .then(() => {
      if (msg) { msg.textContent = 'Umbral guardado. El Dashboard ya lo usa para marcar el stock bajo.'; msg.style.color = 'var(--text-3)'; }
      const sub = document.getElementById('umbralStockSub');
      if (sub) sub.textContent = `${valor} ${valor === 1 ? 'unidad' : 'unidades'} o menos`;
      // Igual que con la tasa de cambio: si el Dashboard ya está
      // montado en esta misma sesión (SPA, sin recargar), se lo
      // avisamos para que recalcule "Stock bajo" con el valor nuevo
      // sin esperar a que la persona navegue y vuelva.
      if (window.Dashboard && typeof window.Dashboard.setUmbralStock === 'function') {
        window.Dashboard.setUmbralStock(valor);
      }
    })
    .catch(err => {
      if (msg) { msg.textContent = 'No se pudo guardar: ' + (err.message || err); msg.style.color = 'var(--red)'; }
    })
    .finally(() => {
      btn.disabled = false;
      btn.textContent = 'Guardar';
    });
}

// Alerta de stock bajo en el Dashboard — persiste de verdad en
// tiendas/{tiendaId}/config/alertaStockDashboard (ver
// setAlertaDashboard en firebase.js). Antes era un toggle puramente
// visual ("Próximamente"); ahora sí controla si el Dashboard muestra
// el KPI rojo y el panel de "Stock bajo".
function cargarAlertaDashboard() {
  const btn = document.getElementById('toggleAlertaDashboard');
  if (!btn) return;
  getTiendaConfig()
    .then(cfg => {
      const activa = cfg && cfg.alertaStockDashboard === false ? false : true;
      btn.classList.toggle('active', activa);
    })
    .catch(() => {});
}

function toggleAlertaDashboard(btn) {
  if (!btn) return;
  const activa = !btn.classList.contains('active');
  btn.classList.toggle('active', activa);
  btn.disabled = true;
  setAlertaDashboard(activa)
    .then(() => {
      if (window.Dashboard && typeof window.Dashboard.setAlertaDashboard === 'function') {
        window.Dashboard.setAlertaDashboard(activa);
      }
    })
    .catch(() => {
      // Si falla el guardado, la vuelve a su estado anterior en vez
      // de dejar la UI mintiendo sobre lo que quedó guardado.
      btn.classList.toggle('active', !activa);
    })
    .finally(() => { btn.disabled = false; });
}
