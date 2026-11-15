// Raporlar (e2e). API: docs/api/rapor-api.md. Gereksinimler: GR-RAP-001…003, K-46 – K-50.
// Sabit saat (2030-06-15 12:00 İstanbul; çerezlerin süresi gerçek saatte dolmasın diye gelecekte) ve sabit veri: her ucun sayıları birebir doğrulanır.
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { inArray } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { hash } from '@node-rs/argon2';
import { AppModule } from '../src/app.module.js';
import { CLOCK } from '../src/common/clock.js';
import { Money } from '../src/common/money.js';
import { DB, type Database } from '../src/database/database.module.js';
import {
  adminUsers,
  auditLog,
  dealers,
  orderLines,
  orders,
  orderStatusHistory,
  productGroups,
  products,
  sessions,
} from '../src/database/schema.js';
import { companyTitleKey } from '../src/dealers/company-title.js';
import { MAIL_SERVICE } from '../src/mail/mail.service.js';

const PASSWORD = 'Sifre-12345';
const run = randomUUID().slice(0, 8);
const NOW = new Date('2030-06-15T09:00:00Z');
const DAY = 86_400_000;
const P = { from: '2030-06-01', to: '2030-06-15' };
type Agent = ReturnType<typeof request.agent>;
type Status = typeof orders.$inferInsert.status;

