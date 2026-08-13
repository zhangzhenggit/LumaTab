const SAMPLE_SIZE = 32;
const MIN_ALPHA = 24;
const MIN_VISIBLE_PIXELS = 12;

export async function hasVisiblePixels(blob) {
  if (!blob?.size) return false;
  try {
    const bitmap = await createImageBitmap(blob);
    const canvas = new OffscreenCanvas(SAMPLE_SIZE, SAMPLE_SIZE);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.clearRect(0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    context.drawImage(bitmap, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    bitmap.close();
    const pixels = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
    let visible = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > MIN_ALPHA) visible += 1;
    }
    return visible >= MIN_VISIBLE_PIXELS;
  } catch {
    return false;
  }
}
