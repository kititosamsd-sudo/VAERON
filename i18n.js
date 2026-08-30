// =========================================================
// VAERON — Motor de idiomas (i18n)
// =========================================================
// Un solo diccionario, un solo HTML/JS. No hay una copia del
// código en inglés: el texto vive en I18N_DICT y el HTML solo
// tiene una marca (data-i18n="clave") en vez de texto fijo.
// aplicarIdioma() recorre el DOM y reemplaza el texto según el
// idioma activo, cada vez que se muestra una pantalla nueva.
//
// Cómo se conecta con el resto del proyecto:
//  - router.js llama a aplicarIdioma(root) justo después de
//    inyectar el HTML de cada vista (antes de view.init()).
//  - Los archivos *-logic.js que generan texto por JS (alertas,
//    mensajes de validación, filas de tabla armadas a mano) usan
//    t('clave') en vez de escribir el string en español directo.
//  - configuracion-logic.js llama a cambiarIdioma('en'/'es') desde
//    el selector de Idioma en Preferencias.
//
// Cómo agregar una vista nueva al sistema de idiomas:
//  1. En el HTML de la vista, el texto que antes era
//     <h1>Stock</h1> pasa a <h1 data-i18n="stock.titulo">Stock</h1>
//     (el texto que quede adentro es el que se ve ANTES de que
//     cargue el JS — dejalo en español, es solo el "por defecto").
//  2. Agregás la clave 'stock.titulo' en AMBOS bloques (es/en) de
//     I18N_DICT más abajo.
//  3. Listo — no hace falta tocar router.js ni nada más.
// =========================================================

const I18N_DICT = {
  es: {
    // ── Menú lateral (app.html) ──
    'nav.seccion.sistema': 'Sistema',
    'nav.seccion.gestion': 'Gestión',
    'nav.seccion.cuenta': 'Cuenta',
    'nav.tiendas': 'Tiendas',
    'nav.facturacion': 'Facturación',
    'nav.auditoria': 'Auditoría',
    'nav.configSistema': 'Config. del sistema',
    'nav.dashboard': 'Dashboard',
    'nav.stock': 'Stock',
    'nav.catalogo': 'Catálogo',
    'nav.pedidos': 'Pedidos',
    'nav.foro': 'Foro',
    'nav.registros': 'Registros',
    'nav.configuracion': 'Configuración',
    'nav.perfil': 'Perfil',

    // ── Acciones genéricas, se repiten en toda la app ──
    'accion.guardar': 'Guardar',
    'accion.cancelar': 'Cancelar',
    'accion.cerrar': 'Cerrar',
    'accion.editar': 'Editar',
    'accion.eliminar': 'Eliminar',
    'accion.buscar': 'Buscar',
    'accion.agregar': 'Agregar',
    'accion.confirmar': 'Confirmar',
    'accion.volver': 'Volver',
    'accion.cargando': 'Cargando…',

    // ── login.html ──
    'login.bienvenida': 'Bienvenido de nuevo',
    'login.subtitulo': 'Inicia sesión para continuar',
    'login.correo': 'Correo electrónico',
    'login.correoPlaceholder': 'ejemplo@empresa.com',
    'login.clave': 'Contraseña',
    'login.clavePlaceholder': 'Ingresa tu contraseña',
    'login.mostrarClave': 'Mostrar/ocultar contraseña',
    'login.recordarme': 'Recordarme',
    'login.olvideClave': '¿Olvidaste tu contraseña?',
    'login.entrar': 'Iniciar sesión',
    'login.entrando': 'Ingresando…',
    'login.sinCuenta': '¿No tienes cuenta?',
    'login.pedirAcceso': 'Pide acceso a tu administrador',

    // ── Configuración → Preferencias / Soporte ──
    'config.preferencias': 'Preferencias',
    'config.soporte': 'Soporte',
    'config.tema': 'Tema',
    'config.temaClaro': 'Claro',
    'config.temaOscuro': 'Oscuro',
    'config.idioma': 'Idioma',
    'config.idiomaEspanol': 'Español',
    'config.idiomaIngles': 'Inglés',
    'config.centroAyuda': 'Centro de ayuda',
    'config.contactarSoporte': 'Contactar soporte',
    'config.proximamente': 'Próximamente',
  },

  en: {
    // ── Sidebar (app.html) ──
    'nav.seccion.sistema': 'System',
    'nav.seccion.gestion': 'Management',
    'nav.seccion.cuenta': 'Account',
    'nav.tiendas': 'Stores',
    'nav.facturacion': 'Billing',
    'nav.auditoria': 'Audit log',
    'nav.configSistema': 'System settings',
    'nav.dashboard': 'Dashboard',
    'nav.stock': 'Stock',
    'nav.catalogo': 'Catalog',
    'nav.pedidos': 'Orders',
    'nav.foro': 'Forum',
    'nav.registros': 'Staff accounts',
    'nav.configuracion': 'Settings',
    'nav.perfil': 'Profile',

    // ── Generic actions, reused across the app ──
    'accion.guardar': 'Save',
    'accion.cancelar': 'Cancel',
    'accion.cerrar': 'Close',
    'accion.editar': 'Edit',
    'accion.eliminar': 'Delete',
    'accion.buscar': 'Search',
    'accion.agregar': 'Add',
    'accion.confirmar': 'Confirm',
    'accion.volver': 'Back',
    'accion.cargando': 'Loading…',

    // ── login.html ──
    'login.bienvenida': 'Welcome back',
    'login.subtitulo': 'Sign in to continue',
    'login.correo': 'Email',
    'login.correoPlaceholder': 'example@company.com',
    'login.clave': 'Password',
    'login.clavePlaceholder': 'Enter your password',
    'login.mostrarClave': 'Show/hide password',
    'login.recordarme': 'Remember me',
    'login.olvideClave': 'Forgot your password?',
    'login.entrar': 'Sign in',
    'login.entrando': 'Signing in…',
    'login.sinCuenta': "Don't have an account?",
    'login.pedirAcceso': 'Ask your admin for access',

    // ── Settings → Preferences / Support ──
    'config.preferencias': 'Preferences',
    'config.soporte': 'Support',
    'config.tema': 'Theme',
    'config.temaClaro': 'Light',
    'config.temaOscuro': 'Dark',
    'config.idioma': 'Language',
    'config.idiomaEspanol': 'Spanish',
    'config.idiomaIngles': 'English',
    'config.centroAyuda': 'Help center',
    'config.contactarSoporte': 'Contact support',
    'config.proximamente': 'Coming soon',
  }
};

