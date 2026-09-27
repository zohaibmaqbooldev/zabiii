/** Client-side image validation + optimisation (resize, WebP) before upload. */

export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];
export const ACCEPT_ATTR = ACCEPTED_TYPES.join(',');
export const MAX_INPUT_BYTES = 10 * 1024 * 1024; // what the admin may pick; output is far smaller

export type ImageKind = 'project' | 'profile' | 'logo' | 'certificate' | 'media';

const SIZES: Record<ImageKind, { lg: number; sm: number }> = {
  project: { lg: 1600, sm: 800 },
  profile: { lg: 1100, sm: 560 },
  logo: { lg: 800, sm: 320 },
  certificate: { lg: 1400, sm: 700 },
  media: { lg: 1600, sm: 800 },
};

export function validateImage(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return 'Please choose a JPG, PNG, WebP, AVIF or GIF image.';
  if (file.size > MAX_INPUT_BYTES) return `That image is ${(file.size / 1048576).toFixed(1)} MB — the limit is 10 MB.`;
  if (file.size < 100) return 'That file looks empty or damaged.';
  return null;
}

async function decode(file: File): Promise<{ img: CanvasImageSource; w: number; h: number; close: () => void }> {
  if ('createImageBitmap' in window) {
    try {
      const bmp = await createImageBitmap(file);
      return { img: bmp, w: bmp.width, h: bmp.height, close: () => bmp.close() };
    } catch {
      /* fall back to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  try {
    await img.decode();
  } catch {
    URL.revokeObjectURL(url);
    throw new Error('This image could not be read. Try exporting it again as JPG or PNG.');
  }
  return { img, w: img.naturalWidth, h: img.naturalHeight, close: () => URL.revokeObjectURL(url) };
}

function toBlob(canvas: HTMLCanvasElement, type: string, q: number) {
  return new Promise<Blob | null>((r) => canvas.toBlob(r, type, q));
}

async function render(src: CanvasImageSource, w: number, h: number, maxW: number) {
  const scale = Math.min(1, maxW / w);
  const cw = Math.max(1, Math.round(w * scale));
  const ch = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser could not process this image.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, cw, ch);
  let blob = await toBlob(canvas, 'image/webp', 0.82);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', 0.85); // very old Safari
  if (!blob) throw new Error('Your browser could not process this image.');
  return blob;
}

export async function processImage(file: File, kind: ImageKind) {
  const err = validateImage(file);
  if (err) throw new Error(err);
  // GIFs keep their animation: upload as-is
  if (file.type === 'image/gif') return { large: file as Blob, small: file as Blob, ext: 'gif' };
  const { img, w, h, close } = await decode(file);
  try {
    const { lg, sm } = SIZES[kind];
    const large = await render(img, w, h, lg);
    const small = await render(img, w, h, sm);
    return { large, small, ext: large.type === 'image/webp' ? 'webp' : 'jpg' };
  } finally {
    close();
  }
}
