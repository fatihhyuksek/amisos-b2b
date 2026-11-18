// K-84: olay toplama ucu. Herkese açık; JsonOnlyGuard uygulanmaz çünkü `navigator.sendBeacon` gövdeyi
// `text/plain` gönderir. Karşılığında: yalnızca application/json veya text/plain (415), gövde ≤ 16 KB (413),
// aynı köken kontrolü (SameOriginGuard, Origin/Sec-Fetch-Site), IP başına hız sınırı (429).
// Bot ve Admin oturumu olayları kaydedilmez ama yine 204 döner.
import {
  CanActivate,
  Controller,
  ExecutionContext,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  PayloadTooLargeException,
  Post,
  Req,
  UnsupportedMediaTypeException,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { OptionalAuthGuard, type AuthenticatedRequest } from '../auth/auth.guards.js';
import { SameOriginGuard } from '../auth/same-origin.guard.js';
import type { Env } from '../config/env.js';
import { MAX_BODY_BYTES } from './analytics.constants.js';
import { AnalyticsRecorder, type NewEvent } from './analytics-recorder.service.js';
import { eventsBodySchema, type EventsBody } from './analytics.schemas.js';
import { normalizeSearchQuery, splitPath } from './client-info.js';

/** IP başına sabit pencere (dakika) hız sınırı; bellek içi, süresi dolan kayıtlar temizlenir. */
@Injectable()
export class EventsRateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  private readonly limit: number;

  constructor(@Inject(ConfigService) config: ConfigService<Env, true>) {
    this.limit = config.get('EVENTS_RATE_LIMIT_PER_MINUTE', { infer: true }) ?? 120;
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const now = Date.now();
    if (this.hits.size > 10_000) {
      for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
    }
    const key = req.ip ?? 'unknown';
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + 60_000 });
      return true;
    }
    entry.count += 1;
    if (entry.count > this.limit) {
      throw new HttpException({ statusCode: 429, message: 'Çok fazla istek. Biraz sonra tekrar deneyin.' }, HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }
}

/** text/plain gövdeyi (sendBeacon) en fazla `max` bayt okur. */
function readText(req: Request, max: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > max) {
        reject(new PayloadTooLargeException('Gövde çok büyük.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

@Controller('events')
@UseGuards(SameOriginGuard, EventsRateLimitGuard, OptionalAuthGuard)
export class EventsController {
  constructor(@Inject(AnalyticsRecorder) private readonly recorder: AnalyticsRecorder) {}

  @Post()
  @HttpCode(204)
  async collect(@Req() req: AuthenticatedRequest): Promise<void> {
    const contentType = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();
    if (contentType && contentType !== 'application/json' && contentType !== 'text/plain') {
      throw new UnsupportedMediaTypeException('Yalnızca application/json veya text/plain desteklenir.');
    }
    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) throw new PayloadTooLargeException('Gövde çok büyük.');

    // Bot ve Admin: gövde okunmadan sessizce yok sayılır.
    if (this.recorder.isBot(req) || req.auth?.type === 'admin') {
      if (contentType !== 'application/json') req.resume();
      return;
    }

    let raw: unknown;
    if (contentType === 'application/json') {
      raw = req.body as unknown; // express.json zaten ayrıştırdı (100 KB üstü orada 413)
      if (Buffer.byteLength(JSON.stringify(raw ?? null)) > MAX_BODY_BYTES) throw new PayloadTooLargeException('Gövde çok büyük.');
    } else {
      const text = await readText(req, MAX_BODY_BYTES);
      try {
        raw = JSON.parse(text);
      } catch {
        throw new BadRequestException({ statusCode: 400, code: 'VALIDATION', message: 'Gövde geçerli JSON değil.' });
      }
    }
    const parsed = eventsBodySchema.safeParse(raw);
    if (!parsed.success) {
      const fields: Record<string, string> = {};
      for (const issue of parsed.error.issues) fields[issue.path.join('.') || '_'] ??= issue.message;
      throw new BadRequestException({ statusCode: 400, code: 'VALIDATION', message: 'Girilen bilgiler geçersiz.', fields });
    }
    await this.store(req, parsed.data);
  }

  private async store(req: AuthenticatedRequest, body: EventsBody): Promise<void> {
    const events: NewEvent[] = body.events.map((e) => {
      const { path, utmSource } = splitPath(e.path);
      return {
        type: e.type,
        path,
        utmSource,
        productId: e.productId ?? null,
        groupId: e.groupId ?? null,
        query: e.query ? normalizeSearchQuery(e.query) : null,
        resultCount: e.resultCount ?? null,
        quantity: e.quantity ?? null,
        referrerHost: this.recorder.referrerHost(req, e.referrer),
      };
    });
    const dealerId = req.auth?.type === 'dealer' ? req.auth.id : null;
    await this.recorder.insert(await this.recorder.clientContext(req), { sessionKey: body.sessionKey, dealerId }, events);
  }
}