const IDIOMAS_VALIDOS = ['es', 'en'];
let idiomaActual = (localStorage.getItem('vaeron_idioma') || 'es');
if (!IDIOMAS_VALIDOS.includes(idiomaActual)) idiomaActual = 'es';

// t('clave') — helper que usan los archivos *-logic.js para textos
// generados por JS (alertas, validaciones, encabezados armados a
// mano). Si la clave no existe en el idioma activo, cae a español;
// si tampoco existe en español, devuelve la clave tal cual (para
// notar fácil que falta agregarla, en vez de romper la pantalla).
function t(clave) {
  const dictActual = I18N_DICT[idiomaActual] || I18N_DICT.es;
  if (clave in dictActual) return dictActual[clave];
  if (clave in I18N_DICT.es) return I18N_DICT.es[clave];
  return clave;
}

// Recorre root (por defecto, todo el documento) y aplica el
// idioma activo a cualquier elemento marcado con data-i18n /
// data-i18n-placeholder / data-i18n-title.
function aplicarIdioma(root) {
  const scope = root || document;
  scope.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  scope.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
  scope.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.getAttribute('data-i18n-title'));
  });
  document.documentElement.setAttribute('lang', idiomaActual);
  if (typeof traducirTextoAutomatico === 'function') traducirTextoAutomatico(scope);
}

