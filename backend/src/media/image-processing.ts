// Görsel işleme (K-61, K-62). Dosya türü uzantıya/istemci mime'ına değil içeriğe (sharp metadata) göre
// doğrulanır; çıktıda EXIF yönlendirmesi uygulanır ve tüm metadata (konum dahil) atılır.
import sharp from 'sharp';

export const THUMB_SIZE = 400;
export const LARGE_SIZE = 1200;
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_FILES_PER_REQUEST = 50;

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

async function render(input: Buffer, size: number) {
  // `.rotate()` EXIF yönlendirmesini piksellere uygular; sharp varsayılan olarak metadata yazmaz.
  return sharp(input, { failOn: 'error', limitInputPixels: 100_000_000 })
    .rotate()
    .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
}

export async function processImage(input: Buffer): Promise<ProcessedImage> {
  let format: string | undefined;
  try {
    format = (await sharp(input, { limitInputPixels: 100_000_000 }).metadata()).format;
  } catch {
    throw new InvalidImageError('Dosya okunamadı.');
  }
  const mime = format ? ACCEPTED[format] : undefined;
  if (!mime) throw new InvalidImageError('Yalnızca jpeg, png veya webp kabul edilir.');
  try {
    const [large, thumb] = await Promise.all([render(input, LARGE_SIZE), render(input, THUMB_SIZE)]);
    return {
      mime,
      thumb: thumb.data,
      large: large.data,
      width: large.info.width,
      height: large.info.height,
    };
  } catch {
    throw new InvalidImageError('Görsel işlenemedi (bozuk dosya).');
  }
}
