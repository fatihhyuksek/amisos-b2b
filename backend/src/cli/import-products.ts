// İlk ürün yüklemesi (K-81): backend/data/urunler-ilk-yukleme.xlsx dosyasını Admin panelindeki "Excel'den yükle" ile
// aynı kurallarla (ProductImportService) içe aktarır. Dosya iş sahibinin BizimHesap stok listesinden üretildi.
// Kullanım: npm run db:urunler                (dosyayı içe aktarır; barkodu eşleşen ürünleri günceller)
//           npm run db:urunler -- --if-empty  (BizimHesap ID'li ürün zaten varsa dokunmaz; baslat.cmd böyle çağırır)
//           npm run db:urunler -- <dosya.xlsx> (başka bir dosya)
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { AuditService } from '../audit/audit.service.js';
import { ProductImportService } from '../catalog/product-import.service.js';
import { systemClock } from '../common/clock.js';
import * as schema from '../database/schema.js';

async function main(): Promise<void> {
  try {
    process.loadEnvFile('.env');
  } catch {
    // .env yoksa ortam değişkenleri kullanılır.
  }
  const url = process.env.DATABASE_URL;
  if (!url)
    throw new Error(
      'DATABASE_URL bulunamadı. backend klasöründe .env.example dosyasını .env olarak kopyalayın.',
    );
  const args = process.argv.slice(2);
  const ifEmpty = args.includes('--if-empty');
  const custom = args.find((a) => !a.startsWith('--'));
  // dist/cli/import-products.js -> backend/data
  const file = custom
    ? path.resolve(custom)
    : path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '..',
        '..',
        'data',
        'urunler-ilk-yukleme.xlsx',
      );

  const pool = new pg.Pool({ connectionString: url });
  try {
    const db = drizzle(pool, { schema, casing: 'snake_case' });
    if (ifEmpty) {
      const existing = await db
        .select({ id: schema.products.id })
        .from(schema.products)
        .where(isNotNull(schema.products.bizimhesapId))
        .limit(1);
      if (existing.length > 0) {
        console.log(
          'Ürünler zaten yüklü; atlandı. Yeniden yüklemek için: npm run db:urunler',
        );
        return;
      }
    }
    const [admin] = await db
      .select({ id: schema.adminUsers.id })
      .from(schema.adminUsers)
      .where(and(eq(schema.adminUsers.isActive, true)))
      .limit(1);
    if (!admin)
      throw new Error(
        'Önce bir Admin hesabı oluşturun (npm run db:seed veya npm run admin:create).',
      );

    const service = new ProductImportService(
      db,
      systemClock,
      new AuditService(db),
    );
    const report = await service.import(
      await readFile(file),
      path.basename(file),
      false,
      admin.id,
    );
    if (report.errors.length > 0) {
      console.error(
        `Ürünler yüklenemedi (${report.errors.length} hata; hiçbir değişiklik yapılmadı):`,
      );
      for (const e of report.errors.slice(0, 20))
        console.error(`  ${JSON.stringify(e)}`);
      process.exitCode = 1;
      return;
    }
    // İlk yükleme: ürünler katalogda zaten var olan ürünlerdir, "Yeni" rozeti (son 30 gün) hepsine düşmesin diye
    // bu çalıştırmada oluşturulanların eklenme tarihi 60 gün geriye alınır.
    if (report.created > 0) {
      await db.execute(
        sql`update products set created_at = now() - interval '60 days' where bizimhesap_id is not null and created_at > now() - interval '1 hour'`,
      );
    }
    // Eski deneme verisinden pasif kalmış, aynı adlı bir gruba düşen ürünler görünsün diye bu grupları açar.
    await db
      .update(schema.productGroups)
      .set({ isActive: true })
      .where(
        and(
          eq(schema.productGroups.isActive, false),
          sql`exists (select 1 from products p where p.group_id = ${schema.productGroups.id} and p.is_active and p.bizimhesap_id is not null)`,
        ),
      );
    console.log(
      `Ürünler yüklendi: ${report.created} yeni, ${report.updated} güncellendi, ${report.unchanged} değişmedi` +
        (report.groupsCreated.length
          ? `; yeni gruplar: ${report.groupsCreated.join(', ')}`
          : '') +
        '.',
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
