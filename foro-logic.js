// =========================================================
// Adonay — Foro entre tiendas
// =========================================================
// Espacio compartido para que una tienda publique o busque
// productos de OTRA tienda (de cualquier rubro) — "vendo tal
// guitarra a tal precio" / "busco tal repuesto". Distinto a todo lo
// demás del sistema, que vive aislado por tienda (tiendas/{tiendaId}
// /...): esto necesita que TODAS las tiendas se vean entre sí, sin
// importar en cuál de los 3 proyectos Firebase vive cada una.
//
// ── Por qué está repartido en los 3 proyectos, no en uno solo ──
// Cada tienda solo tiene sesión iniciada en SU proyecto (no en los
// otros 2 — eso es exclusivo del súper-admin). Escribir siempre
// pasa por el proyecto propio, con las reglas normales de ese
// proyecto. Para LEER las publicaciones de las otras dos, en vez de
// pedir que cada tienda tenga sesión en los 3 (que hubiera obligado
// a tocar el login), foro/publicaciones se lee en modo público — ver
// REGLAS DE FIREBASE NECESARIAS más abajo. Nada más de la base es
// público; esto es lo único pensado para eso.
//
// ── REGLAS DE FIREBASE NECESARIAS (hacer esto a mano, en los 3
//    proyectos, antes de que el Foro funcione de verdad) ──────────
// En cada proyecto (Proyecto A, B y C), agregar en las Reglas:
//   "foro": {
//     "publicaciones": {
//       ".read": true,
//       "$postId": {
//         ".write": "auth != null && (!data.exists() || data.child('tiendaId').val() === auth.token.tiendaId) && (newData.child('tiendaId').val() === auth.token.tiendaId)"
//       }
//     }
//   }
// Si el proyecto no usa custom claims con tiendaId en el token,
// alternativa más simple (algo menos estricta, pero suficiente para
// esta etapa): ".write": "auth != null" — cualquier cuenta con
// sesión en ESE proyecto puede publicar/editar cualquier post de
// ESE proyecto. Nunca de otro: cada quien solo puede escribir en el
// proyecto donde ya tiene sesión.
// =========================================================

const FORO_CATEGORIAS = [
  { id: 'instrumentos', nombre: 'Instrumentos' },
  { id: 'accesorios', nombre: 'Accesorios' },
  { id: 'repuestos', nombre: 'Repuestos y reparación' },
  { id: 'audio', nombre: 'Amplificación y sonido' },
  { id: 'otros', nombre: 'Otros' },
];

// Cache en memoria de la última carga — evita re-pedir a los 3
// proyectos cada vez que se cambia de categoría en la misma visita.
let foroPublicacionesCache = [];

function foroCategoriaNombre(id) {
  const cat = FORO_CATEGORIAS.find(c => c.id === id);
  return cat ? cat.nombre : id;
}

// Lee foro/publicaciones de LOS 3 PROYECTOS a la vez y los junta en
// una sola lista, más reciente primero. Cada proyecto se lee con su
// propia instancia de app (getProjectApp) — no hace falta sesión
// iniciada ahí gracias a la regla ".read": true (ver arriba).
async function cargarPublicacionesForo() {
  const resultados = await Promise.all(allProjectKeys().map(async proyecto => {
    try {
      const snap = await getProjectApp(proyecto).database().ref('foro/publicaciones').once('value');
      const val = snap.val() || {};
      return Object.keys(val).map(id => ({ id, proyecto, ...val[id] }));
    } catch (err) {
      // Si un proyecto todavía no tiene las reglas configuradas (ver
      // arriba) o está caído, no debe tumbar la lectura de los otros
      // dos — se muestra lo que sí se pudo traer.
      console.warn(`[Foro] No se pudo leer foro/publicaciones de ${proyecto}:`, err.message);
      return [];
    }
  }));

  foroPublicacionesCache = resultados.flat().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return foroPublicacionesCache;
}

