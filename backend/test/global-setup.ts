import { fileURLToPath } from 'node:url';
// E2E testlerinden önce test veritabanını (yoksa) oluşturur ve migration'ları uygular.
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { adminDatabaseUrl, databaseName, resolveTestDatabaseUrl } from './test-database.js';

async function ensureDatabase(url: string): Promise<void> {
  const probe = new pg.Pool({ connectionString: url, max: 1 });
  try {
    await probe.query('select 1');
    return;
  } catch (error) {
    if ((error as { code?: string }).code !== '3D000') throw error; // yalnızca "veritabanı yok"
  } finally {
    await probe.end();
  }
  const name = databaseName(url); // doğrulanmış: yalnızca harf, rakam, alt çizgi
  const admin = new pg.Pool({ connectionString: adminDatabaseUrl(url), max: 1 });
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
  } catch (error) {
    if ((error as { code?: string }).code === '42501') {
      throw new Error(
        `Test veritabanı "${name}" oluşturulamadı. Kullanıcıya CREATEDB yetkisi verin veya veritabanını elle oluşturun.`,
      );
    }
    if ((error as { code?: string }).code !== '42P04') throw error; // eşzamanlı oluşturma
  } finally {
    await admin.end();
  }
}

export default async function setup(): Promise<void> {
  const url = resolveTestDatabaseUrl();
  await ensureDatabase(url);
  const pool = new pg.Pool({ connectionString: url });
  try {
    await migrate(drizzle(pool), {
      migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
    });
  } finally {
    await pool.end();
  }
}
