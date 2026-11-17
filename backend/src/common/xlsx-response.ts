// Excel (.xlsx) yanıtı: tek yerde başlıklar (K-46, K-78).
import type { Response } from 'express';

export interface XlsxFile {
  filename: string;
  data: Buffer;
}

export function sendXlsx(res: Response, file: XlsxFile): void {
  res
    .status(200)
    .set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Content-Length': String(file.data.length),
      'Cache-Control': 'no-store',
    })
    .end(file.data);
}