describe('Raporlar (e2e)', () => {
  let app: INestApplication<App>;
  let db: Database;
  let admin: Agent;
  let dealerAgent: Agent;
  const adminIds: string[] = [];
  const dealerIds: string[] = [];
  const server = () => app.getHttpServer();

  const ids = {} as Record<'g1' | 'g2' | 'A' | 'C' | 'D' | 'd1' | 'd2' | 'd3' | 'd4', string>;
  const order = {} as Record<'o0' | 'o1' | 'o2' | 'o3' | 'o4' | 'o5', { id: string; orderNo: number }>;

  async function newDealer(name: string, over: Partial<typeof dealers.$inferInsert> = {}) {
    const title = `Rapor ${name} ${run}`;
    const [d] = await db
      .insert(dealers)
      .values({
        companyTitle: title, companyTitleKey: companyTitleKey(title), contactName: `Yetkili ${name}`,
        email: `${name}-${run}@test.example`, phone: '05320000000', city: 'Kayseri', district: 'Melikgazi',
        address: 'Adres', source: 'invitation', status: 'active', passwordHash: await hash(PASSWORD),
        emailVerifiedAt: new Date(NOW.getTime() - 400 * DAY), reviewedAt: new Date(NOW.getTime() - 300 * DAY),
        ...over,
      })
      .returning();
    dealerIds.push(d.id);
    return d;
  }

  async function newProduct(groupId: string, key: string, listPrice: string, vatRate: string, stock: 'in_stock' | 'out_of_stock' = 'in_stock') {
    const [p] = await db
      .insert(products)
      .values({ groupId, barcode: `0${key}${run}`, code: `K-${key}-${run}`, name: `Ürün ${key} ${run}`, caseQuantity: 6, listPrice, vatRate, stockStatus: stock })
      .returning();
    return p;
  }

  type Line = { product: typeof products.$inferSelect; qty: number; oos?: boolean };
  /** Doğrudan veritabanına tutarlı bir sipariş yazar (iskontosuz: net = adet × liste fiyatı). */
  async function makeOrder(
    dealerId: string,
    submittedAt: string,
    lines: Line[],
    status: Status = 'submitted',
    history: [Status | null, Status, string][] = [],
  ) {
    const calc = lines.map((l) => {
      const net = new Money(l.product.listPrice).times(l.qty);
      return { ...l, net, vat: net.times(l.product.vatRate).div(100).toDecimalPlaces(2, Money.ROUND_HALF_UP) };
    });
    const net = calc.reduce((a, l) => a.plus(l.net), new Money(0));
    const vat = calc.reduce((a, l) => a.plus(l.vat), new Money(0));
    const [o] = await db
      .insert(orders)
      .values({
        dealerId, status, deliveryMethod: 'pickup', grossTotal: net.toFixed(2), discountTotal: '0.00', netTotal: net.toFixed(2),
        vatTotal: vat.toFixed(2), grandTotal: net.plus(vat).toFixed(2), submittedAt: new Date(submittedAt),
      })
      .returning();
    if (calc.length > 0) {
      await db.insert(orderLines).values(
        calc.map((l, i) => ({
          orderId: o.id, productId: l.product.id, lineNo: i + 1, barcode: l.product.barcode, productCode: l.product.code,
          productName: l.product.name, caseQuantity: 6, quantity: l.qty, unitListPrice: l.product.listPrice,
          discountPercent: '0.00', grossAmount: l.net.toFixed(2), discountAmount: '0.00', netAmount: l.net.toFixed(2),
          vatRate: l.product.vatRate, vatAmount: l.vat.toFixed(2), outOfStockAtOrder: l.oos ?? false,
        })),
      );
    }
    for (const [from, to, at] of history) {
      await db.insert(orderStatusHistory).values({ orderId: o.id, fromStatus: from, toStatus: to, source: 'system', createdAt: new Date(at) });
    }
    return { id: o.id, orderNo: o.orderNo };
  }

  const get = (path: string, query: Record<string, string | number> = {}) => admin.get(`/api/admin/reports/${path}`).query(query);
  const xlsx = async (path: string, query: Record<string, string | number> = {}) => {
    const res = await admin
      .get(`/api/admin/reports/${path}`)
      .query(query)
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(res.body as unknown as ExcelJS.Buffer);
    return { sheet: wb.worksheets[0], headers: res.headers };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(CLOCK)
      .useValue({ now: () => NOW })
      .overrideProvider(MAIL_SERVICE)
      .useValue({})
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    db = app.get<Database>(DB);

    const [a] = await db
      .insert(adminUsers)
      .values({ email: `rapor-admin-${run}@test.example`, fullName: 'Rapor Admin', passwordHash: await hash(PASSWORD) })
      .returning();
    adminIds.push(a.id);
    admin = request.agent(server());
    await admin.post('/api/auth/admin/login').send({ email: a.email, password: PASSWORD }).expect(200);

    const [g1] = await db.insert(productGroups).values({ name: `Rapor Bardak ${run}`, nameKey: `rapor bardak ${run}` }).returning();
    const [g2] = await db.insert(productGroups).values({ name: `Rapor Tabak ${run}`, nameKey: `rapor tabak ${run}` }).returning();
    const A = await newProduct(g1.id, 'A', '10.00', '20');
    const C = await newProduct(g2.id, 'C', '20.00', '10');
    const D = await newProduct(g2.id, 'D', '5.00', '20', 'out_of_stock');
    Object.assign(ids, { g1: g1.id, g2: g2.id, A: A.id, C: C.id, D: D.id });

    const d1 = await newDealer('d1');
    const d2 = await newDealer('d2');
    const d3 = await newDealer('d3');
    const d4 = await newDealer('d4'); // hiç sipariş vermedi
    Object.assign(ids, { d1: d1.id, d2: d2.id, d3: d3.id, d4: d4.id });
    dealerAgent = request.agent(server());
    await dealerAgent.post('/api/auth/dealer/login').send({ email: d1.email, password: PASSWORD }).expect(200);

    // --- Bu ay (2030-06-01 .. 2030-06-15, İstanbul günü) ---
    order.o1 = await makeOrder(d1.id, '2030-06-02T10:00:00Z', [{ product: A, qty: 12 }, { product: C, qty: 6 }], 'approved', [
      [null, 'submitted', '2030-06-02T10:00:00Z'], ['submitted', 'negotiating', '2030-06-03T10:00:00Z'], ['negotiating', 'approved', '2030-06-05T10:00:00Z'],
    ]);
    order.o2 = await makeOrder(d1.id, '2030-06-10T20:30:00Z', [{ product: A, qty: 6 }], 'submitted', [[null, 'submitted', '2030-06-10T20:30:00Z']]);
    order.o3 = await makeOrder(d2.id, '2030-06-14T21:30:00Z', [{ product: D, qty: 6, oos: true }], 'negotiating', [
      [null, 'submitted', '2030-06-14T21:30:00Z'], ['submitted', 'negotiating', '2030-06-14T23:00:00Z'],
    ]);
    order.o4 = await makeOrder(d2.id, '2030-06-05T10:00:00Z', [{ product: A, qty: 60 }, { product: D, qty: 6, oos: true }], 'cancelled', [
      [null, 'submitted', '2030-06-05T10:00:00Z'], ['submitted', 'cancelled', '2030-06-06T10:00:00Z'],
    ]);
    // 2030-05-31T21:00Z = 1 Haziran 00:00 İstanbul: dönemin ilk anı (dahil).
    order.o0 = await makeOrder(d2.id, '2030-05-31T21:00:00Z', [{ product: A, qty: 6 }], 'delivered', [
      [null, 'submitted', '2030-05-31T21:00:00Z'], ['submitted', 'delivered', '2030-06-02T21:00:00Z'],
    ]);
    // 2030-06-15T21:00Z = 16 Haziran 00:00 İstanbul: dönemin dışında.
    order.o5 = await makeOrder(d2.id, '2030-06-15T21:00:00Z', [{ product: A, qty: 6 }]);
    // --- Önceki dönem (2030-05-17 .. 2030-05-31) ---
    await makeOrder(d1.id, '2030-05-20T10:00:00Z', [{ product: A, qty: 6 }]);
    await makeOrder(d3.id, '2030-05-31T20:59:00Z', [{ product: A, qty: 12 }], 'delivered');
    // --- Geçen yıl (2029-06-01 .. 2029-06-15) ve aynı ayın dışı ---
    await makeOrder(d1.id, '2029-06-05T10:00:00Z', [{ product: A, qty: 6 }]);
    await makeOrder(d3.id, '2029-06-20T10:00:00Z', [{ product: A, qty: 6 }]);
  });

  afterAll(async () => {
    if (db) {
      const prodIds = Object.values([ids.A, ids.C, ids.D]);
      await db.delete(auditLog).where(inArray(auditLog.actorId, adminIds));
      await db.delete(sessions).where(inArray(sessions.subjectId, [...adminIds, ...dealerIds]));
      if (dealerIds.length) await db.delete(orders).where(inArray(orders.dealerId, dealerIds));
      await db.delete(products).where(inArray(products.id, prodIds));
      await db.delete(productGroups).where(inArray(productGroups.id, [ids.g1, ids.g2]));
      if (dealerIds.length) await db.delete(dealers).where(inArray(dealers.id, dealerIds));
      await db.delete(adminUsers).where(inArray(adminUsers.id, adminIds));
    }
    await app?.close();
  });

  // -------------------------------------------------------------------------
  it('GR-YON-001: anonim 401, bayi 403 (tüm rapor uçları ve Excel çıktıları)', async () => {
    const paths = [
      'overview', 'trend', 'orders', 'dealers', `dealers/${ids.d1}/products`, 'inactive-dealers', 'products', 'groups',
      'status', 'out-of-stock', 'today', 'overview/export.xlsx', 'orders/export.xlsx', 'dealers/export.xlsx',
      'products/export.xlsx', 'groups/export.xlsx', 'status/export.xlsx', 'out-of-stock/export.xlsx',
      'inactive-dealers/export.xlsx', 'trend/export.xlsx', `dealers/${ids.d1}/products/export.xlsx`,
    ];
    for (const path of paths) {
      const anon = await request(server()).get(`/api/admin/reports/${path}`);
      const dealer = await dealerAgent.get(`/api/admin/reports/${path}`);
      expect([path, anon.status, dealer.status]).toEqual([path, 401, 403]);
    }
  });

  it('K-49, GR-RAP-001: dönem doğrulama: from > to, 3 yıldan uzun, geçersiz tarih, geçersiz parametre -> 400', async () => {
    for (const q of [
      { from: '2030-06-02', to: '2030-06-01' },
      { from: '2027-06-15', to: '2030-06-15' },
      { from: '2020-01-01', to: '2030-06-15' },
      { from: '2030-02-30', to: '2030-03-01' },
      { from: 'dün', to: '2030-03-01' },
    ]) {
      const res = await get('overview', q);
      expect([q, res.status, res.body.statusCode]).toEqual([q, 400, 400]);
      expect([q, res.body.code]).toEqual([q, 'VALIDATION']);
    }
    await get('overview', { from: '2027-06-16', to: '2030-06-15' }).expect(200);
    await get('groups', { from: '2030-06-02', to: '2030-06-01' }).expect(400);
    await get('trend', { months: 37 }).expect(400);
    await get('trend', { months: 0 }).expect(400);
    await get('inactive-dealers', { days: 0 }).expect(400);
    await get('products', { sort: 'x' }).expect(400);
    await get('orders', { status: 'x' }).expect(400);
  });

  it('GR-RAP-003, K-48: today varsayılan dönemi (ayın 1 i -> bugün) overview ta kullanılır; İstanbul günü sınırları', async () => {
    const res = await get('overview').expect(200);
    expect(res.body.period).toEqual(P);
    expect(res.body.previous).toEqual({ from: '2030-05-17', to: '2030-05-31' });
    expect(res.body.lastYear).toEqual({ from: '2029-06-01', to: '2029-06-15' });
    // Yalnızca to verilirse başlangıç ayın 1 i.
    expect((await get('overview', { to: '2030-06-10' })).body.period).toEqual({ from: '2030-06-01', to: '2030-06-10' });
  });

  it('K-46, K-49: overview: iptal hariç tutarlar, önceki dönem ve geçen yıl karşılaştırması, yüzdeler', async () => {
    const { body } = await get('overview', P).expect(200);
    expect(body.metrics.orderCount).toEqual({
      current: 4, previous: 2, lastYear: 1,
      changePrev: { amount: 2, percent: 100 }, changeYear: { amount: 3, percent: 300 },
    });
    expect(body.metrics.netTotal).toEqual({
      current: '390.00', previous: '180.00', lastYear: '60.00',
      changePrev: { amount: '210.00', percent: 116.7 }, changeYear: { amount: '330.00', percent: 550 },
    });
    expect(body.metrics.vatTotal.current).toBe('66.00');
    expect(body.metrics.grandTotal.current).toBe('456.00');
    expect(body.metrics.grandTotal.previous).toBe('216.00');
    expect(body.metrics.orderingDealerCount).toMatchObject({ current: 2, previous: 2, lastYear: 1 });
    expect(body.metrics.averageOrderNet).toMatchObject({ current: '97.50', previous: '90.00', lastYear: '60.00' });
  });

  it('K-49: önceki dönem 0 ise percent null (tutar ve sayı); geçen yıl da 0 ise null', async () => {
    const { body } = await get('overview', { from: '2029-06-01', to: '2029-06-15' }).expect(200);
    expect(body.previous).toEqual({ from: '2029-05-17', to: '2029-05-31' });
    expect(body.metrics.netTotal).toMatchObject({
      current: '60.00', previous: '0.00', lastYear: '0.00',
      changePrev: { amount: '60.00', percent: null }, changeYear: { amount: '60.00', percent: null },
    });
    expect(body.metrics.orderCount.changePrev).toEqual({ amount: 1, percent: null });
    // Hiç sipariş olmayan dönem: her şey 0, averageOrderNet "0.00".
    const empty = (await get('overview', { from: '2020-01-01', to: '2020-01-31' })).body;
    expect(empty.metrics.netTotal.current).toBe('0.00');
    expect(empty.metrics.averageOrderNet.current).toBe('0.00');
    expect(empty.metrics.orderCount.changePrev).toEqual({ amount: 0, percent: null });
  });

  it('K-46: dönem sınırı Europe/Istanbul günü: 1 Haziran 00:00 dahil, 16 Haziran 00:00 hariç; tek günlük dönem', async () => {
    // o3 (2030-06-14T21:30Z) İstanbul'da 15 Haziran 00:30.
    const day15 = (await get('overview', { from: '2030-06-15', to: '2030-06-15' })).body;
    expect(day15.metrics.orderCount.current).toBe(1);
    expect(day15.metrics.netTotal.current).toBe('30.00');
    const day16 = (await get('overview', { from: '2030-06-16', to: '2030-06-16' })).body;
    expect(day16.metrics.orderCount.current).toBe(1); // o5
    const day1 = (await get('overview', { from: '2030-06-01', to: '2030-06-01' })).body;
    expect(day1.metrics.orderCount.current).toBe(1); // o0 (31 Mayıs 21:00Z)
    const may31 = (await get('overview', { from: '2030-05-31', to: '2030-05-31' })).body;
    expect(may31.metrics.orderCount.current).toBe(1); // 31 Mayıs 20:59Z (d3)
  });

  it('GR-RAP-003, K-48: trend: son N ay (bu ay dahil), geçen yıl aynı ay; iptal ve gelecek tarihli hariç', async () => {
    const { body } = await get('trend', { months: 3 }).expect(200);
    expect(body).toEqual([
      { month: '2030-04', orderCount: 0, netTotal: '0.00', lastYearNetTotal: '0.00' },
      { month: '2030-05', orderCount: 2, netTotal: '180.00', lastYearNetTotal: '0.00' },
      { month: '2030-06', orderCount: 4, netTotal: '390.00', lastYearNetTotal: '120.00' },
    ]);
    const year = (await get('trend')).body;
    expect(year).toHaveLength(12);
    expect(year[0].month).toBe('2029-07');
    expect(year.at(-1).month).toBe('2030-06');
  });

  it('GR-RAP-001: orders: dönem listesi (en yeni önce), iptal totals a dahil değil, status filtresi, sayfalama', async () => {
    const { body } = await get('orders', P).expect(200);
    expect(body.total).toBe(5);
    expect(body.items.map((i: { orderNo: number }) => i.orderNo)).toEqual(
      [order.o3, order.o2, order.o4, order.o1, order.o0].map((o) => o.orderNo),
    );
    expect(body.items[3]).toEqual({
      id: order.o1.id, orderNo: order.o1.orderNo, submittedAt: '2030-06-02T10:00:00.000Z',
      dealer: { id: ids.d1, companyTitle: `Rapor d1 ${run}` }, status: 'approved', lineCount: 2,
      netTotal: '240.00', grandTotal: '276.00',
    });
    expect(body.totals).toEqual({ orderCount: 4, netTotal: '390.00', grandTotal: '456.00' });

    const cancelled = (await get('orders', { ...P, status: 'cancelled' })).body;
    expect(cancelled.items.map((i: { id: string }) => i.id)).toEqual([order.o4.id]);
    expect(cancelled.totals).toEqual({ orderCount: 0, netTotal: '0.00', grandTotal: '0.00' });
    const approved = (await get('orders', { ...P, status: 'approved' })).body;
    expect(approved.totals).toEqual({ orderCount: 1, netTotal: '240.00', grandTotal: '276.00' });

    const page2 = (await get('orders', { ...P, pageSize: 2, page: 2 })).body;
    expect(page2).toMatchObject({ total: 5, page: 2, pageSize: 2 });
    expect(page2.items.map((i: { id: string }) => i.id)).toEqual([order.o4.id, order.o1.id]);
  });

  it('GR-RAP-001, GR-RAP-002: dealers: bayi bazında sipariş sayısı ve KDV hariç tutar (karşılaştırmalı), net azalan; siparişsiz bayi yok', async () => {
    const { body } = await get('dealers', P).expect(200);
    expect(body.items.map((i: { dealerId: string }) => i.dealerId)).toEqual([ids.d1, ids.d2]);
    expect(body.items[0]).toMatchObject({
      dealerId: ids.d1, companyTitle: `Rapor d1 ${run}`, city: 'Kayseri', orderCount: 2, grandTotal: '348.00',
      netTotal: {
        current: '300.00', previous: '60.00', lastYear: '60.00',
        changePrev: { amount: '240.00', percent: 400 }, changeYear: { amount: '240.00', percent: 400 },
      },
    });
    expect(body.items[1]).toMatchObject({ orderCount: 2, grandTotal: '108.00' });
    expect(body.items[1].netTotal).toMatchObject({ current: '90.00', previous: '0.00', lastYear: '0.00' });
    expect(body.items[1].netTotal.changePrev.percent).toBeNull();
    // Son sipariş: iptal hariç tüm siparişlerin sonuncusu (o5 dönem dışında olsa da).
    expect(body.items[0].lastOrderAt).toBe('2030-06-10T20:30:00.000Z');
    expect(body.items[1].lastOrderAt).toBe('2030-06-15T21:00:00.000Z');
  });

  it('GR-RAP-002: dealers/:id/products: bayinin en çok aldığı ürünler (adet azalan), limit; bilinmeyen bayi 404', async () => {
    const { body } = await get(`dealers/${ids.d1}/products`, P).expect(200);
    expect(body.dealer).toEqual({ id: ids.d1, companyTitle: `Rapor d1 ${run}` });
    expect(body.items).toEqual([
      { productId: ids.A, barcode: `0A${run}`, name: `Ürün A ${run}`, groupName: `Rapor Bardak ${run}`, quantity: 18, netTotal: '180.00' },
      { productId: ids.C, barcode: `0C${run}`, name: `Ürün C ${run}`, groupName: `Rapor Tabak ${run}`, quantity: 6, netTotal: '120.00' },
    ]);
    expect((await get(`dealers/${ids.d1}/products`, { ...P, limit: 1 })).body.items).toHaveLength(1);
    // Yalnızca iptal edilmiş sipariş olan bayide ürün çıkmaz (d2'nin iptal edilen A×60 satırı sayılmaz).
    const d2 = (await get(`dealers/${ids.d2}/products`, P)).body.items as { productId: string; quantity: number }[];
    expect(d2.find((i) => i.productId === ids.A)?.quantity).toBe(6);
    await get(`dealers/${randomUUID()}/products`, P).expect(404);
    await get('dealers/abc/products', P).expect(400);
  });

  it('K-50: inactive-dealers: son sipariş 60 günden ESKİ olanlar (59 hayır, tam 60 hayır, 61 evet), hiç sipariş vermeyen ve yalnız iptali olan; pasif bayi yok', async () => {
    const e59 = await newDealer('e59');
    const e60 = await newDealer('e60');
    const e61 = await newDealer('e61');
    const eCancel = await newDealer('ecancel');
    const ePassive = await newDealer('epassive', { status: 'passive' });
    await makeOrder(e59.id, new Date(NOW.getTime() - 59 * DAY).toISOString(), []);
    await makeOrder(e60.id, new Date(NOW.getTime() - 60 * DAY).toISOString(), []);
    await makeOrder(e61.id, new Date(NOW.getTime() - 61 * DAY).toISOString(), []);
    await makeOrder(eCancel.id, new Date(NOW.getTime() - 40 * DAY).toISOString(), [], 'cancelled');

    const mine = new Set(dealerIds);
    const { body } = await get('inactive-dealers').expect(200);
    expect(body.days).toBe(60);
    const items = (body.items as { dealerId: string }[]).filter((i) => mine.has(i.dealerId));
    // Önce hiç sipariş vermeyenler (ad sırasıyla), sonra en eskiden yeniye.
    expect(items.map((i) => i.dealerId)).toEqual([ids.d4, eCancel.id, e61.id]);
    expect(items[1]).toMatchObject({ lastOrderAt: null, daysSinceLastOrder: null, contactName: 'Yetkili ecancel', phone: '05320000000', city: 'Kayseri' });
    expect(items[1].approvedAt).toBeTruthy();
    expect(items[2]).toMatchObject({ daysSinceLastOrder: 61 });
    expect(items.map((i) => i.dealerId)).not.toContain(ePassive.id);

    const thirty = (await get('inactive-dealers', { days: 30 })).body.items as { dealerId: string; daysSinceLastOrder: number | null }[];
    const ours = thirty.filter((i) => mine.has(i.dealerId));
    expect(ours.map((i) => i.dealerId)).toEqual([ids.d4, eCancel.id, e61.id, e60.id, e59.id]);
    expect(ours.map((i) => i.daysSinceLastOrder).slice(2)).toEqual([61, 60, 59]);
  });

  it('GR-RAP-001: products: en çok sipariş edilen ürünler (adet/net sıralaması, limit); sipariş ve bayi sayıları; iptal hariç', async () => {
    const byQty = (await get('products', P)).body.items;
    expect(byQty.map((i: { productId: string }) => i.productId)).toEqual([ids.A, ids.C, ids.D]);
    expect(byQty[0]).toEqual({
      productId: ids.A, barcode: `0A${run}`, code: `K-A-${run}`, name: `Ürün A ${run}`, groupName: `Rapor Bardak ${run}`,
      quantity: 24, orderCount: 3, dealerCount: 2, netTotal: '240.00',
    });
    expect(byQty[1]).toMatchObject({ quantity: 6, orderCount: 1, dealerCount: 1, netTotal: '120.00' });
    expect(byQty[2]).toMatchObject({ quantity: 6, netTotal: '30.00' });
    const byNet = (await get('products', { ...P, sort: 'net', limit: 2 })).body.items;
    expect(byNet.map((i: { productId: string }) => i.productId)).toEqual([ids.A, ids.C]);
  });

  it('GR-RAP-002: groups: ürün grubu bazında adet ve KDV hariç tutar (karşılaştırmalı), pay % (1 basamak)', async () => {
    const { body } = await get('groups', P).expect(200);
    expect(body.items).toEqual([
      {
        groupId: ids.g1, name: `Rapor Bardak ${run}`, quantity: 24, sharePercent: 61.5,
        netTotal: { current: '240.00', previous: '180.00', lastYear: '60.00', changePrev: { amount: '60.00', percent: 33.3 }, changeYear: { amount: '180.00', percent: 300 } },
      },
      {
        groupId: ids.g2, name: `Rapor Tabak ${run}`, quantity: 12, sharePercent: 38.5,
        netTotal: { current: '150.00', previous: '0.00', lastYear: '0.00', changePrev: { amount: '150.00', percent: null }, changeYear: { amount: '150.00', percent: null } },
      },
    ]);
  });

  it('K-47: status: iptal dahil durum dağılımı; durumda ortalama bekleme (geçmişten LEAD; hâlâ o durumdaysa şimdiye kadar); terminal durumlar null', async () => {
    const { body } = await get('status', P).expect(200);
    expect(body.items.map((i: { status: string; count: number }) => [i.status, i.count])).toEqual([
      ['submitted', 1], ['negotiating', 1], ['approved', 1], ['shipped', 0], ['delivered', 1], ['cancelled', 1],
    ]);
    const hours = Object.fromEntries(body.items.map((i: { status: string; averageHoursInStatus: number | null }) => [i.status, i.averageHoursInStatus]));
    // submitted: o1 24, o2 108.5 (şimdiye kadar), o3 1.5, o4 24, o0 48 -> 206 / 5
    expect(hours.submitted).toBe(41.2);
    // negotiating: o1 48, o3 10 (şimdiye kadar) -> 29
    expect(hours.negotiating).toBe(29);
    // approved: o1 Haziran 5 10:00 -> şimdi (239 saat)
    expect(hours.approved).toBe(239);
    expect(hours.shipped).toBeNull();
    expect(hours.delivered).toBeNull();
    expect(hours.cancelled).toBeNull();
    expect(body.items[0].label).toBe('Gönderildi');
  });

  it('K-47: out-of-stock: sipariş anında stokta yokken sipariş edilen ürünler (iptal hariç), adet/sipariş/bayi sayısı', async () => {
    const { body } = await get('out-of-stock', P).expect(200);
    expect(body.items).toEqual([
      {
        productId: ids.D, barcode: `0D${run}`, name: `Ürün D ${run}`, groupName: `Rapor Tabak ${run}`,
        quantity: 6, orderCount: 1, dealerCount: 1, lastOrderedAt: '2030-06-14T21:30:00.000Z',
      },
    ]);
    expect((await get('out-of-stock', { from: '2030-06-04', to: '2030-06-06' })).body.items).toEqual([]);
  });

  it('GR-RAP-003, K-48: today: bugünkü ve bu ayki sipariş sayısı/tutarı, bekleyen/gecikmiş başvuru, yeni sipariş, başarısız bildirim', async () => {
    const before = (await get('today').expect(200)).body;
    expect(before.today).toEqual({ orderCount: 1, netTotal: '30.00' });
    expect(before.month).toEqual({ orderCount: 4, netTotal: '390.00' });
    const [c] = (await db.execute<{ n: number }>(`select count(*)::int as n from orders where status = 'submitted'` as never)).rows;
    expect(before.newOrders).toBe(c.n);
    expect(before.failedNotifications).toEqual(expect.any(Number));

    // 1 Haziran'da doğrulanan bekleyen başvuru, 15 Haziran'da 2 iş gününü aştı.
    await newDealer('bekleyen', { status: 'pending_approval', emailVerifiedAt: new Date('2030-06-01T09:00:00Z'), passwordHash: null });
    const after = (await get('today')).body;
    expect(after.pendingApplications).toBe(before.pendingApplications + 1);
    expect(after.overdueApplications).toBe(before.overdueApplications + 1);
  });

  describe('Excel', () => {
    it('K-46: overview Excel i açılır; toplamlar API ile aynı, karşılaştırma sütunları dahil', async () => {
      const { body } = await get('overview', P);
      const { sheet, headers } = await xlsx('overview/export.xlsx', P);
      expect(headers['content-disposition']).toBe(`attachment; filename="rapor-genel-bakis-${P.from}-${P.to}.xlsx"`);
      const rows = new Map<string, ExcelJS.Row>();
      sheet.eachRow((row) => rows.set(row.getCell(1).text, row));
      const net = rows.get('KDV hariç toplam')!;
      expect(net.getCell(2).value).toBe(Number(body.metrics.netTotal.current));
      expect(net.getCell(3).value).toBe(Number(body.metrics.netTotal.previous));
      expect(net.getCell(4).value).toBe(Number(body.metrics.netTotal.lastYear));
      expect(net.getCell(5).value).toBe(body.metrics.netTotal.changePrev.percent);
      expect(net.getCell(6).value).toBe(body.metrics.netTotal.changeYear.percent);
      expect(rows.get('Sipariş sayısı')!.getCell(2).value).toBe(4);
    });

    it('K-46: orders Excel i: tüm satırlar, iptal hariç alt toplam API totals ile aynı; tarih gerçek tarih hücresi', async () => {
      const { body } = await get('orders', P);
      const { sheet, headers } = await xlsx('orders/export.xlsx', P);
      expect(headers['content-disposition']).toContain(`rapor-siparisler-${P.from}-${P.to}.xlsx`);
      expect(sheet.getRow(1).getCell(1).value).toBe('Sipariş no');
      expect(sheet.getRow(2).getCell(1).value).toBe(order.o3.orderNo);
      const date = sheet.getRow(2).getCell(2);
      expect(date.value).toBeInstanceOf(Date);
      expect(date.numFmt).toBe('dd.mm.yyyy hh:mm');
      expect((date.value as Date).toISOString().slice(0, 16)).toBe('2030-06-15T00:30'); // İstanbul yerel
      expect(sheet.getRow(2).getCell(6).numFmt).toBe('#,##0.00');
      const last = sheet.getRow(sheet.rowCount);
      expect(last.getCell(1).value).toBe('İptal hariç toplam');
      expect(last.getCell(5).value).toBe(body.totals.orderCount);
      expect(last.getCell(6).value).toBe(Number(body.totals.netTotal));
      expect(last.getCell(7).value).toBe(Number(body.totals.grandTotal));
    });

    it('K-46: dealers/products/groups/status/out-of-stock/inactive/trend Excel leri açılır; barkod metin; toplamlar API ile aynı', async () => {
      const dealersApi = (await get('dealers', P)).body;
      const d = (await xlsx('dealers/export.xlsx', P)).sheet;
      expect(d.getRow(2).getCell(1).value).toBe(`Rapor d1 ${run}`);
      expect(d.getRow(2).getCell(4).value).toBe(Number(dealersApi.items[0].netTotal.current));
      expect(d.getRow(2).getCell(5).value).toBe(Number(dealersApi.items[0].netTotal.previous));
      expect(d.getRow(3).getCell(8).value).toBeNull(); // d2: önceki dönem 0 -> yüzde boş

      const productsApi = (await get('products', P)).body;
      const p = (await xlsx('products/export.xlsx', P)).sheet;
      expect(p.getRow(2).getCell(1).value).toBe(`0A${run}`);
      expect(p.getRow(2).getCell(1).numFmt).toBe('@');
      expect(p.getRow(2).getCell(2).numFmt).toBe('@');
      expect(p.getRow(2).getCell(8).value).toBe(Number(productsApi.items[0].netTotal));
      expect(p.getRow(2).getCell(5).value).toBe(24);

      const dp = (await xlsx(`dealers/${ids.d1}/products/export.xlsx`, P)).sheet;
      let barcode: ExcelJS.Cell | undefined;
      dp.eachRow((row) => {
        if (row.getCell(1).value === `0A${run}`) barcode = row.getCell(1);
      });
      expect(barcode?.numFmt).toBe('@');

      const groupsApi = (await get('groups', P)).body;
      const g = (await xlsx('groups/export.xlsx', P)).sheet;
      expect(g.getRow(2).getCell(3).value).toBe(Number(groupsApi.items[0].netTotal.current));
      expect(g.getRow(2).getCell(8).value).toBe(groupsApi.items[0].sharePercent);

      const st = (await xlsx('status/export.xlsx', P)).sheet;
      expect(st.getRow(2).getCell(1).value).toBe('Gönderildi');
      expect(st.getRow(2).getCell(3).value).toBe(41.2);
      expect(st.getRow(5).getCell(3).value).toBeNull();

      const oos = (await xlsx('out-of-stock/export.xlsx', P)).sheet;
      expect(oos.getRow(2).getCell(4).value).toBe(6);

      const inactive = (await xlsx('inactive-dealers/export.xlsx')).sheet;
      expect(inactive.getRow(1).getCell(1).value).toBe('Bayi');
      expect(inactive.getRow(1).getCell(3).value).toBe('Telefon');

      const trendApi = (await get('trend', { months: 3 })).body;
      const tr = (await xlsx('trend/export.xlsx', { months: 3 })).sheet;
      expect(tr.rowCount).toBe(4);
      expect(tr.getRow(4).getCell(3).value).toBe(Number(trendApi[2].netTotal));
      expect(tr.getRow(4).getCell(4).value).toBe(Number(trendApi[2].lastYearNetTotal));
    });

    it('K-46: Excel uçları da dönem doğrulaması yapar (400)', async () => {
      await admin.get('/api/admin/reports/orders/export.xlsx').query({ from: '2030-06-02', to: '2030-06-01' }).expect(400);
      await admin.get('/api/admin/reports/dealers/export.xlsx').query({ from: '2020-01-01', to: '2030-06-01' }).expect(400);
    });
  });
});