// Llamado desde el selector de Idioma en Configuración.
function cambiarIdioma(nuevo) {
  if (!IDIOMAS_VALIDOS.includes(nuevo) || nuevo === idiomaActual) return;
  idiomaActual = nuevo;
  localStorage.setItem('vaeron_idioma', nuevo);
  aplicarIdioma(document);
  // Re-renderiza la vista actual para que las partes armadas por JS
  // (tablas, mensajes de estado vacío, etc.) también se traduzcan,
  // no solo el HTML estático.
  if (window.Router && Router.currentPage) {
    Router.go(Router.currentPage, { force: true });
  }
}

function idiomaActivo() {
  return idiomaActual;
}

// =========================================================
// Traducción automática del resto de la app (sin tocar los
// archivos de cada vista)
// =========================================================
// Lo de arriba (I18N_DICT + data-i18n) es lo "fino": para el
// menú, el login y Configuración, donde vale la pena tener la
// clave explícita. Para el resto de las 11 pantallas, en vez de
// ir a cada una a marcar cada texto (mucho código, y casi una
// copia del HTML), esto hace la traducción por diccionario de
// frases exactas: cuando el idioma activo es inglés, recorre el
// texto que ya está en pantalla y reemplaza cada frase que
// reconoce. Un solo diccionario, cero archivos duplicados.
//
// Cobertura: textos fijos (títulos, botones, encabezados de
// tabla, placeholders) y los mensajes de alert()/confirm() más
// comunes. No traduce frases armadas con datos variables (ej.
// "Tienes 3 productos"), porque esas no tienen una frase fija
// que buscar en el diccionario — quedarían pendientes para una
// vista posterior si se quiere cubrir eso también.
const FRASES_ES_EN = {
  'Cancelar': 'Cancel', 'Cerrar': 'Close', 'Guardar': 'Save',
  'Guardar cambios': 'Save changes', 'Editar': 'Edit', 'Tienda': 'Store',
  'Soles (S/)': 'Soles (S/)', 'Dólares ($)': 'Dollars ($)', 'Nombre': 'Name',
  'Código': 'Code', 'Cantidad': 'Quantity', 'Imagen': 'Image', 'Todas': 'All',
  'Compartir': 'Share', 'Configuración': 'Settings', 'Plan': 'Plan',
  'Próximo cobro': 'Next billing', 'Estado de pago': 'Payment status',
  'Seleccionar todo': 'Select all', 'Procesar importación': 'Process import',
  'RUC': 'Tax ID (RUC)', 'Ciudad': 'City', 'Cambiar contraseña': 'Change password',
  'Estado': 'Status', 'Moneda': 'Currency', 'Costo': 'Cost', 'Precio': 'Price',
  'Precio mayor': 'Wholesale price', 'Nombre de la tienda / empresa': 'Store / company name',
  'Nombre del administrador': 'Admin name', 'Correo del administrador': 'Admin email',
  'Auditoría': 'Audit log', 'Fecha': 'Date', 'Evento': 'Event', 'Detalle': 'Detail',
  'Realizado por': 'Performed by', 'Catálogo': 'Catalog', 'Con foto': 'With photo',
  'Recientes': 'Recent', 'Nombre (A-Z)': 'Name (A-Z)', 'Nombre (Z-A)': 'Name (Z-A)',
  'Cuenta y seguridad': 'Account & security', 'Capacidad de los proyectos': 'Project capacity',
  'Almacenes': 'Warehouses', 'Notificaciones': 'Notifications', 'Inventario': 'Inventory',
  'Tienda y cuenta': 'Store & account', 'Centro de ayuda': 'Help center',
  '+ Agregar almacén': '+ Add warehouse', 'Guardar nombres': 'Save names',
  '1,234.56 (coma miles, punto decimal)': '1,234.56 (comma thousands, period decimal)',
  '1.234,56 (punto miles, coma decimal)': '1.234,56 (period thousands, comma decimal)',
  '¿Cómo agrego un producto nuevo al stock?': 'How do I add a new product to stock?',
  '¿Cuál es la diferencia entre los planes Básico, Medio y Premium?': "What's the difference between the Basic, Medium, and Premium plans?",
  '¿Cómo agrego a un vendedor a mi tienda?': 'How do I add a salesperson to my store?',
  'Olvidé mi contraseña, ¿qué hago?': 'I forgot my password, what do I do?',
  '¿Mis datos se comparten con otras tiendas del sistema?': 'Is my data shared with other stores in the system?',
  '¿Cómo cambio mi nombre o contraseña de cuenta?': 'How do I change my account name or password?',
  'Dashboard': 'Dashboard', 'Stock por almacén': 'Stock by warehouse',
  'Stock por categoría': 'Stock by category', 'Stock bajo': 'Low stock',
  'Rentabilidad de inventario': 'Inventory profitability', 'Mayor margen unitario': 'Highest unit margin',
  'Análisis inteligente de tu inventario': 'Smart analysis of your inventory',
  'Concentración de valor (ABC)': 'Value concentration (ABC)', 'Valor por almacén': 'Value by warehouse',
  'Índice de salud del inventario': 'Inventory health index', 'Comparativa entre almacenes': 'Warehouse comparison',
  'Insights inteligentes': 'Smart insights', 'Facturación': 'Billing', 'Editar facturación': 'Edit billing',
  'Monto mensual (S/)': 'Monthly amount (S/)', 'Monto mensual': 'Monthly amount',
  'Básico': 'Basic', 'Medio': 'Medium', 'Premium': 'Premium', 'Al día': 'Up to date',
  'Pendiente': 'Pending', 'Vencido': 'Overdue', 'Foro entre tiendas': 'Cross-store forum',
  'Nueva publicación': 'New post', '+ Nueva publicación': '+ New post', 'Publicar': 'Post',
  'Tipo': 'Type', 'Categoría': 'Category', 'Título': 'Title', 'Precio (opcional)': 'Price (optional)',
  'Descripción': 'Description', 'Vendo': 'Selling', 'Busco': 'Looking for',
  'Notas de Pedido': 'Order Notes', 'Editar cliente': 'Edit client', 'Importar clientes': 'Import clients',
  'Eliminar cliente': 'Delete client', 'Cancelar importación': 'Cancel import',
  'Omitir duplicados e importar el resto': 'Skip duplicates and import the rest',
  'Razón social': 'Business name', 'Cliente': 'Client', 'Acciones': 'Actions', 'Perfil': 'Profile',
  'Nombre para mostrar': 'Display name', 'Contraseña actual': 'Current password',
  'Nueva contraseña': 'New password', 'Confirmar nueva contraseña': 'Confirm new password',
  'Registros': 'Staff accounts', 'Nueva cuenta': 'New account', 'Crear cuenta': 'Create account',
  'Usuario (para iniciar sesión)': 'Username (to sign in)', 'Contraseña temporal': 'Temporary password',
  'Usuario': 'Username', 'Rol': 'Role', 'Stock': 'Stock', 'Editar producto': 'Edit product',
  'Nuevo producto': 'New product', 'Importar productos': 'Import products',
  'Editar cantidad': 'Edit quantity', 'Importar cantidad': 'Import quantity',
  'Todos los almacenes': 'All warehouses', 'Almacén 1': 'Warehouse 1',
  'Eliminar producto': 'Delete product', 'Registrar producto': 'Register product',
  'Siguiente': 'Next', 'Cambiar imagen': 'Change image', 'Nombre del producto': 'Product name',
  'Subir imagen': 'Upload image', '¿En qué almacén se guarda?': 'Which warehouse is it stored in?',
  'Cantidad en este almacén': 'Quantity in this warehouse', 'Precio venta': 'Sale price',
  'Tiendas': 'Stores', 'Nueva tienda': 'New store', 'Editar tienda': 'Edit store',
  'Crear tienda': 'Create store', 'Enviar correo para restablecerla': 'Send reset email',
  'Contraseña inicial': 'Initial password', 'Teléfono': 'Phone', 'Dirección': 'Address',
  'Contraseña': 'Password', 'Contacto': 'Contact', 'Usuarios': 'Users', 'Alta': 'Active',

  // Placeholders de inputs
  'Buscar producto o código…': 'Search product or code…',
  'Detalle adicional del producto': 'Additional product detail',
  'Detalles, estado, forma de contacto...': 'Details, condition, how to contact...',
  'Mínimo 6 caracteres': 'Minimum 6 characters',
  'RUC o razón social…': 'Tax ID (RUC) or business name…',
  'Ej: Av. Los Músicos 123': 'E.g: Av. Los Músicos 123',
  'Ej. Ana Torres': 'E.g. Ana Torres', 'Ej: Carlos Pérez': 'E.g: Carlos Pérez',
  'Ej: Lima': 'E.g: Lima',

  // Mensajes de alert()/confirm() más comunes
  'Completa la razón social.': 'Please fill in the business name.',
  'Completa nombre y código.': 'Please fill in name and code.',
  'El RUC debe tener exactamente 11 dígitos.': 'The Tax ID (RUC) must have exactly 11 digits.',
  'El código no puede estar vacío.': 'The code cannot be empty.',
  'El nombre no puede estar vacío.': 'The name cannot be empty.',
  'La cantidad no puede estar vacía ni ser negativa.': 'The quantity cannot be empty or negative.',
  'No se pudo procesar la imagen. Intenta con otro archivo.': "Couldn't process the image. Try another file.",
  'Segunda confirmación: ¿estás seguro? Se borrarán todos los clientes.': 'Second confirmation: are you sure? All clients will be deleted.',
  '¿Cerrar sesión?': 'Log out?',
  '¿Eliminar esta publicación del Foro?': 'Delete this Forum post?'
};

