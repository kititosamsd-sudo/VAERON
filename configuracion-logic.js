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
  }
};

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

  const logoNota = document.getElementById('logoPlanNote');
  const logoLabel = document.getElementById('logoFileLabel');
  if (typeof limitePlan === 'function' && !limitePlan('logoPersonalizable')) {
    if (logoNota) logoNota.textContent = `Disponible desde el plan Medio (tu plan actual: ${nombrePlan()}).`;
    if (logoLabel) logoLabel.style.display = 'none';
  } else if (!esAdmin) {
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
  if (!input) return;
  getTiendaConfig()
    .then(cfg => {
      if (cfg && cfg.tasaCambio) {
        input.value = cfg.tasaCambio;
        if (msg) msg.textContent = '';
      } else if (msg) {
        msg.textContent = 'Todavía no configuraste una tasa. Mientras tanto, el catálogo solo muestra cada precio en su propia moneda, sin conversión.';
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

/* ── Almacenes ────────────────────────────────────────────────── */
// Estado local de la tarjeta: se carga una vez con getAlmacenesConfig()
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

  cont.innerHTML = activosOrdenados.map(id => {
    const esAlm1 = id === 'alm1';
    const nombre = escapeHtml(almacenesState.nombres[id] || id);
    const botonEliminar = (!esAlm1 && eliminable)
      ? `<button type="button" class="btn-reg-delete" title="Eliminar almacén" onclick="confirmarEliminarAlmacen('${id}')">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>`
      : '';
    return `
      <div class="almacen-row" data-alm="${id}">
        <span class="almacen-dot"></span>
        <span class="almacen-tag${esAlm1 ? ' almacen-tag-principal' : ''}">${esAlm1 ? 'Principal' : 'Almacén ' + id.replace('alm', '')}</span>
        <input class="form-input" id="inputNombre_${id}" type="text" maxlength="30" value="${nombre}" ${editable ? '' : 'disabled'}>
        ${botonEliminar}
      </div>`;
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
  if (!input) return;
  getTiendaConfig()
    .then(cfg => {
      const umbral = (cfg && cfg.stockBajoUmbral !== undefined && cfg.stockBajoUmbral !== null)
        ? cfg.stockBajoUmbral
        : 5;
      input.value = umbral;
      if (msg) msg.textContent = (cfg && cfg.stockBajoUmbral !== undefined) ? '' : 'Todavía no lo configuraste — el Dashboard usa 5 unidades por defecto.';
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

// Toggle puramente visual (Preferencias generales / alerta de stock
// bajo en dashboard): todavía no persiste nada en Firebase, solo
// refleja el estado en la UI mientras se decide si se conecta a una
// preferencia real.
function togglePreviewVisual(btn) {
  if (!btn) return;
  btn.classList.toggle('active');
}
