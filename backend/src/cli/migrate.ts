// Veritabanı migration'larını uygular. drizzle-kit'ten farkı: bağlanamazsa sessizce durmaz,
// nedenini ve çözümünü Türkçe yazar ve hata koduyla çıkar (baslat.cmd bunu kontrol eder).
// Kullanım: npm run db:migrate
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

/** drizzle hatayı sarar; asıl pg/ağ hatası `cause` zincirinde. AggregateError için `errors[0]`. */
function rootCause(error: unknown): unknown {
  let current = error;
  for (let i = 0; i < 5; i++) {
    const next =
      (current as { cause?: unknown }).cause ??
      (current as { errors?: unknown[] }).errors?.[0];
    if (!next) break;
    current = next;
  }
  return current;
}

function describe(error: unknown, url: URL): string {
  const root = rootCause(error);
  const code = (root as { code?: string }).code ?? (error as { code?: string }).code;
  const target = `${url.hostname}:${url.port || '5432'}`;
  if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || /timeout/i.test(String(root))) {
    return (
      `Veritabanına bağlanılamadı (${target}).\n` +
      '  - Docker Desktop açık mı? ("Engine running")\n' +
      '  - Proje ana klasöründe: docker compose up -d db\n' +
      '  - docker compose ps çıktısında PORTS sütunu 5433->5432 göstermeli.'
    );
  }
  if (code === '28P01') {
    return `Veritabanı şifresi hatalı (${target}). 5432/5433 portunda başka bir PostgreSQL çalışıyor olabilir.`;
  }
  if (code === '3D000') {
    return `Veritabanı bulunamadı: ${url.pathname.slice(1)} (${target}).`;
  }
  return `Migration başarısız: ${root instanceof Error ? root.message : String(root)}`;
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile('.env');
  } catch {
    // .env yoksa ortam değişkenleri kullanılır.
  }
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL bulunamadı. backend klasöründe .env.example dosyasını .env adıyla kopyalayın.',
    );
  }
  const url = new URL(connectionString);
  const pool = new pg.Pool({ connectionString, connectionTimeoutMillis: 5000 });
  try {
    await migrate(drizzle(pool), {
      // fileURLToPath: Windows sürücü harfi ve Türkçe karakterli yollar için doğru dönüşüm.
      migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
    });
    console.log(`Migration'lar uygulandı (${url.hostname}:${url.port || '5432'}).`);
  } catch (error) {
    throw new Error(describe(error, url));
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
