import { fileURLToPath } from 'node:url';
// E2E testlerinden önce migration'ları test veritabanına uygular.
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

export default async function setup(): Promise<void> {
  const pool = new pg.Pool({
    connectionString:
      process.env.DATABASE_URL ?? 'postgres://amisos:amisos@localhost:5433/amisos_b2b',
  });
  try {
    await migrate(drizzle(pool), {
      migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
    });
  } finally {
    await pool.end();
  }
}
