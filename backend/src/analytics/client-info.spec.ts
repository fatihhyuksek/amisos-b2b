// K-84: istemci bilgisi çıkarımı (bot, cihaz, özet, yol, referrer).
import { deviceOf, isBotUserAgent, normalizeSearchQuery, referrerHostOf, splitPath, visitorKeyOf } from './client-info.js';

describe('isBotUserAgent', () => {
  it('bot, tarayıcı önizleme ve boş UA bot; gerçek tarayıcı değil', () => {
    for (const ua of ['Googlebot/2.1', 'Mozilla/5.0 (compatible; bingbot/2.0)', 'HeadlessChrome/120', 'WhatsApp link preview', 'curl/8.0', 'facebookexternalhit/1.1', '', undefined]) {
      expect(isBotUserAgent(ua), String(ua)).toBe(true);
    }
    expect(isBotUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36')).toBe(false);
    expect(isBotUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148')).toBe(false);
  });
});

describe('deviceOf', () => {
  it('mobil, tablet, masaüstü', () => {
    expect(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148')).toBe('mobile');
    expect(deviceOf('Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/120 Mobile Safari/537.36')).toBe('mobile');
    expect(deviceOf('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('tablet');
    expect(deviceOf('Mozilla/5.0 (Linux; Android 13; SM-X700) Chrome/120 Safari/537.36')).toBe('tablet');
    expect(deviceOf('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120')).toBe('desktop');
  });
});

describe('visitorKeyOf', () => {
  it('32 hex; tuz, IP ve UA değişince değişir; ham değer içermez', () => {
    const a = visitorKeyOf('1.2.3.4', 'UA', 'tuz1');
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(visitorKeyOf('1.2.3.4', 'UA', 'tuz1')).toBe(a);
    expect(visitorKeyOf('1.2.3.4', 'UA', 'tuz2')).not.toBe(a);
    expect(visitorKeyOf('1.2.3.5', 'UA', 'tuz1')).not.toBe(a);
    expect(visitorKeyOf('1.2.3.4', 'UB', 'tuz1')).not.toBe(a);
    expect(a).not.toContain('1.2.3.4');
  });
});

describe('splitPath', () => {
  it('sorgu dizesi ve parça atılır, yalnızca utm_source alınır', () => {
    expect(splitPath('/katalog?q=a&utm_source=Instagram#x')).toEqual({ path: '/katalog', utmSource: 'instagram' });
    expect(splitPath('/sifre-sifirla?token=gizli')).toEqual({ path: '/sifre-sifirla', utmSource: null });
    expect(splitPath('/?utm_source=<script>')).toEqual({ path: '/', utmSource: null });
  });
});

describe('referrerHostOf', () => {
  const own = new Set(['b2b.example.com']);
  it('yalnızca host; kendi alan adı ve geçersiz değer null', () => {
    expect(referrerHostOf('https://www.Google.com/search?q=x', own)).toBe('google.com');
    expect(referrerHostOf('https://b2b.example.com/katalog', own)).toBeNull();
    expect(referrerHostOf('javascript:alert(1)', own)).toBeNull();
    expect(referrerHostOf('bozuk', own)).toBeNull();
    expect(referrerHostOf(undefined, own)).toBeNull();
  });
});

describe('normalizeSearchQuery', () => {
  it('kırpar, boşlukları tekilleştirir, Türkçe küçük harf', () => {
    expect(normalizeSearchQuery('  ÇAY   IŞIK ')).toBe('çay ışık');
  });
});
