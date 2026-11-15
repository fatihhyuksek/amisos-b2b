// Demo verisi güvenliği (db:demo). Yalnızca kesin işaretli demo kayıtları silinir; gerçek kayıtlarla çakışmada
// hiçbir şey yazılmadan durur. Test veritabanında çalışır.
import { eq, like } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { DemoDataError, runDemo, type Db } from '../src/cli/demo-lib.js';
import * as schema from '../src/database/schema.js';

describe('db:demo güvenliği (e2e)', () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const db: Db = drizzle(pool, { schema, casing: 'snake_case' });
  const suffix = Math.random().toString(36).slice(2, 8);
  let realGroupId: string;
  let lookalikeGroupId: string;
  let highSortGroupId: string;

  const counts = async () => ({
    orders: (await db.select().from(schema.orders)).length,
    demoDealers: (await db.select().from(schema.dealers).where(like(schema.dealers.email, '%@demo.amisos.local'))).length,
    demoProducts: (await db.select().from(schema.products).where(like(schema.products.code, 'DEMO-%'))).length,
  });
  const realProduct = async (barcode: string, code: string) => {
    const [p] = await db
      .insert(schema.products)
      .values({ groupId: realGroupId, barcode, code, name: `Gerçek ürün ${suffix}`, caseQuantity: 1, listPrice: '10.00', vatRate: '20.00' })
      .returning();
    return p;
  };

  beforeAll(async () => {
    await runDemo(db, { clearOnly: true });
    // Gerçek kayıtlar: boş bir grup (sıra 0), "demo" ile biten anahtarlı ama sırası düşük bir grup, sırası yüksek ama anahtarı demo olmayan grup.
    const insertGroup = async (name: string, nameKey: string, sortOrder: number) =>
      (await db.insert(schema.productGroups).values({ name, nameKey, sortOrder }).returning())[0].id;
    realGroupId = await insertGroup(`Gerçek boş grup ${suffix}`, `gercek bos grup ${suffix}`, 0);
    lookalikeGroupId = await insertGroup(`Benzer ${suffix}`, `benzer ${suffix} demo`, 5);
    highSortGroupId = await insertGroup(`Yüksek sıra ${suffix}`, `yuksek sira ${suffix}`, 9500);
  });

  afterAll(async () => {
    await db.delete(schema.products).where(eq(schema.products.groupId, realGroupId));
    for (const id of [realGroupId, lookalikeGroupId, highSortGroupId]) {
      await db.delete(schema.productGroups).where(eq(schema.productGroups.id, id));
    }
    await runDemo(db, { clearOnly: true });
    await pool.end();
  });

  it('--clear: aynı barkod önekli gerçek ürün (kodu DEMO- değil) ve gerçek boş gruplar kalır', async () => {
    const real = await realProduct('8699901111111', `REAL-${suffix}`);
    await runDemo(db, { clearOnly: true });
    expect((await db.select().from(schema.products).where(eq(schema.products.id, real.id))).length).toBe(1);
    for (const id of [realGroupId, lookalikeGroupId, highSortGroupId]) {
      expect((await db.select().from(schema.productGroups).where(eq(schema.productGroups.id, id))).length).toBe(1);
    }
  });

  it('gerçek bir ürün demo barkod önekiyle çakışıyorsa açık hatayla durur ve hiçbir şey yazılmaz', async () => {
    const before = await counts();
    await expect(runDemo(db)).rejects.toThrow(DemoDataError);
    await expect(runDemo(db)).rejects.toThrow(/çakışıyor/);
    expect(await counts()).toEqual(before);
    expect(before.demoDealers).toBe(0);
  });

  it('çakışma yokken üretir (8 bayi, 25 ürün, 210 sipariş); tekrar çalıştırılabilir; --clear yalnızca demo kayıtlarını siler', async () => {
    await db.delete(schema.products).where(like(schema.products.code, `REAL-${suffix}`));
    const first = await runDemo(db);
    expect(first).toMatch(/8 bayi, 25 ürün, 210 sipariş/);
    const once = await counts();
    expect(once).toMatchObject({ demoDealers: 8, demoProducts: 25 });
    await runDemo(db);
    const twice = await counts();
    expect(twice.demoDealers).toBe(8);
    expect(twice.demoProducts).toBe(25);
    expect(twice.orders).toBe(once.orders);

    await runDemo(db, { clearOnly: true });
    expect(await counts()).toMatchObject({ demoDealers: 0, demoProducts: 0 });
    for (const id of [realGroupId, lookalikeGroupId, highSortGroupId]) {
      expect((await db.select().from(schema.productGroups).where(eq(schema.productGroups.id, id))).length).toBe(1);
    }
  });
});
