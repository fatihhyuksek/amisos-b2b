// K-82: herkese açık SEO uçları (express katmanında, `/api` önekinden bağımsız) ve isteğe bağlı vitrin sunumu.
//  - GET /sitemap.xml, GET /robots.txt her zaman.
//  - SERVE_FRONTEND_DIR verilirse: statik dosyalar (uzun önbellek) + diğer GET/HEAD isteklerinde sayfaya özel
//    meta/JSON-LD enjekte edilmiş index.html; eski ürün slug'ında 301.
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { injectHead, renderHead } from './html.js';
import { SeoService } from './seo.service.js';

type Use = { use(...handlers: RequestHandler[]): void; use(path: string, ...handlers: RequestHandler[]): void };

const RESERVED = /^\/(?:api|media)(?:\/|$)/;

export function applyPublicSeo(app: INestApplication, frontendDir: string | undefined): void {
  const seo = app.get(SeoService);
  const server = app.getHttpAdapter().getInstance() as Use & { get(path: string, h: RequestHandler): void };

  const text = (contentType: string, produce: () => Promise<string>): RequestHandler =>
    (_req, res, next) => {
      produce()
        .then((body) => {
          res.status(200).set({ 'Content-Type': contentType, 'Cache-Control': 'public, max-age=600' }).send(body);
        })
        .catch(next);
    };
  server.get('/sitemap.xml', text('application/xml; charset=utf-8', () => seo.sitemap()));
  server.get('/robots.txt', text('text/plain; charset=utf-8', () => seo.robots()));

  if (!frontendDir) return;
  const indexPath = join(frontendDir, 'index.html');
  if (!existsSync(indexPath)) {
    throw new Error(`SERVE_FRONTEND_DIR içinde index.html bulunamadı: ${indexPath}`);
  }

  // Derlenmiş dosyalar içerik özetli adlarla gelir (assets/...): değişmez, uzun önbellek.
  server.use(
    express.static(frontendDir, {
      index: false,
      fallthrough: true,
      setHeaders(res, filePath) {
        if (/[\\/]assets[\\/]/.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        else res.setHeader('Cache-Control', 'public, max-age=3600');
      },
    }),
  );

  let cached: { mtimeMs: number; html: string } | null = null;
  const template = async (): Promise<string> => {
    const mtimeMs = statSync(indexPath).mtimeMs;
    if (!cached || cached.mtimeMs !== mtimeMs) cached = { mtimeMs, html: await readFile(indexPath, 'utf8') };
    return cached.html;
  };

  const page: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || RESERVED.test(req.path)) return next();
    // Uzantılı bir yol (ör. /logo.png) bulunamayan statik dosyadır; vitrin sayfası değil.
    if (extname(req.path) !== '') return next();
    (async () => {
      const result = await seo.resolve(req.path);
      if (result.redirectTo) {
        res.redirect(301, result.redirectTo);
        return;
      }
      const html = injectHead(await template(), renderHead(result.meta));
      res.status(result.status).set({ 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }).send(html);
    })().catch(next);
  };
  server.use(page);
}
