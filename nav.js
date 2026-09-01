// =========================================================
// Adonay — Sidebar navigation
// =========================================================

// ── Guardar/compartir archivo XLSX ──────────────────────
// El navigator.share() del navegador es poco confiable dentro del
// WebView de Android (canShare puede devolver false sin avisar).
// Por eso, dentro del APK usamos los plugins NATIVOS de Capacitor
// (Filesystem + Share), que sí funcionan de forma consistente.
// En desarrollo/desktop (localhost en el navegador) usamos la
// descarga clásica del navegador.
async function saveWorkbook(wb, filename) {
  const isNative = window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform();

  if (isNative) {
    try {
      const { Filesystem, Share } = Capacitor.Plugins;
      const base64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
      const result = await Filesystem.writeFile({
        path: filename,
        data: base64,
        directory: 'CACHE'
      });
      await Share.share({ title: filename, url: result.uri, dialogTitle: 'Guardar o compartir' });
    } catch (err) {
      const msg = (err && err.message) || '';
      if (/cancel/i.test(msg)) return; // el usuario cerró el panel de compartir
      alert('No se pudo guardar el archivo: ' + (msg || 'error desconocido'));
    }
    return;
  }

  XLSX.writeFile(wb, filename); // navegador de escritorio
}

// ── Panel "Más" del tab bar móvil (plan pagado) ─────────────────
// Agrupa Foro/Registros/Configuración/Perfil detrás de un botón
// cuando el plan pagado agrega demasiadas secciones para una sola
// fila (ver .nav-mobile-overflow / .nav-more-toggle en base.css).
function toggleNavMore(force) {
  const open = typeof force === 'boolean' ? force : !document.body.classList.contains('nav-more-open');
  document.body.classList.toggle('nav-more-open', open);
  const btn = document.getElementById('navMoreToggle');
  if (btn) btn.setAttribute('aria-expanded', String(open));
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') toggleNavMore(false);
});