// Recorre los nodos de TEXTO (no elementos) dentro de root y
// reemplaza cualquier frase exacta que encuentre en el
// diccionario. Se salta los elementos que ya maneja el sistema
// de claves (data-i18n) para no pisarlos.
function traducirTextoAutomatico(root) {
  if (idiomaActual !== 'en') return; // en español no hay nada que tocar
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const nodos = [];
  let n;
  while ((n = walker.nextNode())) nodos.push(n);
  nodos.forEach(nodo => {
    const el = nodo.parentElement;
    if (el && (el.hasAttribute('data-i18n') || el.closest('[data-i18n]'))) return;
    const texto = nodo.nodeValue.trim();
    if (texto && FRASES_ES_EN[texto]) {
      nodo.nodeValue = nodo.nodeValue.replace(texto, FRASES_ES_EN[texto]);
    }
  });
  // placeholders
  root.querySelectorAll ? root.querySelectorAll('[placeholder]').forEach(el => {
    const ph = el.getAttribute('placeholder');
    if (ph && FRASES_ES_EN[ph]) el.setAttribute('placeholder', FRASES_ES_EN[ph]);
  }) : null;
}

// alert()/confirm() son diálogos nativos del navegador — no son
// parte del DOM, así que ni el escaneo de texto ni el
// MutationObserver los puede tocar. Se interceptan acá.
(function interceptarDialogosNativos() {
  const alertOriginal = window.alert;
  const confirmOriginal = window.confirm;
  window.alert = function (mensaje) {
    const texto = (idiomaActual === 'en' && FRASES_ES_EN[mensaje]) ? FRASES_ES_EN[mensaje] : mensaje;
    return alertOriginal.call(window, texto);
  };
  window.confirm = function (mensaje) {
    const texto = (idiomaActual === 'en' && FRASES_ES_EN[mensaje]) ? FRASES_ES_EN[mensaje] : mensaje;
    return confirmOriginal.call(window, texto);
  };
})();

// El contenido que arman los *-logic.js (tablas, listas, estados
// vacíos) se inyecta DESPUÉS de que router.js llama a
// aplicarIdioma(). Este observer traduce automáticamente
// cualquier cosa nueva que aparezca en pantalla, mientras el
// idioma activo sea inglés — así no hace falta tocar cada
// archivo *-logic.js para que arme el texto ya traducido.
if (typeof document !== 'undefined' && document.body) {
  const observadorIdioma = new MutationObserver(mutaciones => {
    if (idiomaActual !== 'en') return;
    mutaciones.forEach(m => {
      m.addedNodes.forEach(nodo => {
        if (nodo.nodeType === 1) traducirTextoAutomatico(nodo);
      });
    });
  });
  observadorIdioma.observe(document.body, { childList: true, subtree: true });
}