// Publica en el proyecto PROPIO (proyectoActivo, ver firebase.js) —
// nunca en otro, porque ahí es donde esta cuenta realmente tiene
// permiso de escribir.
function publicarEnForo({ categoria, tipo, titulo, descripcion, precio }) {
  const tit = (titulo || '').trim();
  const desc = (descripcion || '').trim();
  if (!tit) return Promise.reject(new Error('Ponle un título a la publicación.'));
  if (!FORO_CATEGORIAS.some(c => c.id === categoria)) return Promise.reject(new Error('Elige una categoría válida.'));
  if (tipo !== 'vendo' && tipo !== 'busco') return Promise.reject(new Error('Elige si es \"Vendo\" o \"Busco\".'));

  const post = {
    tiendaId: currentTiendaId,
    tiendaNombre: currentTiendaNombre || 'Tienda',
    categoria,
    tipo,
    titulo: tit,
    descripcion: desc,
    precio: (precio !== undefined && precio !== null && precio !== '') ? Number(precio) || 0 : null,
    createdAt: Date.now(),
  };

  return getProjectApp(proyectoActivo).database().ref('foro/publicaciones').push(post)
    .then(ref => {
      registrarEvento('foro_publicacion', `Publicó "${tit}" en el Foro (${foroCategoriaNombre(categoria)})`);
      return ref.key;
    });
}

// Solo se puede borrar la publicación propia (tiendaId coincide) —
// se revisa acá Y en las reglas de Firebase (ver arriba); el check
// de acá es solo para no mostrarle el botón a quien no puede usarlo,
// no reemplaza la regla del servidor.
function eliminarPublicacionForo(proyecto, postId, tiendaIdDelPost) {
  if (tiendaIdDelPost !== currentTiendaId) {
    return Promise.reject(new Error('Solo puedes borrar tus propias publicaciones.'));
  }
  return getProjectApp(proyecto).database().ref('foro/publicaciones').child(postId).remove()
    .then(() => {
      foroPublicacionesCache = foroPublicacionesCache.filter(p => p.id !== postId);
    });
}

// ── Pantalla ─────────────────────────────────────────────────────

let foroCategoriaActual = '';

window.Foro = {
  init() {
    // Defensa además del menú oculto: si alguien ya tenía la pestaña
    // de Foro abierta y el plan baja a Básico (o entra directo por
    // URL con #foro), no se queda viendo el Foro solo porque el
    // link del menú esté escondido — se manda a Stock con un aviso.
    if (typeof limitePlan === 'function' && !limitePlan('foro')) {
      window.location.hash = '#stock';
      alert(`El Foro está disponible desde el plan Medio (tu plan actual: ${nombrePlan()}).`);
      return;
    }
    montarTabsCategoriaForo();
    montarSelectCategoriaForo();
    document.getElementById('foroLista').innerHTML = '<p style="color:var(--text-3);font-size:13px">Cargando publicaciones…</p>';
    cargarPublicacionesForo()
      .then(renderListaForo)
      .catch(err => {
        document.getElementById('foroLista').innerHTML = `<p style="color:var(--red);font-size:13px">No se pudieron cargar las publicaciones: ${err.message}</p>`;
      });
  }
};

function montarTabsCategoriaForo() {
  const cont = document.getElementById('foroCategoriaTabs');
  if (!cont) return;
  // El botón "Todas" ya está fijo en el HTML — se agregan los demás.
  cont.querySelectorAll('.warehouse-tab[data-cat]:not([data-cat=""])').forEach(el => el.remove());
  FORO_CATEGORIAS.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'warehouse-tab';
    btn.dataset.cat = cat.id;
    btn.textContent = cat.nombre;
    btn.onclick = () => filtrarForoCategoria(cat.id);
    cont.appendChild(btn);
  });
}

function montarSelectCategoriaForo() {
  const sel = document.getElementById('foroCategoria');
  if (!sel || sel.options.length) return; // ya montado (el modal se reutiliza)
  FORO_CATEGORIAS.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.nombre;
    sel.appendChild(opt);
  });
}

