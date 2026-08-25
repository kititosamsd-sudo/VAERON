// =========================================================
// Adonay — Subida de imágenes de catálogo (Cloudinary)
// =========================================================
// Las fotos de producto NO se guardan en Firebase — Firebase solo
// guarda la URL que devuelve Cloudinary. Se eligió Cloudinary y no
// Firebase Storage porque Storage exige el plan de pago (Blaze) con
// tarjeta vinculada desde feb-2026, incluso para quedarse dentro de
// lo gratis. Cloudinary tiene un plan gratis permanente sin tarjeta
// (~5GB guardados + 10GB de descarga al mes — ver conversación del
// 19 ago 2026), suficiente para cientos de tiendas con miles de
// fotos cada una.
//
// ── CONFIGURACIÓN (hacer esto UNA vez) ──────────────────────────
//   1) Crea una cuenta gratis en https://cloudinary.com (no pide
//      tarjeta).
//   2) cloudName: aparece en el Dashboard, arriba a la izquierda
//      ("Cloud name").
//   3) uploadPreset: Settings → Upload → Upload presets →
//      "Add upload preset" → Signing Mode = "Unsigned" → Save.
//      Copia el nombre que le pongas acá abajo.
//      Tiene que ser "Unsigned": la imagen se sube directo desde el
//      navegador de cada tienda, sin pasar por un servidor propio
//      (como no hay backend propio para Adonay todavía, un preset
//      "Signed" no funcionaría sin uno).
const CLOUDINARY_CONFIG = {
  cloudName: 'usob9n75',
  uploadPreset: 'vaeron-productos'
};

function cloudinaryConfigured() {
  return CLOUDINARY_CONFIG.cloudName !== 'TU_CLOUD_NAME'
      && CLOUDINARY_CONFIG.uploadPreset !== 'TU_UPLOAD_PRESET';
}

// Sube un Blob ya comprimido (ver previewProductImage en stock.js) y
// devuelve la URL pública de la imagen subida. "folder" solo ordena
// las fotos dentro del panel de Cloudinary (ej. por tienda) — no
// cambia nada para la app.
async function uploadImageToCloudinary(blob, folder) {
  if (!cloudinaryConfigured()) {
    throw new Error('Cloudinary no está configurado todavía (ver cloudinary.js).');
  }
  const formData = new FormData();
  formData.append('file', blob);
  formData.append('upload_preset', CLOUDINARY_CONFIG.uploadPreset);
  if (folder) formData.append('folder', folder);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CONFIG.cloudName}/image/upload`, {
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