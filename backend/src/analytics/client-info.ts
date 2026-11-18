// K-84: istemci bilgisi çıkarımı. Ham User-Agent ve IP hiçbir yerde saklanmaz; yalnızca türetilmiş
// değerler (cihaz sınıfı, bot bayrağı) ve günlük tuzlu özet kullanılır.
import { createHash } from 'node:crypto';

export type Device = 'mobile' | 'tablet' | 'desktop';

const BOT_PATTERN =
  /bot|crawl|spider|preview|headless|slurp|scrapy|lighthouse|pingdom|uptime|monitor|facebookexternalhit|curl\/|wget|python-requests|httpclient|java\/|go-http-client|axios|node-fetch|postman|phantomjs/i;

/** UA boşsa da bot sayılır (tarayıcılar her zaman UA gönderir). */
export function isBotUserAgent(ua: string | undefined): boolean {
  if (!ua || ua.trim() === '') return true;
  return BOT_PATTERN.test(ua);
}

export function deviceOf(ua: string | undefined): Device {
  const s = (ua ?? '').toLowerCase();
  if (/ipad|tablet|playbook|silk|kindle/.test(s) || (/android/.test(s) && !/mobile/.test(s))) return 'tablet';
  if (/mobi|iphone|ipod|android|windows phone/.test(s)) return 'mobile';
  return 'desktop';
}

/** sha256(IP + UA + günlük tuz) ilk 32 hex. Tuz her gün değiştiği için günler arası eşleştirme yapılamaz. */
export function visitorKeyOf(ip: string, ua: string, salt: string): string {
  return createHash('sha256').update(`${ip}\n${ua}\n${salt}`).digest('hex').slice(0, 32);
}

/** Tam URL'den yalnızca host (küçük harf, `www.` atılır); kendi alan adlarımızsa veya geçersizse null. */
export function referrerHostOf(referrer: string | null | undefined, ownHosts: ReadonlySet<string>): string | null {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (!host || host.length > 100 || ownHosts.has(host)) return null;
    return host;
  } catch {
    return null;
  }
}

/**
 * Yol temizliği: sorgu dizesi ve parça atılır (şifre sıfırlama gibi bağlantılarda token olabilir);
 * yalnızca `utm_source` (≤50 karakter) ayrı alınır.
 */
export function splitPath(raw: string): { path: string; utmSource: string | null } {
  const hashAt = raw.indexOf('#');
  const noHash = hashAt === -1 ? raw : raw.slice(0, hashAt);
  const qAt = noHash.indexOf('?');
  const path = (qAt === -1 ? noHash : noHash.slice(0, qAt)) || '/';
  let utmSource: string | null = null;
  if (qAt !== -1) {
    const value = new URLSearchParams(noHash.slice(qAt + 1)).get('utm_source')?.trim().toLowerCase();
    if (value && /^[a-z0-9._-]{1,50}$/.test(value)) utmSource = value;
  }
  return { path, utmSource };
}

/** Arama sorgusu: kırpılmış, boşluklar tekilleştirilmiş, Türkçe küçük harf. */
export function normalizeSearchQuery(q: string): string {
  return q.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr');
}