document.addEventListener('DOMContentLoaded', () => {
  const items = document.querySelectorAll('.nav-item[data-page]');

  items.forEach(item => {
    item.addEventListener('click', e => {
      const page = item.dataset.page;
      if (!page) return;
      // Si existe el router de la SPA (index.html), lo usamos —
      // así no se recarga la página. Si no existe (todavía estás
      // en una página suelta), cae a la navegación normal del
      // navegador.
      if (window.Router) {
        e.preventDefault();
        Router.go(page);
      } else {
        window.location.href = `${page}.html`;
      }
      // Cualquier navegación (ya sea desde la barra principal o
      // desde dentro del panel "Más") cierra el panel si estaba
      // abierto — si no, se queda flotando sobre la pantalla nueva.
      if (typeof toggleNavMore === 'function') toggleNavMore(false);
    });
  });

  // Marcar la sección activa — en la SPA lo hace el Router; esto
  // es el respaldo para páginas sueltas que todavía no se migraron.
  if (!window.Router) {
    const current = window.location.pathname.split('/').pop().replace('.html', '') || 'pedidos';
    document.querySelectorAll(`.nav-item[data-page="${current}"]`).forEach(el => {
      el.classList.add('active');
    });
  }

  // ── Ocultar la barra inferior mientras el teclado está abierto ──
  // En WebViews (Capacitor/Android) los elementos position:fixed no se
  // reposicionan de forma confiable cuando aparece el teclado virtual,
  // por lo que la barra queda flotando sobre el teclado. La solución más
  // estable es ocultarla en base al foco real de los campos de texto.
  const FIELD_SELECTOR = 'input, textarea, select';
  const isMobileViewport = () => window.matchMedia('(max-width: 768px)').matches;

  document.addEventListener('focusin', e => {
    if (isMobileViewport() && e.target.matches(FIELD_SELECTOR)) {
      document.body.classList.add('keyboard-open');
    }
  });

  document.addEventListener('focusout', e => {
    if (e.target.matches(FIELD_SELECTOR)) {
      document.body.classList.remove('keyboard-open');
    }
  });

  // ── Enter/Ir: cerrar el teclado Y ejecutar la acción del campo ──
  // Quitar el foco (blur) hace que el teclado virtual se oculte en
  // Android/Capacitor. Además de eso, buscamos "lo que sigue" según
  // el contexto del campo: agregar el artículo en Nueva Nota,
  // disparar el botón principal si el campo está dentro de un modal
  // abierto (Guardar cambios / Registrar producto / Procesar
  // importación...), o simplemente confirmar el filtro/búsqueda que
  // ya se aplica en vivo con oninput. Cubrimos keydown, keypress
  // (algunos teclados de Android solo disparan uno de los dos) y el
  // evento nativo "search" del botón de lupa en inputs type="search".
  const isVisible = el => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length));

  const runEnterAction = e => {
    const isEnter = e.key === 'Enter' || e.keyCode === 13 || e.which === 13;
    if (!isEnter) return;
    const el = e.target;
    if (!el.matches('input, textarea')) return;

    // Si el propio campo ya intercepta Enter por su cuenta (p. ej. el
    // buscador de productos de Nueva Nota, que navega/selecciona
    // sugerencias con las flechas y Enter), respetamos ese
    // comportamiento y solo cerramos el teclado.
    if (e.defaultPrevented) {
      el.blur();
      return;
    }

    e.preventDefault();
    el.blur();

    // Nueva Nota: Enter en cantidad o precio agrega el artículo.
    if ((el.id === 'addQty' || el.id === 'addPrice') && typeof addItem === 'function') {
      addItem();
      return;
    }

    // Campo dentro de un modal abierto: dispara el botón principal
    // visible del pie del modal (Guardar cambios, Registrar
    // producto, Procesar importación, etc.).
    const modal = el.closest('.modal-overlay.open .modal');
    if (modal) {
      const footer  = modal.querySelector('.modal-footer');
      const primary = footer && footer.querySelector('.btn-primary');
      if (isVisible(primary)) primary.click();
      return;
    }

    // Buscadores y filtros (searchInput, filterDesde/Hasta, etc.):
    // ya filtran en vivo con oninput/onchange, así que Enter solo
    // necesita confirmar cerrando el teclado, lo cual ya hicimos.
  };
  document.addEventListener('keydown', runEnterAction);
  document.addEventListener('keypress', runEnterAction);
  document.addEventListener('search', e => e.target.blur());

  // ── Ocultar botones del topbar mientras se scrollea (tablet/móvil) ──
  // En pantallas ≤1280px el topbar pasa a dos filas: título arriba,
  // botones de acción (Seleccionar/Importar/Exportar/Agregar) abajo.
  // Esa fila de botones le resta espacio de lectura a la lista de
  // abajo. Apenas el usuario se aleja del tope de la lista, se ocultan
  // esos botones (queda solo el buscador) — y a diferencia de antes,
  // NO vuelven solos tras una pausa: se quedan ocultos hasta que el
  // usuario scrollea de vuelta arriba del todo (a pedido: reaparecer
  // solos al pausar se sentía como que la pantalla "parpadeaba"). El
  // listener va en el document con "capture" porque el evento
  // "scroll" no burbujea — así se captura sin importar qué vista esté
  // montada en cada momento.
  //
  // Escucha el scroll de main.main, NO de .page-content: hasta hace
  // poco .page-content tenía su propio overflow-y:auto además del de
  // main.main — dos contenedores scrolleables anidados al mismo
  // tiempo, lo que hacía que en móvil el scroll se sintiera trabado y
  // parpadeando (ver el comentario en base.css, breakpoint ≤1280px).
  // Se le quitó el scroll propio a .page-content y quedó main.main
  // como el único contenedor que scrollea — así que este listener
  // tiene que escuchar A ESE elemento, no al viejo.
  const SCROLL_TOP_THRESHOLD = 4; // px — "está arriba del todo" con algo de margen
  const isCompactTopbarViewport = () => window.matchMedia('(max-width: 1280px)').matches;

  // BUG REAL: en una lista corta (ej. Stock filtrado a un almacén con
  // pocos productos), el alto que libera ocultar los botones puede ser
  // MAYOR que lo poco que faltaba por scrollear. Al ocultarlos, el
  // contenido deja de necesitar scroll → el navegador fuerza scrollTop
  // a 0 automáticamente → eso dispara un scroll "fantasma" con
  // scrollTop=0 → se vuelven a mostrar los botones → el contenido
  // vuelve a necesitar ese scroll → se ocultan de nuevo... un ciclo que
  // se veía como parpadeo constante y que además impedía terminar de
  // bajar (nunca se estabilizaba). Por eso, antes de ocultar, medimos
  // cuánto alto liberaría hacerlo y solo se ocultan si, restando ese
  // alto, sigue quedando scroll real de sobra.
  function alcanzaScrollRealParaOcultar(target) {
    const actions = document.querySelector('.topbar-actions');
    if (!actions) return true;
    const shownHeight = actions.getBoundingClientRect().height;
    document.body.classList.add('topbar-scrolling');
    const hiddenHeight = actions.getBoundingClientRect().height;
    document.body.classList.remove('topbar-scrolling'); // se resuelve de nuevo más abajo con el valor real
    const alturaLiberada = Math.max(0, shownHeight - hiddenHeight);
    const maxScroll = target.scrollHeight - target.clientHeight;
    return (maxScroll - alturaLiberada) > SCROLL_TOP_THRESHOLD;
  }

  document.addEventListener('scroll', e => {
    const target = e.target;
    if (!target || !target.matches || !target.matches('main.main')) return;
    if (!isCompactTopbarViewport()) return;
    // BUG REAL: al enfocar o escribir en un buscador (ej. "RUC o razón
    // social…" de Notas de Pedido), el teclado virtual aparece/cambia
    // de tamaño y el navegador reacomoda la página para mantener el
    // campo visible — eso dispara un evento "scroll" real aunque el
    // usuario no haya deslizado nada. Sin este chequeo, ese scroll
    // "fantasma" activaba topbar-scrolling y escondía de golpe los
    // botones (incluido "Nuevo cliente"). Si hay un campo de texto
    // enfocado, no es un scroll intencional del usuario — se ignora.
    const active = document.activeElement;
    if (active && active.matches(FIELD_SELECTOR)) return;

    // Esta regla oculta "todo lo del topbar EXCEPTO el buscador"
    // (ver CSS: body.topbar-scrolling .topbar-actions > *:not(.search-wrap)),
    // pensada para vistas como Stock/Notas de Pedido donde el buscador
    // se queda visible como referencia. Pero en vistas sin buscador en
    // el topbar (Nueva Nota: solo el N° de nota + "Volver"; Registros:
    // solo "Nuevo vendedor") no queda NADA visible — se ocultaba
    // literalmente todo, incluido "Volver". Si no hay buscador que
    // sirva de referencia, no tiene sentido ocultar nada: se deja el
    // topbar siempre visible en esas vistas.
    if (!document.querySelector('.topbar-actions .search-wrap')) return;

    const yaOculto = document.body.classList.contains('topbar-scrolling');
    if (!yaOculto && target.scrollTop > SCROLL_TOP_THRESHOLD && !alcanzaScrollRealParaOcultar(target)) {
      return; // no hay margen real para ocultar sin generar el rebote descrito arriba
    }

    document.body.classList.toggle('topbar-scrolling', target.scrollTop > SCROLL_TOP_THRESHOLD);
  }, true);
});

