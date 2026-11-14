// Multipart (dosya yükleme) yardımcıları: bellek depolama, boyut/sayı sınırları ve net hata kodları.
// multer'ı doğrudan kullanır; sınır aşımı 413 + `code` (TOO_MANY_FILES, FILE_TOO_LARGE), diğerleri 400 VALIDATION.
import {
  BadRequestException,
  createParamDecorator,
  HttpException,
  mixin,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
  type Type,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import multer from 'multer';
import { from, switchMap, type Observable } from 'rxjs';

export interface MultipartOptions {
  maxFileBytes: number;
  maxFiles: number;
}

function mapMulterError(error: unknown): Error {
  const code = (error as { code?: string }).code;
  if (code === 'LIMIT_FILE_COUNT') {
    return new HttpException(
      { statusCode: 413, code: 'TOO_MANY_FILES', message: 'Tek istekte çok fazla dosya gönderildi.' },
      413,
    );
  }
  if (code === 'LIMIT_FILE_SIZE') {
    return new HttpException(
      { statusCode: 413, code: 'FILE_TOO_LARGE', message: 'Dosya izin verilen boyutu aşıyor.' },
      413,
    );
  }
  if (error instanceof Error && typeof code === 'string' && code.startsWith('LIMIT_')) {
    return new BadRequestException({
      statusCode: 400,
      code: 'VALIDATION',
      message: 'Girilen bilgiler geçersiz.',
      fields: { _: 'Yükleme isteği geçersiz.' },
    });
  }
  return error instanceof Error ? error : new Error('Yükleme okunamadı.');
}

/** Dosyaları `req.files` altına bellek olarak okur (alan adından bağımsız; denetleyici alanı seçer). */
export function MultipartInterceptor(options: MultipartOptions): Type<NestInterceptor> {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: options.maxFileBytes, files: options.maxFiles },
  }).any();

  class Mixin implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
      const http = context.switchToHttp();
      const req = http.getRequest<Request>();
      const res = http.getResponse<Response>();
      return from(
        new Promise<void>((resolve, reject) => {
          upload(req, res, (error: unknown) => (error ? reject(mapMulterError(error)) : resolve()));
        }),
      ).pipe(switchMap(() => next.handle()));
    }
  }
  return mixin(Mixin);
}

/** Verilen alan adındaki dosyalar. */
export const UploadedFilesField = createParamDecorator((field: string, ctx: ExecutionContext) => {
  const files = ctx.switchToHttp().getRequest<Request>().files;
  return (Array.isArray(files) ? files : []).filter((f) => f.fieldname === field);
});
