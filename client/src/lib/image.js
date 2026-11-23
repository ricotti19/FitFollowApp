/**
 * Conflict 2 (requirements): compress photos BEFORE upload, maximum width ~1080 px.
 * The server re-compresses and strips metadata again, so this is about saving the user's data and time.
 * Falls back to the original file if the browser can't decode it (the server will then decide).
 */
export async function compressImage(file, maxWidth = 1080, quality = 0.82) {
  try {
    if (!file.type.startsWith('image/')) return file;
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxWidth / bmp.width);
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}