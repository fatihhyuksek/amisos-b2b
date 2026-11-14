// Yalnızca geliştirme ortamı için geçici hesaplar oluşturur (ya da şifrelerini sıfırlar).
// Kullanım: npm run db:seed
// Production'da (NODE_ENV development/test değilse) çalışmayı reddeder.
import { hash } from '@node-rs/argon2';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../database/schema.js';
import { companyTitleKey } from '../dealers/company-title.js';

export const DEV_ADMIN = {
  email: 'admin@amisos.local',
  password: 'Admin1234',
  name: 'Geçici Admin',
};
export const DEV_DEALER = { email: 'bayi@amisos.local', password: 'Bayi1234' };

async function main(): Promise<void> {
  try {
    process.loadEnvFile('.env');
  } catch {
    // .env yoksa ortam değişkenleri kullanılır.
  }
  const env = process.env.NODE_ENV;
  if (env !== 'development' && env !== 'test') {
    throw new Error(
      'db:seed yalnızca NODE_ENV=development veya test iken çalışır. backend/.env dosyasını kontrol edin.',
    );
  }
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL bulunamadı. backend klasöründe .env.example dosyasını .env olarak kopyalayın.',
    );
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const db = drizzle(pool, { schema, casing: 'snake_case' });

    const adminHash = await hash(DEV_ADMIN.password);
    const admins = await db
      .select({ id: schema.adminUsers.id })
      .from(schema.adminUsers)
      .where(sql`lower(${schema.adminUsers.email}) = ${DEV_ADMIN.email}`);
    if (admins.length > 0) {
      await db
        .update(schema.adminUsers)
        .set({ passwordHash: adminHash, isActive: true })
        .where(sql`${schema.adminUsers.id} = ${admins[0].id}`);
    } else {
      await db.insert(schema.adminUsers).values({
        email: DEV_ADMIN.email,
        fullName: DEV_ADMIN.name,
        passwordHash: adminHash,
      });
    }

    const existing = await db
      .select({ id: schema.dealers.id })
      .from(schema.dealers)
      .where(
        sql`lower(${schema.dealers.email}) = ${DEV_DEALER.email} AND ${schema.dealers.status} <> 'rejected'`,
      );
    const dealerHash = await hash(DEV_DEALER.password);
    if (existing.length > 0) {
      await db
        .update(schema.dealers)
        .set({ passwordHash: dealerHash, status: 'active' })
        .where(sql`${schema.dealers.id} = ${existing[0].id}`);
    } else {
      await db.insert(schema.dealers).values({
        companyTitle: 'Deneme Züccaciye (geliştirme)',
        companyTitleKey: companyTitleKey('Deneme Züccaciye (geliştirme)'),
        contactName: 'Deneme Bayi',
        email: DEV_DEALER.email,
        phone: '05000000000',
        city: 'İstanbul',
        district: 'Kadıköy',
        address: 'Deneme adresi',
        source: 'invitation',
        status: 'active',
        passwordHash: dealerHash,
        emailVerifiedAt: new Date(),
      });
    }

    console.log('Geliştirme hesapları hazır:');
    console.log(
      `  Admin  (http://localhost:5180/#/yonetim/giris): ${DEV_ADMIN.email} / ${DEV_ADMIN.password}`,
    );
    console.log(
      `  Bayi   (http://localhost:5180/#/giris):         ${DEV_DEALER.email} / ${DEV_DEALER.password}`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
