// Shrinks an answer photo on the phone before it is uploaded (plan section 5: about 300 KB each, so the free 1 GB
// of storage lasts). Runs in the browser only. fitSize and nextStep are pure so they can be tested.

export const MAX_EDGE = 1800; // handwriting stays readable at this size
export const TARGET_BYTES = 350_000;
const QUALITIES = [0.8, 0.7, 0.6, 0.5];
const MAX_SHRINKS = 3;

// The size that fits inside a square of maxEdge, never enlarging.
export function fitSize(width: number, height: number, maxEdge = MAX_EDGE) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

// Which quality to try after a result that was still too big. Lower quality first, then a smaller picture.
export function nextStep(state: { quality: number; scale: number }): { quality: number; scale: number } | null {
  const i = QUALITIES.indexOf(state.quality);
  if (i >= 0 && i < QUALITIES.length - 1) return { quality: QUALITIES[i + 1], scale: state.scale };
  const shrunk = Math.round(state.scale * 0.8 * 100) / 100;
  if (state.scale <= Math.pow(0.8, MAX_SHRINKS) + 0.001) return null;
  return { quality: QUALITIES[1], scale: shrunk };
}

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      // "from-image" applies the phone's rotation so a portrait photo is not sideways.
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch {
      // fall through to the image element
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error("That file is not a photo this browser can open.");
  }
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not compress the photo."))), "image/jpeg", quality);
  });
}

export async function compressPhoto(file: File): Promise<Blob> {
  const img = await decode(file);
  try {
    const base = fitSize(img.width, img.height);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser cannot compress photos.");

    let step: { quality: number; scale: number } | null = { quality: QUALITIES[0], scale: 1 };
    let best: Blob | null = null;
    while (step) {
      canvas.width = Math.max(1, Math.round(base.width * step.scale));
      canvas.height = Math.max(1, Math.round(base.height * step.scale));
      ctx.fillStyle = "#fff"; // JPEG has no transparency
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img.source, 0, 0, canvas.width, canvas.height);
      best = await toBlob(canvas, step.quality);
      if (best.size <= TARGET_BYTES) break;
      step = nextStep(step);
    }
    if (!best) throw new Error("Could not compress the photo.");
    return best;
  } finally {
    img.close();
  }
}
