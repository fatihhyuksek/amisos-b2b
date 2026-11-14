// Yalnızca application/json gövdeler kabul edilir. Form kodlu (urlencoded) gövdeler reddedilir:
// tarayıcı formlarıyla çapraz site istek yapılmasını zorlaştırır (savunma derinliği).
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

@Injectable()
export class JsonOnlyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (
      req.method === 'GET' ||
      req.method === 'HEAD' ||
      req.method === 'OPTIONS'
    )
      return true;
    // Gövdesiz istek (ör. logout) serbest; gövde varsa JSON olmalı.
    const contentType = (req.headers['content-type'] ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (contentType && contentType !== 'application/json') {
      throw new HttpException(
        'Yalnızca application/json desteklenir.',
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );
    }
    return true;
  }
}
