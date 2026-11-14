// Görsel işleme (K-61, K-62). Dosya türü uzantıya/istemci mime'ına değil içeriğe (sharp metadata) göre
// doğrulanır; çıktıda EXIF yönlendirmesi uygulanır ve tüm metadata (konum dahil) atılır.
// Bellek: girdi bir kez çözülür (large), thumb large çıktısından üretilir; dosyalar sırayla işlenir.
import sharp, { type Sharp } from 'sharp';

sharp.concurrency(1);

export const THUMB_SIZE = 400;
export const LARGE_SIZE = 1200;
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_FILES_PER_REQUEST = 20;
export const MAX_INPUT_PIXELS = 40_000_000;

const ACCEPTED: Record<string, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

export class InvalidImageError extends Error {}

export interface ProcessedImage {
  mime: string;
  thumb: Buffer;
  large: Buffer;
  width: number;
  height: number;
}

const resized = (pipeline: Sharp, size: number) =>
  pipeline
    .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });

export async function processImage(input: Buffer): Promise<ProcessedImage> {
  let format: string | undefined;
  try {
    const meta = await sharp(input).metadata(); // yalnızca başlık okunur
    format = meta.format;
    if (ACCEPTED[format ?? ''] && (meta.width ?? 0) * (meta.height ?? 0) > MAX_INPUT_PIXELS) {
      throw new InvalidImageError('Görsel çok büyük (en fazla 40 megapiksel).');
    }
  } catch (error) {
    if (error instanceof InvalidImageError) throw error;
    throw new InvalidImageError('Dosya okunamadı.');
  }
  const mime = format ? ACCEPTED[format] : undefined;
  if (!mime) throw new InvalidImageError('Yalnızca jpeg, png veya webp kabul edilir.');
  try {
    // `.rotate()` EXIF yönlendirmesini piksellere uygular; sharp varsayılan olarak metadata yazmaz.
    const large = await resized(
      sharp(input, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS }).rotate(),
      LARGE_SIZE,
    );
    const thumb = await resized(sharp(large.data), THUMB_SIZE);
    return {
      mime,
      thumb: thumb.data,
      large: large.data,
      width: large.info.width,
      height: large.info.height,
    };
  } catch {
    throw new InvalidImageError('Görsel işlenemedi (bozuk veya çok büyük dosya).');
  }
}
