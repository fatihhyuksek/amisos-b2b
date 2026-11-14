// Veri modeli kısıtları: veritabanı, uygulama kodu atlansa bile temel iş kurallarını korur.
// Her test kendi işleminde (transaction) çalışır ve geri alınır.
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../src/database/schema.js';

type Db = NodePgDatabase<typeof schema>;

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let client: pg.PoolClient;
let db: Db;

beforeEach(async () => {
  client = await pool.connect();
  await client.query('BEGIN');
  db = drizzle(client, { schema, casing: 'snake_case' });
});

afterEach(async () => {
  await client.query('ROLLBACK');
  client.release();
});

afterAll(async () => {
  await pool.end();
});

/** Hatanın Postgres kısıt adını döndürür. */
async function violation(fn: () => Promise<unknown>): Promise<string | undefined> {
  await client.query('SAVEPOINT sp');
  try {
    await fn();
    return undefined;
  } catch (err) {
    const cause = (err as { cause?: { constraint?: string } }).cause;
    return cause?.constraint ?? (err as { constraint?: string }).constraint ?? 'unknown';
  } finally {
    await client.query('ROLLBACK TO SAVEPOINT sp');
  }
}

const dealerInput = (over: Partial<typeof schema.dealers.$inferInsert> = {}) => ({
  companyTitle: 'Örnek Züccaciye Ltd.',
  companyTitleKey: 'örnek züccaciye ltd.',
  contactName: 'Ayşe Yılmaz',
  email: 'ayse@ornek.com',
  phone: '5320000000',
  city: 'İstanbul',
  district: 'Kadıköy',
  address: 'Örnek Mah. No:1',
  source: 'application' as const,
  ...over,
});

async function seedProduct(over: Partial<typeof schema.products.$inferInsert> = {}) {
  const [group] = await db
    .insert(schema.productGroups)
    .values({ name: `Mutfak ${Math.random()}` })
    .returning();
  const [product] = await db
    .insert(schema.products)
    .values({
      groupId: group.id,
      barcode: `869${Math.floor(Math.random() * 1e10)}`,
      name: 'Çay bardağı',
      caseQuantity: 12,
      listPrice: '19.99',
      vatRate: '20',
      ...over,
    })
    .returning();
  return { group, product };
}

const orderTotals = {
  grossTotal: '240.00',
  discountTotal: '0.00',
  netTotal: '240.00',
  vatTotal: '48.00',
  grandTotal: '288.00',
};

describe('Bayi', () => {
  it('GR-BAYI-004: aynı e-postayla ikinci başvuru reddedilir (büyük/küçük harf duyarsız)', async () => {
    await db.insert(schema.dealers).values(dealerInput());
    expect(
      await violation(() =>
        db.insert(schema.dealers).values(dealerInput({ companyTitle: 'Başka', email: 'AYSE@ornek.com' })),
      ),
    ).toBe('dealers_email_uq');
  });

  it('GR-BAYI-004: aynı firma unvanıyla ikinci başvuru reddedilir', async () => {
    await db.insert(schema.dealers).values(dealerInput());
    expect(
      await violation(() =>
        db
          .insert(schema.dealers)
          .values(dealerInput({ email: 'baska@ornek.com', companyTitle: 'örnek züccaciye ltd.', companyTitleKey: 'örnek züccaciye ltd.' })),
      ),
    ).toBe('dealers_company_title_key_uq');
  });

  it('K-51: reddedilen bayi aynı e-posta ve unvanla yeniden başvurabilir', async () => {
    await db
      .insert(schema.dealers)
      .values(dealerInput({ status: 'rejected', rejectionReason: 'Eksik bilgi' }));
    const [again] = await db.insert(schema.dealers).values(dealerInput()).returning();
    expect(again.status).toBe('pending_email');
    // Aktif/bekleyen bir kayıt varken ikinci başvuru yine engellenir.
    expect(
      await violation(() => db.insert(schema.dealers).values(dealerInput({ companyTitle: 'Farklı', companyTitleKey: 'farklı' }))),
    ).toBe('dealers_email_uq');
  });

  it('yeni başvuru e-posta doğrulaması bekler (K-03)', async () => {
    const [dealer] = await db.insert(schema.dealers).values(dealerInput()).returning();
    expect(dealer.status).toBe('pending_email');
  });

  it('GR-BAYI-002: red gerekçesiz kaydedilemez', async () => {
    expect(
      await violation(() => db.insert(schema.dealers).values(dealerInput({ status: 'rejected' }))),
    ).toBe('dealers_rejection_has_reason');
  });

  it('K-12: iskonto oranı 0 ile 100 arasında olmalı', async () => {
    expect(
      await violation(() =>
        db.insert(schema.dealers).values(dealerInput({ generalDiscountPercent: '100' })),
      ),
    ).toBe('dealers_general_discount_range');
  });
});

