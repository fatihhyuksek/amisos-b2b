// Yalnızca geliştirme: gerçekçi örnek analitik olayları (son 30 gün) ki yönetim ekranları boş görünmesin. K-84 – K-86.
// Kullanım: npm run db:analitik-ornek            (önceki örnekleri siler, yeniden üretir)
//           npm run db:analitik-ornek -- --clear (yalnızca örnekleri siler)
// İşaret: örnek olayların `session_key` değeri `sample-` ile başlar; gerçek olaylara dokunulmaz.
// Veri kaynağı: mevcut gerçek ürünler/gruplar, `bayi@amisos.local` bayisi ve onun mevcut siparişleri. Bayi yoksa
// yalnızca anonim ziyaretçi olayları üretilir. Rastgelelik sabit tohumludur (her çalıştırmada aynı dağılım).
import { createHash } from 'node:crypto';
import pg from 'pg';

const DAYS = 30;
const SAMPLE_DEALER_EMAIL = 'bayi@amisos.local';
const DAY_MS = 86_400_000;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'db']);

function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Row {
  at: Date;
  type: string;
  sessionKey: string;
  visitorKey: string;
  dealerId: string | null;
  path: string;
  productId: string | null;
  groupId: string | null;
  query: string | null;
  resultCount: number | null;
  quantity: number | null;
  orderId: string | null;
  referrerHost: string | null;
  device: string;
  utmSource: string | null;
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile('.env');
  } catch {
    // .env yoksa ortam değişkenleri kullanılır.
  }
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('db:analitik-ornek yalnızca NODE_ENV=development iken çalışır. backend/.env dosyasını kontrol edin.');
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL bulunamadı.');
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host) && !process.argv.includes('--force')) {
    throw new Error(`DATABASE_URL yerel değil (${host}). Uzak veritabanı için --force verin.`);
  }

  const pool = new pg.Pool({ connectionString: url });
  try {
    const cleared = await pool.query(`delete from analytics_events where session_key like 'sample-%'`);
    if (process.argv.includes('--clear')) {
      console.log(`${cleared.rowCount ?? 0} örnek analitik olayı silindi.`);
      return;
    }

    const products = (
      await pool.query<{ id: string; name: string; slug: string; group_id: string }>(
        `select p.id, p.name, p.slug, p.group_id from products p join product_groups g on g.id = p.group_id
         where p.is_active and g.is_active order by p.id`,
      )
    ).rows;
    if (products.length === 0) throw new Error('Aktif ürün yok; örnek olay üretilemedi.');
    const groups = (await pool.query<{ id: string; slug: string }>(`select id, slug from product_groups where is_active order by id`)).rows;
    const dealer = (await pool.query<{ id: string }>(`select id from dealers where lower(email) = $1`, [SAMPLE_DEALER_EMAIL])).rows[0];
    const dealerOrders = dealer
      ? (await pool.query<{ id: string; submitted_at: Date }>(
          `select id, submitted_at from orders where dealer_id = $1 and submitted_at > now() - interval '${DAYS} days' order by submitted_at`,
          [dealer.id],
        )).rows
      : [];

    const rand = rng(20261118);
    const pick = <T,>(list: readonly T[]): T => list[Math.floor(rand() * list.length)];
    // Zipf benzeri ağırlık: bazı ürünler çok incelenir.
    const shuffled = [...products].sort((a, b) => createHash('md5').update(a.id).digest('hex').localeCompare(createHash('md5').update(b.id).digest('hex')));
    const weights = shuffled.map((_, i) => 1 / (i + 1) ** 0.9);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    const pickProduct = () => {
      let r = rand() * totalWeight;
      for (let i = 0; i < shuffled.length; i += 1) {
        r -= weights[i];
        if (r <= 0) return shuffled[i];
      }
      return shuffled[0];
    };
    // Arama: ürün adlarından gerçek kelimeler (sonuç sayısı adlardan hesaplanır) + karşılığı olmayan kelimeler.
    const words = [...new Set(products.flatMap((p) => p.name.toLocaleLowerCase('tr').split(/[^a-zçğıöşü0-9]+/).filter((w) => w.length >= 4)))];
    const missing = ['termos', 'fincan seti', 'çaydanlık', 'bardak altlığı', 'kavanoz kapağı', 'süzgeç'];
    const searchTerms = [...Array.from({ length: 24 }, () => pick(words)), ...missing];
    const countFor = (q: string) => products.filter((p) => p.name.toLocaleLowerCase('tr').includes(q)).length;

    const referrers: (string | null)[] = [null, null, null, null, 'google.com', 'google.com', 'google.com', 'instagram.com', 'facebook.com', 'bing.com', 'wa.me'];
    const utm: (string | null)[] = [null, null, null, null, null, null, 'instagram', 'whatsapp', 'google'];
    const devices = ['mobile', 'mobile', 'mobile', 'mobile', 'desktop', 'desktop', 'desktop', 'tablet'];
    const hex = (n: number) => Array.from({ length: n }, () => Math.floor(rand() * 16).toString(16)).join('');

    const rows: Row[] = [];
    const dayStart = (offset: number): number => {
      // İstanbul takvim günü başı (UTC+3 sabit) -> UTC ms
      const now = Date.now() + 3 * 3_600_000;
      return Math.floor(now / DAY_MS) * DAY_MS - 3 * 3_600_000 - offset * DAY_MS;
    };
    const hourAt = (): number => {
      const hours = [9, 10, 10, 11, 11, 12, 13, 14, 14, 15, 16, 17, 19, 20, 20, 21, 21, 22, 23];
      return pick(hours);
    };
    const session = (base: number, dealerId: string | null, visitorKey: string, device: string, dealerFlow: boolean) => {
      const sessionKey = `sample-${hex(24)}`;
      let t = base + (hourAt() * 60 + Math.floor(rand() * 60)) * 60_000 + Math.floor(rand() * 60_000);
      const ref = dealerId ? null : pick(referrers);
      const u = dealerId ? null : pick(utm);
      const push = (partial: Partial<Row> & Pick<Row, 'type' | 'path'>) => {
        rows.push({
          at: new Date(t),
          sessionKey,
          visitorKey,
          dealerId,
          productId: null,
          groupId: null,
          query: null,
          resultCount: null,
          quantity: null,
          orderId: null,
          referrerHost: null,
          device,
          utmSource: null,
          ...partial,
        });
        t += 5_000 + Math.floor(rand() * 90_000);
      };
      push({ type: 'page_view', path: '/', referrerHost: ref, utmSource: u });
      const steps = 1 + Math.floor(rand() * (dealerFlow ? 7 : 5));
      for (let i = 0; i < steps; i += 1) {
        const r = rand();
        if (r < 0.2) {
          const q = pick(searchTerms);
          push({ type: 'page_view', path: '/katalog' });
          push({ type: 'search', path: '/katalog', query: q, resultCount: countFor(q) });
        } else if (r < 0.35) {
          const g = pick(groups);
          push({ type: 'page_view', path: '/katalog', groupId: g.id });
        } else {
          const p = pickProduct();
          push({ type: 'page_view', path: `/urun/${p.slug}`, productId: p.id, groupId: p.group_id });
          push({ type: 'product_view', path: `/urun/${p.slug}`, productId: p.id, groupId: p.group_id });
          if (dealerId && rand() < 0.5) {
            push({ type: 'add_to_cart', path: `/urun/${p.slug}`, productId: p.id, groupId: p.group_id, quantity: pick([6, 12, 12, 24, 36]) });
          }
        }
      }
      return sessionKey;
    };

    for (let offset = DAYS - 1; offset >= 0; offset -= 1) {
      const base = dayStart(offset);
      const weekday = new Date(base + 4 * 3_600_000).getUTCDay();
      const dayFactor = weekday === 0 ? 0.5 : weekday === 6 ? 0.7 : 1;
      const growth = 0.7 + 0.3 * ((DAYS - offset) / DAYS);
      const visitors = Math.round((18 + rand() * 30) * dayFactor * growth);
      for (let v = 0; v < visitors; v += 1) {
        const visitorKey = hex(32);
        const device = pick(devices);
        const sessionCount = rand() < 0.2 ? 2 : 1;
        for (let s = 0; s < sessionCount; s += 1) session(base, null, visitorKey, device, false);
      }
      // Örnek bayi: haftada 3–4 gün giriş, birkaç ürün inceler.
      if (dealer && rand() < 0.5 * dayFactor + 0.2) {
        const visitorKey = hex(32);
        const key = session(base, dealer.id, visitorKey, pick(['desktop', 'desktop', 'mobile']), true);
        const first = rows.filter((r) => r.sessionKey === key)[0];
        rows.push({ ...first, type: 'login', path: '/giris', at: new Date(first.at.getTime() - 20_000), productId: null, groupId: null, referrerHost: null });
      }
    }
    // Mevcut gerçek siparişler: oturumun sonuna bağlanan order_submitted olayı.
    for (const o of dealerOrders) {
      const t = o.submitted_at.getTime();
      const sessionKey = `sample-${hex(24)}`;
      const visitorKey = hex(32);
      const base: Omit<Row, 'at' | 'type' | 'path'> = {
        sessionKey, visitorKey, dealerId: dealer?.id ?? null, productId: null, groupId: null, query: null, resultCount: null,
        quantity: null, orderId: null, referrerHost: null, device: 'desktop', utmSource: null,
      };
      const p = pickProduct();
      rows.push({ ...base, at: new Date(t - 240_000), type: 'page_view', path: '/' });
      rows.push({ ...base, at: new Date(t - 200_000), type: 'product_view', path: `/urun/${p.slug}`, productId: p.id, groupId: p.group_id });
      rows.push({ ...base, at: new Date(t - 150_000), type: 'add_to_cart', path: `/urun/${p.slug}`, productId: p.id, groupId: p.group_id, quantity: 12 });
      rows.push({ ...base, at: new Date(t - 5_000), type: 'page_view', path: '/sepet' });
      rows.push({ ...base, at: new Date(t), type: 'order_submitted', path: '/sepet', orderId: o.id });
    }

    // Gelecekteki olay olmasın; zamana göre sırala ki `id` kronolojik artsın (zaman çizelgesi imleci id'ye göredir).
    const now = Date.now();
    const final = rows.filter((r) => r.at.getTime() <= now).sort((a, b) => a.at.getTime() - b.at.getTime());
    const client = await pool.connect();
    try {
      await client.query('begin');
      for (let i = 0; i < final.length; i += 500) {
        const chunk = final.slice(i, i + 500);
        const values: unknown[] = [];
        const tuples = chunk.map((r, j) => {
          values.push(r.at, r.type, r.sessionKey, r.visitorKey, r.dealerId, r.path, r.productId, r.groupId, r.query, r.resultCount, r.quantity, r.orderId, r.referrerHost, r.device, r.utmSource);
          const o = j * 15;
          return `(${Array.from({ length: 15 }, (_, k) => `$${o + k + 1}`).join(', ')})`;
        });
        await client.query(
          `insert into analytics_events (occurred_at, type, session_key, visitor_key, dealer_id, path, product_id, group_id, query, result_count, quantity, order_id, referrer_host, device, utm_source)
           values ${tuples.join(', ')}`,
          values,
        );
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
    console.log(`${final.length} örnek analitik olayı eklendi (${cleared.rowCount ?? 0} eski örnek silindi). Silmek için: npm run db:analitik-ornek -- --clear`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
