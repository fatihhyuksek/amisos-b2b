// Yalnızca geliştirme: demo verisi (son 14 ay). Ayrıntı ve işaretleme kuralları: demo-lib.ts.
// Kullanım: npm run db:demo            (önceki demo verisini siler, yeniden üretir; tek transaction)
//           npm run db:demo -- --clear (yalnızca demo verisini siler)
//           --force: DATABASE_URL yerel (localhost/127.0.0.1/db) değilse gerekli.
import { drizzle } from 'drizzle-orm/node-postgres';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import * as schema from '../database/schema.js';
import { hasDemoData, runDemo } from './demo-lib.js';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', 'db']);

async function main(): Promise<void> {
  try {
    process.loadEnvFile('.env');
  } catch {
    // .env yoksa ortam değişkenleri kullanılır.
  }
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('db:demo yalnızca NODE_ENV=development iken çalışır. backend/.env dosyasını kontrol edin.');
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL bulunamadı. backend klasöründe .env.example dosyasını .env olarak kopyalayın.');
  }
  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host) && !process.argv.includes('--force')) {
    throw new Error(`DATABASE_URL yerel değil (${host}). Uzak veritabanına demo verisi yazmak için --force verin.`);
  }
  const pool = new pg.Pool({ connectionString: url });
  try {
    const db = drizzle(pool, { schema, casing: 'snake_case' });
    // dist/cli/demo-data.js -> backend/demo-assets
    const assetsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'demo-assets');
    const mediaDir = process.env.MEDIA_DIR?.trim() || 'storage/media';
    // --if-empty: demo verisi zaten varsa dokunmadan çıkar (baslat.cmd her açılışta böyle çağırır).
    if (process.argv.includes('--if-empty') && (await hasDemoData(db))) {
      console.log('Demo verisi zaten yüklü; atlandı. Yeniden üretmek için: npm run db:demo');
      return;
    }
    const message = await runDemo(db, { clearOnly: process.argv.includes('--clear'), mediaDir, assetsDir });
    console.log(message ?? 'Demo verisi silindi.');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