describe('Ürün', () => {
  it('K-16 / K-30: barkod tekildir', async () => {
    const { product, group } = await seedProduct();
    expect(
      await violation(() =>
        db.insert(schema.products).values({
          groupId: group.id,
          barcode: product.barcode,
          name: 'Kopya',
          listPrice: '1',
          vatRate: '20',
        }),
      ),
    ).toBe('products_barcode_uq');
  });

  it('K-16: boş barkod kaydedilemez', async () => {
    expect(await violation(() => seedProduct({ barcode: '  ' }))).toBe('products_barcode_not_blank');
  });

  it('K-32: koli içi adedi 0 olamaz', async () => {
    expect(await violation(() => seedProduct({ caseQuantity: 0 }))).toBe(
      'products_case_quantity_positive',
    );
  });

  it('K-15: ürün kodu boş olabilir, doluysa tekildir', async () => {
    await seedProduct({ code: null });
    await seedProduct({ code: null });
    await seedProduct({ code: 'ZC-1' });
    expect(await violation(() => seedProduct({ code: 'ZC-1' }))).toBe('products_code_uq');
  });
});

describe('Ön sipariş', () => {
  async function seedOrder(over: Partial<typeof schema.orders.$inferInsert> = {}) {
    const [dealer] = await db.insert(schema.dealers).values(dealerInput()).returning();
    return db
      .insert(schema.orders)
      .values({ dealerId: dealer.id, deliveryMethod: 'pickup', ...orderTotals, ...over })
      .returning();
  }

  it('K-38: ambar ile teslimatta adres, ambar adı ve şubesi zorunlu', async () => {
    expect(
      await violation(() =>
        seedOrder({ deliveryMethod: 'carrier', deliveryAddress: 'Adres', carrierName: 'X Ambarı' }),
      ),
    ).toBe('orders_carrier_requires_address');
  });

  it('K-37: bayi kendisi alır ve tır yüklemesinde adres gerekmez', async () => {
    const [order] = await seedOrder({ deliveryMethod: 'truck' });
    expect(order.status).toBe('submitted');
    expect(order.orderNo).toBeGreaterThanOrEqual(1000);
  });

  it('K-33: toplamlar tutarlı olmalı (net + KDV = genel toplam)', async () => {
    expect(await violation(() => seedOrder({ grandTotal: '287.99' }))).toBe(
      'orders_totals_consistent',
    );
  });

  it('GR-SIP-004: satır adedi koli içi adedinin katı olmalı', async () => {
    const { product } = await seedProduct();
    const [order] = await seedOrder();
    const line = {
      orderId: order.id,
      productId: product.id,
      lineNo: 1,
      barcode: product.barcode,
      productName: product.name,
      caseQuantity: 12,
      unitListPrice: '10.00',
      vatRate: '20',
      grossAmount: '130.00',
      discountAmount: '0.00',
      netAmount: '130.00',
      vatAmount: '26.00',
    };
    expect(await violation(() => db.insert(schema.orderLines).values({ ...line, quantity: 13 }))).toBe(
      'order_lines_case_multiple',
    );
    await db
      .insert(schema.orderLines)
      .values({ ...line, quantity: 24, grossAmount: '240.00', netAmount: '240.00', vatAmount: '48.00' });
  });

  it('GR-SIP-006: Admin kaynaklı durum değişikliği kimin yaptığını içermeli', async () => {
    const [order] = await seedOrder();
    expect(
      await violation(() =>
        db.insert(schema.orderStatusHistory).values({
          orderId: order.id,
          fromStatus: 'submitted',
          toStatus: 'negotiating',
          source: 'admin',
        }),
      ),
    ).toBe('order_status_history_admin_has_user');
  });
});