// ── Botón físico/gesto de "atrás" en Android (Capacitor) ──────
// Por defecto, sin este listener, Android simplemente cierra la app
// entera al presionar atrás — sin importar si hay un teclado abierto,
// un modal abierto, o en qué sección de la SPA estás. Eso es lo que
// se sentía "poco profesional": cerraba el teclado bien la primera
// vez, pero la segunda vez mataba la app entera en vez de navegar.
//
// Aquí interceptamos ese botón y decidimos qué hacer en capas,
// de más específico a más general:
//   1) Modal abierto           -> cerrar el modal
//   2) Modo selección activo (Seleccionar/Cancelar) -> lo apaga, sin navegar
//   3) Panel "más filtros" abierto (Historial, móvil) -> lo cierra
//   4) Teclado abierto (campo con foco) -> solo quitar el foco
//   5) Pantalla "Nueva Nota"   -> actúa como el botón "Volver"
//   6) Otra sección de la SPA  -> vuelve a la pantalla principal
//   7) Ya en la pantalla principal -> exige un segundo toque para
//      salir de verdad (patrón estándar "presiona de nuevo para salir")
document.addEventListener('DOMContentLoaded', () => {
  const isNative = window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform();
  if (!isNative || !Capacitor.Plugins || !Capacitor.Plugins.App) return;

  const HOME_PAGE = () => (typeof currentUserRole !== 'undefined' && currentUserRole === 'superadmin') ? 'tiendas' : 'dashboard';
  let lastBackPressAt = 0;

  function showExitHint() {
    const existing = document.getElementById('backExitHint');
    if (existing) existing.remove();
    const hint = document.createElement('div');
    hint.id = 'backExitHint';
    hint.textContent = 'Presiona atrás de nuevo para salir';
    hint.style.cssText =
      'position:fixed;left:50%;bottom:76px;transform:translateX(-50%);' +
      'background:#16181D;color:#fff;padding:9px 16px;border-radius:999px;' +
      'font-size:12.5px;font-weight:500;z-index:99999;box-shadow:0 6px 16px rgba(0,0,0,.25)';
    document.body.appendChild(hint);
    setTimeout(() => hint.remove(), 1800);
  }

  Capacitor.Plugins.App.addListener('backButton', () => {
    // 1) Modal abierto: ciérralo y no hagas nada más.
    const openModal = document.querySelector('.modal-overlay.open');
    if (openModal) {
      const closeBtn = openModal.querySelector('.modal-close');
      if (closeBtn) closeBtn.click();
      else openModal.classList.remove('open');
      return;
    }

    // 2) Modo selección activo (botón "Seleccionar" → "Cancelar" en Stock,
    // Pedidos o Historial): lo apaga y se queda en la misma sección, en vez
    // de navegar. Se revisan los tres controladores porque cada vista tiene
    // el suyo y solo uno puede estar activo a la vez.
    const activeSelection = [
      typeof stockSelection  !== 'undefined' ? stockSelection  : null,
      typeof clientSelection !== 'undefined' ? clientSelection : null,
      typeof histSelection   !== 'undefined' ? histSelection   : null
    ].find(sel => sel && sel.isOn());
    if (activeSelection) {
      activeSelection.set(false);
      return;
    }

    // 3) Teclado abierto: quitar el foco cierra el teclado en Android,
    // y no debe navegar ni cerrar nada más en esta misma pulsación.
    const active = document.activeElement;
    if (active && active.matches('input, textarea, select')) {
      active.blur();
      document.body.classList.remove('keyboard-open');
      return;
    }

    // 4) Cualquier otra sección (Stock, Registros...): vuelve a la
    // pantalla principal en vez de salir de la app.
    if (window.Router && Router.currentPage && Router.currentPage !== HOME_PAGE()) {
      Router.go(HOME_PAGE());
      return;
    }

    // 5) Ya en la pantalla principal: exige doble toque para salir.
    const now = Date.now();
    if (now - lastBackPressAt < 2000) {
      Capacitor.Plugins.App.exitApp();
    } else {
      lastBackPressAt = now;
      showExitHint();
    }
  });
});