# Adonay — Maqueta / esqueleto

Esta app es el mismo esqueleto usado en el proyecto anterior, reutilizado
para **Adonay**. Estado actual:

## Modo demo (sin Firebase)
No está conectada a ningún proyecto Firebase real todavía. En su lugar,
`mock-sdk.js` simula la base de datos y el login guardando todo en el
navegador (localStorage). Los datos de ejemplo (productos y clientes) se
crean solos la primera vez que se abre la app.

**Cuando tengas el proyecto Firebase real de Adonay:**
1. Borra `mock-sdk.js` y su `<script>` en `index.html` y `login.html`.
2. Vuelve a agregar los 3 `<script>` del SDK real de Firebase (compat) —
   quedó comentado dónde iban, en esos mismos archivos.
3. Pega tu configuración real (`firebaseConfig`) al inicio de `firebase.js`.
4. Reemplaza los datos de ejemplo (`SEED_PRODUCTS` / `SEED_CLIENTS`, también
   en `firebase.js`) por el catálogo y cartera real, o bórralos si vas a
   cargar todo por importación de Excel.

## Multi-cuenta (SaaS): tiendas + súper-admin
Esta maqueta ahora soporta varias tiendas/empresas con cuentas
separadas, más un rol de **súper-admin** (el dueño del sistema, vos)
que no pertenece a ninguna tienda y solo administra la lista de
tiendas.

- **Súper-admin (vos)**: entra con `adonay@gmail.com` / `123456` (se
  crea solo la primera vez, igual que antes). Al entrar ve únicamente
  la pantalla **Tiendas**: lista de tiendas, botón "Nueva tienda"
  (crea el nombre de la tienda + su primer usuario admin con correo y
  contraseña reales), y un botón para **Suspender/Reactivar** cada
  tienda — pensado para cuando una tienda no paga la mensualidad.
- **Cuenta de una tienda (admin/vendedor)**: entra con el correo y
  contraseña que le creaste desde "Nueva tienda". Ve el Catálogo, su
  Configuración y su Perfil — nunca la lista de otras tiendas.
- Si suspendés una tienda, a sus usuarios se les cierra la sesión al
  instante (estén o no con la app abierta) y no pueden volver a
  entrar hasta que la reactives.

**Importante — lo que todavía falta:** el catálogo (productos,
clientes, notas) sigue viviendo en un solo lugar compartido
(`/products`, `/clients`, `/orders`), NO separado por tienda todavía.
Esta capa de cuentas resuelve el login y el panel de administración;
mover el catálogo para que cada tienda tenga el suyo, totalmente
aislado, es el siguiente paso.

## Login de administrador (demo)
- Correo: `adonay@gmail.com`
- Clave: `123456`

Se crea automáticamente la primera vez que se inicia sesión con esas
credenciales — no necesitas configurar nada más para probar la app.

## Qué cambió respecto al esqueleto anterior
- Rediseño visual completo: paleta verde botella + cobre, tipografía
  Sora / JetBrains Mono, fondo de login con degradado animado (sin fotos).
- Se agregó una pantalla nueva de **Dashboard** (resumen general con
  gráficos: ventas de los últimos 7 días, stock por almacén, stock por
  categoría, además de valor de inventario, stock bajo, clientes y
  últimas notas) como pantalla de inicio.
- Se quitaron el logo y las referencias de la empresa anterior.
- Se quitó la conexión real a Firebase (ver arriba).
- **Stock ahora tiene 3 almacenes** (Almacén 1/2/3), cada uno con su propia
  cantidad por producto. Ver detalle abajo.

## Almacenes en Stock
La pantalla de Stock tiene pestañas arriba: "Todos los almacenes" y
Almacén 1/2/3.

- **Todos los almacenes**: se ve el stock TOTAL de cada producto (como
  antes) — es la suma de los 3 almacenes. El botón "Editar" de acá edita
  nombre, precio, descripción y cantidad total igual que siempre.
- **Un almacén específico**: la columna "Stock" muestra solo la cantidad
  de ESE almacén. El botón "Editar" ahí abre un modal chico para ajustar
  solo esa cantidad (no toca nombre/precio). Los botones de la barra
  cambian a **"Importar cantidad"** y **"Exportar"**, y ambos trabajan
  solo sobre el almacén activo:
  - *Importar cantidad*: sube un Excel/CSV con columnas Código y
    Cantidad — SUMA esa cantidad al almacén seleccionado (no crea
    productos nuevos, no toca el precio).
  - *Exportar*: baja un Excel con Código, Nombre y Cantidad de ese
    almacén.

El total (pestaña "Todos") siempre se mantiene igual a la suma de los 3
almacenes — se actualiza solo cada vez que se edita o importa un
almacén específico.

## Optimizaciones internas
- `mock-sdk.js` ya no vuelve a leer y parsear todo el localStorage en
  cada operación — mantiene una copia en memoria y solo la persiste al
  escribir, y solo avisa a las pantallas (Dashboard, Stock, Pedidos...)
  que realmente están escuchando esa parte de los datos que cambiaron
  (antes recorría y recalculaba todos los listeners abiertos con cada
  escritura, sin importar si les correspondía o no).
- El Dashboard ya no vuelve a dibujar los 3 gráficos completos cada vez
  que llega cualquier dato — un cambio de stock solo repinta los
  gráficos de almacén/categoría, y una nota nueva solo repinta el de
  ventas.
- Se quitó una definición duplicada de `escapeHtml()` (había dos
  versiones ligeramente distintas en el proyecto original; una de
  ellas tenía un bug menor con el valor `0` y quedaba tapada en
  silencio por la otra).

## Datos de ejemplo
Los productos y clientes que ves al abrir la app son de ejemplo
(Producto A/B/C..., Cliente de ejemplo 1-4). Bórralos o reemplázalos desde
Stock / Registros de clientes, o edita `SEED_PRODUCTS` / `SEED_CLIENTS` en
`firebase.js` antes de la primera vez que se abra la app en un dispositivo.
