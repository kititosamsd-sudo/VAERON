// =========================================================
// Límites y funciones habilitadas según el PLAN de la tienda
// (Básico / Medio / Premium).
//
// PLAN_LIMITES es la única fuente de verdad — todo lo que en el
// resto del código pregunta "¿esta tienda puede hacer X?" pasa por
// limitePlan('claveX'), nunca por un "if (plan === 'medio')" suelto
// repetido en cada archivo. Así, el día que cambien los números de
// un plan, se edita en UN solo lugar.
//
// currentTiendaPlan lo carga auth-guard.js al iniciar sesión, leyendo
// tiendas/{tiendaId}/info/plan (lo fija el súper-admin desde
// Facturación — ver facturacion-logic.js). Una tienda sin plan
// asignado todavía, o con un valor que no reconocemos, se trata como
// 'basico': el más restrictivo, nunca al revés — así un dato faltante
// o corrupto nunca regala funciones de un plan pago por accidente.
// =========================================================
const PLAN_LIMITES = {
  basico: {
    maxVendedores: 1,
    maxAlmacenes: 2,
    almacenesEditable: false,
    almacenesEliminables: false,
    logoPersonalizable: false,
    notificaciones: false,
    campoCosto: false,
    campoPrecioMayor: false,
    compartirImagen: false,
    foro: false,
    // Pedidos/Registros/Clientes: ocultos en Básico (ver nav-plan-pago
    // en index.html para Pedidos y Registros). Este flag es lo que usa
    // dashboard-logic.js para ocultar también la tarjeta "Clientes
    // registrados" — no tiene sentido mostrarla si la tienda no puede
    // gestionar clientes en ningún otro lado de la app.
    pedidosDisponible: false,
    // Panel avanzado del Dashboard (ABC de inventario, valor por
    // almacén, índice de salud) — ver renderAdvancedPanel() en
    // dashboard-logic.js. Básico/Medio ven una vista previa
    // bloqueada del mismo panel, no una ausencia total.
    panelAvanzado: false,
  },
  medio: {
    maxVendedores: 2,
    maxAlmacenes: 4,
    almacenesEditable: true,
    almacenesEliminables: true,
    logoPersonalizable: true,
    notificaciones: true,
    campoCosto: true,
    campoPrecioMayor: false,
    compartirImagen: true,
    foro: true,
    pedidosDisponible: true,
    panelAvanzado: false,
  },
  premium: {
    maxVendedores: Infinity,
    // 6 es un tope fijo (no "ilimitado"): el modelo de datos sigue
    // guardando la cantidad de cada producto en slots fijos
    // /almacenes/{alm1..alm6} — ver firebase.js. Subir este número
    // más allá de 6 requeriría agregar más slots ahí también, no
    // alcanza con cambiar solo este archivo.
    maxAlmacenes: 6,
    almacenesEditable: true,
    almacenesEliminables: true,
    logoPersonalizable: true,
    notificaciones: true,
    campoCosto: true,
    campoPrecioMayor: true,
    compartirImagen: true,
    foro: true,
    pedidosDisponible: true,
    panelAvanzado: true,
  },
};

const PLAN_ETIQUETAS = { basico: 'Básico', medio: 'Medio', premium: 'Premium' };

function planActual() {
  if (typeof currentTiendaPlan === 'string' && PLAN_LIMITES[currentTiendaPlan]) {
    return currentTiendaPlan;
  }
  return 'basico';
}

function limitePlan(clave) {
  return PLAN_LIMITES[planActual()][clave];
}

function nombrePlan(plan) {
  return PLAN_ETIQUETAS[plan || planActual()] || 'Básico';
}