function filtrarForoCategoria(catId) {
  foroCategoriaActual = catId;
  document.querySelectorAll('#foroCategoriaTabs .warehouse-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cat === catId);
  });
  renderListaForo(foroPublicacionesCache);
}

function renderListaForo(publicaciones) {
  const cont = document.getElementById('foroLista');
  const empty = document.getElementById('foroEmpty');
  if (!cont) return;

  const filtradas = foroCategoriaActual
    ? publicaciones.filter(p => p.categoria === foroCategoriaActual)
    : publicaciones;

  if (!filtradas.length) {
    cont.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';

  cont.innerHTML = filtradas.map(foroCardHtml).join('');
}

function foroCardHtml(p) {
  const esPropia = p.tiendaId === currentTiendaId;
  const tipoBadge = p.tipo === 'vendo'
    ? '<span class="badge badge-green">Vendo</span>'
    : '<span class="badge badge-blue">Busco</span>';
  const precioHtml = (p.precio !== null && p.precio !== undefined && p.precio > 0)
    ? `<div style="font-weight:700;color:var(--text-1);margin-top:4px">S/ ${Number(p.precio).toFixed(2)}</div>`
    : '';
  const fecha = p.createdAt ? new Date(p.createdAt).toLocaleDateString('es-PE', { day: 'numeric', month: 'short' }) : '';
  const borrarHtml = esPropia
    ? `<button class="btn btn-ghost btn-sm" style="color:var(--red);border-color:#FECACA;margin-top:8px" onclick="borrarPublicacionForoUI('${p.proyecto}','${p.id}','${p.tiendaId}')">Eliminar</button>`
    : '';

  return `
    <div class="catalogo-item">
      <div class="catalogo-item-body">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          ${tipoBadge}
          <span style="font-size:11px;color:var(--text-3);white-space:nowrap">${fecha}</span>
        </div>
        <div class="catalogo-item-name" style="margin-top:6px">${escapeHtml(p.titulo || '')}</div>
        <div style="font-size:12px;color:var(--text-3);margin-top:2px">${escapeHtml(foroCategoriaNombre(p.categoria))} · ${escapeHtml(p.tiendaNombre || 'Tienda')}</div>
        ${p.descripcion ? `<div style="font-size:12.5px;color:var(--text-2);margin-top:6px;white-space:pre-wrap">${escapeHtml(p.descripcion)}</div>` : ''}
        ${precioHtml}
        ${borrarHtml}
      </div>
    </div>`;
}

function borrarPublicacionForoUI(proyecto, postId, tiendaId) {
  if (!confirm('¿Eliminar esta publicación del Foro?')) return;
  eliminarPublicacionForo(proyecto, postId, tiendaId)
    .then(() => renderListaForo(foroPublicacionesCache))
    .catch(err => alert(err.message));
}

function abrirNuevaPublicacionForo() {
  document.getElementById('foroTipo').value = 'vendo';
  document.getElementById('foroCategoria').selectedIndex = 0;
  document.getElementById('foroTitulo').value = '';
  document.getElementById('foroPrecio').value = '';
  document.getElementById('foroDescripcion').value = '';
  document.getElementById('foroModalMsg').textContent = '';
  openModal('foroModal');
}

function enviarPublicacionForo() {
  const btn = document.getElementById('btnPublicarForo');
  const msg = document.getElementById('foroModalMsg');
  const datos = {
    tipo: document.getElementById('foroTipo').value,
    categoria: document.getElementById('foroCategoria').value,
    titulo: document.getElementById('foroTitulo').value,
    precio: document.getElementById('foroPrecio').value,
    descripcion: document.getElementById('foroDescripcion').value,
  };

  btn.disabled = true;
  btn.textContent = 'Publicando…';
  publicarEnForo(datos)
    .then(() => {
      closeModal('foroModal');
      return cargarPublicacionesForo();
    })
    .then(renderListaForo)
    .catch(err => {
      if (msg) { msg.textContent = err.message; msg.style.color = 'var(--red)'; }
    })
    .finally(() => {
      btn.disabled = false;
      btn.textContent = 'Publicar';
    });
}
