// =========================================================
// VAERON — Subida de imágenes de catálogo (Cloudinary, multi-cuenta)
// =========================================================
// Las fotos de producto NO se guardan en Firebase — Firebase solo
// guarda la URL que devuelve Cloudinary. Se eligió Cloudinary y no
// Firebase Storage porque Storage exige el plan de pago (Blaze) con
// tarjeta vinculada desde feb-2026, incluso para quedarse dentro de
// lo gratis. Cloudinary tiene un plan gratis permanente sin tarjeta.
//
// Desde que el sistema reparte tiendas entre varios proyectos
// Firebase (ver firebase-projects.js), las fotos se reparten igual
// entre varias cuentas Cloudinary — una por proyecto, 4 tiendas por
// cuenta — para que ninguna cuenta gratis se quede corta si una sola
// tienda llega al peor caso de 3000 fotos de producto. Ver
// cloudinary-accounts.js para dar de alta cada cuenta nueva y para
// el razonamiento completo de cuántas tiendas aguanta cada una.

// Cuenta Cloudinary que le toca a ESTA sesión del navegador, según
// en qué proyecto Firebase inició sesión (proyectoActivo, definido
// en firebase.js — se carga antes que este archivo, ver app.html).
// No hace falta guardar ninguna asignación nueva por tienda: el
// proyecto Firebase de la tienda ya decide, de una, qué cuenta
// Cloudinary usa.
function cuentaCloudinariaActual() {
  const proyecto = typeof proyectoActivo !== 'undefined' ? proyectoActivo : null;
  return cuentaCloudinariaDeProyecto(proyecto);
}

// "Configurada" = ni el cloudName ni el uploadPreset se quedaron con
// el valor de relleno (TU_CLOUD_NAME_B, TU_UPLOAD_PRESET_C, etc. —
// ver cloudinary-accounts.js). Se revisa por prefijo, no por un
// único valor fijo, porque cada grupo placeholder tiene su propio
// sufijo de letra (_B, _C, _D...).
function cloudinaryConfigured() {
  const cuenta = cuentaCloudinariaActual();
  return !!cuenta
      && !/^TU_CLOUD_NAME/.test(cuenta.cloudName)
      && !/^TU_UPLOAD_PRESET/.test(cuenta.uploadPreset);
}

// Sube un Blob ya comprimido (ver previewProductImage en stock.js) y
// devuelve la URL pública de la imagen subida. "folder" solo ordena
// las fotos dentro del panel de Cloudinary (ej. por tienda) — no
// cambia nada para la app.
async function uploadImageToCloudinary(blob, folder) {
  const cuenta = cuentaCloudinariaActual();
  if (!cloudinaryConfigured()) {
    throw new Error(
      'Cloudinary no está configurado todavía para este proyecto ' +
      '(ver cloudinary-accounts.js).'
    );
  }
  const formData = new FormData();
  formData.append('file', blob);
  formData.append('upload_preset', cuenta.uploadPreset);
  if (folder) formData.append('folder', folder);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cuenta.cloudName}/image/upload`, {
    method: 'POST',
    body: formData
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error((err && err.error && err.error.message) || 'No se pudo subir la imagen a Cloudinary.');
  }
  const data = await res.json();
  return data.secure_url;
}
