// =========================================================
// VAERON — Registro de cuentas Cloudinary (multi-cuenta)
// =========================================================
// Por qué existe esto: el plan gratis de Cloudinary reparte un
// mismo cupo de "créditos" mensuales entre almacenamiento, descarga
// (ancho de banda) y transformaciones — y esa cuenta gratis es UNA
// SOLA. Compartirla entre TODAS las tiendas del sistema se queda
// corta apenas unas pocas tiendas suben catálogos grandes: con el
// peor caso de 3000 fotos de producto por tienda (comprimidas a
// ~480px JPEG en previewProductImage(), stock.js — unos 50-80KB cada
// una), una sola tienda ya puede pesar 150-240MB guardados, y el
// ancho de banda que gasta el Catálogo/Foro mostrando esas fotos
// crece todavía más rápido que el almacenamiento (cada visita que
// carga el catálogo vuelve a descargar esas fotos).
//
// Con el cupo real de la cuenta actual (~5GB guardados + 10GB de
// descarga al mes — ver conversación del 19 ago 2026) y 4 tiendas
// por cuenta (el número decidido para VAERON), el peor caso extremo
// (las 4 tiendas al tope de 3000 fotos a la vez, poco probable en la
// práctica) usa 600-960MB de los 5GB — sobra margen de sobra incluso
// para la descarga. Por eso MAX_TIENDAS_POR_PROYECTO (firebase-
// projects.js) también está en 4: cada proyecto Firebase está
// pareado 1 a 1 con su propia cuenta Cloudinary de abajo, así que el
// mismo tope limita las dos cosas a la vez sin necesitar un contador
// ni una asignación nueva por tienda — la tienda ya sabe en qué
// proyecto vive (proyectoActivo, definido en firebase.js), y con eso
// alcanza para saber qué cuenta Cloudinary le toca.
//
// ── Si más adelante cambian los números ──────────────────────────
// Si subes MAX_TIENDAS_POR_PROYECTO, o el peor caso de fotos por
// tienda deja de ser 3000, repite el cálculo:
//   MB usados en el peor caso = tiendas_por_cuenta × fotos_por_tienda × 0.05 a 0.08MB
// y compáralo contra el cupo real de tu cuenta Cloudinary (revísalo
// en Billing → Plan Details del dashboard, los números cambian con
// el tiempo). Si ya no entra cómodo, baja MAX_TIENDAS_POR_PROYECTO o
// agrupa menos proyectos por cuenta más abajo.
//
// Con 20 tiendas totales y 4 por cuenta, hacen falta 5 cuentas
// Cloudinary — una por cada uno de los 5 primeros proyectos Firebase
// (proyecto_a a proyecto_e). Si en el futuro suman más tiendas,
// sigue el mismo patrón con proyecto_f, proyecto_g, proyecto_h (ya
// están precargados en FIREBASE_PROJECTS) o agrega proyectos nuevos
// ahí.
//
// ── CONFIGURACIÓN (hacer esto por cada cuenta Cloudinary nueva) ──
//   1) Crea una cuenta gratis en https://cloudinary.com (no pide
//      tarjeta) — una por cada grupo de abajo.
//   2) cloudName: aparece en el Dashboard, arriba a la izquierda.
//   3) uploadPreset: Settings → Upload → Upload presets → "Add
//      upload preset" → Signing Mode = "Unsigned" → Save (tiene que
//      ser "Unsigned": la imagen se sube directo desde el navegador
//      de cada tienda, sin backend propio de por medio).
//   4) Ya no quedan cuentas por configurar para VAERON — las 5
//      (proyecto_a a proyecto_e) están completas. Si en el futuro
//      necesitas otra, repite estos 3 pasos y agrega un grupo nuevo
//      acá abajo con la clave de proyecto que corresponda
//      (proyecto_f, proyecto_g o proyecto_h, ya precargados en
//      FIREBASE_PROJECTS).
const CLOUDINARY_ACCOUNTS = [
  {
    cloudName: 'usob9n75',
    uploadPreset: 'vaeron-productos',
    proyectos: ['proyecto_a']
  },
  {
    cloudName: 'dazi3y3r',
    uploadPreset: 'vaeron-productos-b',
    proyectos: ['proyecto_b']
  },
  {
    cloudName: 'ec1cqufw',
    uploadPreset: 'vaeron-productos-c',
    proyectos: ['proyecto_c']
  },
  {
    cloudName: 'sjshtgmr',
    uploadPreset: 'vaeron.produc-d',
    proyectos: ['proyecto_d']
  },
  {
    cloudName: 'qnkwtg0z',
    uploadPreset: 'vaeron-product-E',
    proyectos: ['proyecto_e']
  }
  // Si agregas proyecto_f, proyecto_g o proyecto_h más adelante,
  // suma un grupo más acá con el mismo patrón.
];

// Devuelve {cloudName, uploadPreset} para el proyecto dado: busca el
// grupo que lo tenga en su lista de "proyectos", y si ninguno lo
// tiene todavía, cae al primer grupo de CLOUDINARY_ACCOUNTS como
// respaldo. Devuelve undefined solo si CLOUDINARY_ACCOUNTS está
// vacío del todo — cloudinary.js es quien avisa de eso con un
// mensaje claro al momento de subir, en vez de tronar acá durante la
// carga de la página.
function cuentaCloudinariaDeProyecto(proyecto) {
  const grupo = CLOUDINARY_ACCOUNTS.find(g => g.proyectos.includes(proyecto));
  return grupo || CLOUDINARY_ACCOUNTS[0];
}
