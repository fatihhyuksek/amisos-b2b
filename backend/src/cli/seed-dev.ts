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

const DEV_GROUPS = ['Bardak', 'Tabak', 'Mutfak Gereçleri'];
const DEV_PRODUCTS = [
  { group: 'Bardak', barcode: '8690000000017', code: 'DEV-BRD-1', name: "Çay Bardağı 6'lı", description: 'Geliştirme örneği.', caseQuantity: 12, listPrice: '48.90', stock: 'in_stock' as const },
  { group: 'Bardak', barcode: '8690000000024', code: 'DEV-BRD-2', name: "Su Bardağı 6'lı", description: null, caseQuantity: 8, listPrice: '39.50', stock: 'out_of_stock' as const },
  { group: 'Tabak', barcode: '8690000000031', code: 'DEV-TBK-1', name: 'Yemek Tabağı 24 cm', description: 'Geliştirme örneği.', caseQuantity: 6, listPrice: '19.99', stock: 'in_stock' as const },
  { group: 'Mutfak Gereçleri', barcode: '8690000000048', code: null, name: 'Süzgeç Paslanmaz', description: null, caseQuantity: 1, listPrice: '129.00', stock: 'in_stock' as const },
];

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

    // Örnek grup ve ürünler (görselsiz); tekrar çalıştırılabilir: var olanlara dokunulmaz.
    const groupIds = new Map<string, string>();
    for (const [index, name] of DEV_GROUPS.entries()) {
      const key = companyTitleKey(name);
      await db
        .insert(schema.productGroups)
        .values({ name, nameKey: key, sortOrder: index })
        .onConflictDoNothing();
      const [group] = await db
        .select({ id: schema.productGroups.id })
        .from(schema.productGroups)
        .where(sql`${schema.productGroups.nameKey} = ${key}`);
      groupIds.set(name, group.id);
    }
    await db
      .insert(schema.products)
      .values(
        DEV_PRODUCTS.map((p) => ({
          groupId: groupIds.get(p.group)!,
          barcode: p.barcode,
          code: p.code,
          name: p.name,
          description: p.description,
          caseQuantity: p.caseQuantity,
          listPrice: p.listPrice,
          vatRate: '20.00',
          stockStatus: p.stock,
          stockUpdatedAt: new Date(),
        })),
      )
      .onConflictDoNothing();

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
