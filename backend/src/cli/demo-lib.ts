// Demo verisi kütüphanesi (db:demo betiği ve testler kullanır). Yalnızca geliştirme: raporlar ve panel için gerçekçi demo verisi (son 14 ay).
// Kullanım: npm run db:demo            (önceki demo verisini siler, yeniden üretir)
//           npm run db:demo -- --clear (yalnızca demo verisini siler)
// Demo kayıtları ayırt edilir: bayi e-postası `@demo.amisos.local`, ürün barkodu `869990` ile başlar,
// ürün grubu sıra numarası >= 9000. Gerçek (elle girilmiş) kayıtlara dokunulmaz.
// Demo bayiler giriş yapabilir: şifre Demo1234. Üretim sabit tohumludur (her çalıştırmada aynı veri).
import { hash } from '@node-rs/argon2';
import { and, eq, gte, inArray, like, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Money, type MoneyValue } from '../common/money.js';
import * as schema from '../database/schema.js';
import { companyTitleKey } from '../dealers/company-title.js';
import { calculateDealerPrice, dealerLineNet } from '../pricing/pricing.service.js';

const DEMO_DOMAIN = '@demo.amisos.local';
const DEMO_BARCODE_PREFIX = '869990';
const DEMO_GROUP_SORT = 9000;
const DAY = 86_400_000;

/** Sabit tohumlu basit rastgele sayı üreteci (mulberry32). */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GROUPS = ['Bardak ve Kupa', 'Tabak ve Servis', 'Tencere ve Tava', 'Mutfak Gereçleri', 'Saklama Kapları'];
const PRODUCT_NAMES: Record<string, string[]> = {
  'Bardak ve Kupa': ["Çay Bardağı 6'lı", "Su Bardağı 6'lı", 'Kahve Fincanı Seti', 'Kupa Bardak', 'Meşrubat Bardağı 6\'lı'],
  'Tabak ve Servis': ['Yemek Tabağı 24 cm', 'Çorba Kasesi', 'Servis Tabağı 30 cm', 'Tatlı Tabağı 6\'lı', 'Salata Kasesi'],
  'Tencere ve Tava': ['Çelik Tencere 20 cm', 'Granit Tava 26 cm', 'Düdüklü Tencere 5 lt', 'Çaydanlık Takımı', 'Sahan 16 cm'],
  'Mutfak Gereçleri': ['Süzgeç Paslanmaz', 'Kesme Tahtası', 'Bıçak Seti', 'Rende', 'Spatula Seti'],
  'Saklama Kapları': ['Cam Saklama Kabı 1 lt', 'Plastik Kutu Seti', 'Baharat Takımı', 'Ekmek Kutusu', 'Termos 1 lt'],
};
const DEALERS = [
  ['Güneş Züccaciye', 'Mehmet Güneş', 'Kayseri', 'Melikgazi'],
  ['Yıldız Ev Gereçleri', 'Ayşe Yıldız', 'Ankara', 'Çankaya'],
  ['Karadeniz Hırdavat', 'Hasan Kara', 'Trabzon', 'Ortahisar'],
  ['Ege Mutfak Dünyası', 'Zeynep Ege', 'İzmir', 'Bornova'],
  ['Anadolu Züccaciye', 'Mustafa Demir', 'Konya', 'Selçuklu'],
  ['Marmara Ev Market', 'Fatma Şahin', 'Bursa', 'Nilüfer'],
  ['Akdeniz Züccaciye', 'Ali Çelik', 'Antalya', 'Muratpaşa'],
  ['Doğu Toptan Ev', 'Kemal Aydın', 'Erzurum', 'Yakutiye'],
] as const;

export type Db = ReturnType<typeof drizzle<typeof schema>>;
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Executor = Db | Tx;

export class DemoDataError extends Error {}

/**
 * Demo kayıtları KESİN eşleşmeyle ayrılır (gerçek kayıtlara asla dokunulmaz):
 * bayi = e-posta `@demo.amisos.local`; ürün = barkod `869990%` VE kod `DEMO-%`;
 * grup = nameKey ` demo` ile biten VE sıra ≥ 9000.
 */
const isDemoProduct = and(like(schema.products.barcode, `${DEMO_BARCODE_PREFIX}%`), like(schema.products.code, 'DEMO-%'));
const isDemoGroup = and(like(schema.productGroups.nameKey, '% demo'), gte(schema.productGroups.sortOrder, DEMO_GROUP_SORT));

/** Temizle + üret tek transaction'da; çakışma varsa hiçbir şey yazılmadan açık hatayla durur. */
export async function runDemo(db: Db, options: { clearOnly?: boolean } = {}): Promise<string | null> {
  return db.transaction(async (tx) => {
    await clear(tx);
    if (options.clearOnly) return null;
    await assertNoConflicts(tx);
    return generate(tx);
  });
}

/** Demo olmayan (gerçek) bir kayıt, üretilecek demo barkod/grup anahtarlarıyla çakışıyorsa durur. */
async function assertNoConflicts(db: Executor): Promise<void> {
  const clashing = await db
    .select({ barcode: schema.products.barcode })
    .from(schema.products)
    .where(like(schema.products.barcode, `${DEMO_BARCODE_PREFIX}%`));
  if (clashing.length > 0) {
    throw new DemoDataError(
      `Gerçek bir ürün demo barkod önekiyle (${DEMO_BARCODE_PREFIX}) çakışıyor (örn. ${clashing[0].barcode}); demo verisi üretilmedi, hiçbir şey değiştirilmedi.`,
    );
  }
  const keys = GROUPS.map((g) => `${companyTitleKey(g)} demo`);
  const groups = await db
    .select({ nameKey: schema.productGroups.nameKey })
    .from(schema.productGroups)
    .where(inArray(schema.productGroups.nameKey, keys));
  if (groups.length > 0) {
    throw new DemoDataError(`Gerçek bir ürün grubu demo grup anahtarıyla çakışıyor (${groups[0].nameKey}); demo verisi üretilmedi.`);
  }
  const clash = await db
    .select({ email: schema.dealers.email })
    .from(schema.dealers)
    .where(like(schema.dealers.email, `%${DEMO_DOMAIN}`));
  if (clash.length > 0) throw new DemoDataError('Silinemeyen demo bayi kaldı; demo verisi üretilmedi.');
}

/** Yalnızca demo işaretli kayıtları siler (siparişler -> bayiler -> ürünler -> gruplar). */
async function clear(db: Executor): Promise<void> {
  const demoDealers = (
    await db.select({ id: schema.dealers.id }).from(schema.dealers).where(like(schema.dealers.email, `%${DEMO_DOMAIN}`))
  ).map((d) => d.id);
  const demoProducts = (
    await db.select({ id: schema.products.id }).from(schema.products).where(isDemoProduct)
  ).map((p) => p.id);
  if (demoDealers.length > 0) {
    const demoOrders = (
      await db.select({ id: schema.orders.id }).from(schema.orders).where(inArray(schema.orders.dealerId, demoDealers))
    ).map((o) => o.id);
    await db.delete(schema.notificationOutbox).where(like(schema.notificationOutbox.recipient, `%${DEMO_DOMAIN}`));
    if (demoOrders.length > 0) {
      await db.delete(schema.auditLog).where(inArray(schema.auditLog.entityId, demoOrders));
    }
    await db.delete(schema.orders).where(inArray(schema.orders.dealerId, demoDealers)); // satır ve geçmiş cascade
    await db.delete(schema.cartItems).where(inArray(schema.cartItems.dealerId, demoDealers));
    await db.delete(schema.sessions).where(inArray(schema.sessions.subjectId, demoDealers));
    await db.delete(schema.consents).where(inArray(schema.consents.dealerId, demoDealers));
    await db.delete(schema.dealers).where(inArray(schema.dealers.id, demoDealers));
  }
  if (demoProducts.length > 0) {
    // Demo olmayan siparişlerde kullanılmış demo ürün olmamalı; kullanılmışsa silme atlanır.
    const used = await db
      .select({ id: schema.orderLines.productId })
      .from(schema.orderLines)
      .where(inArray(schema.orderLines.productId, demoProducts))
      .limit(1);
    if (used.length === 0) await db.delete(schema.products).where(inArray(schema.products.id, demoProducts));
  }
  await db
    .delete(schema.productGroups)
    .where(and(isDemoGroup, sql`not exists (select 1 from products p where p.group_id = ${schema.productGroups.id})`));
}

async function generate(db: Executor): Promise<string> {
  const rand = rng(20261114);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)];
  const now = new Date();
  const [admin] = await db.select({ id: schema.adminUsers.id }).from(schema.adminUsers).where(eq(schema.adminUsers.isActive, true)).limit(1);

  // Ürün grupları ve ürünler (25 ürün).
  const productRows: (typeof schema.products.$inferSelect)[] = [];
  for (const [gi, name] of GROUPS.entries()) {
    const [group] = await db
      .insert(schema.productGroups)
      .values({ name, nameKey: `${companyTitleKey(name)} demo`, sortOrder: DEMO_GROUP_SORT + gi })
      .onConflictDoNothing()
      .returning();
    const groupId =
      group?.id ??
      (await db.select({ id: schema.productGroups.id }).from(schema.productGroups).where(eq(schema.productGroups.nameKey, `${companyTitleKey(name)} demo`)))[0].id;
    for (const [pi, productName] of PRODUCT_NAMES[name].entries()) {
      const caseQuantity = pick([1, 2, 4, 6, 6, 12, 12]);
      const list = (8 + Math.floor(rand() * 400) + [0, 0.5, 0.9, 0.99][Math.floor(rand() * 4)]).toFixed(2);
      const [p] = await db
        .insert(schema.products)
        .values({
          groupId,
          barcode: `${DEMO_BARCODE_PREFIX}${String(gi * 10 + pi).padStart(7, '0')}`,
          code: `DEMO-${gi + 1}${pi + 1}`,
          name: productName,
          description: 'Demo ürünü.',
          caseQuantity,
          listPrice: list,
          vatRate: pick(['20.00', '20.00', '20.00', '10.00']),
          stockStatus: rand() < 0.18 ? 'out_of_stock' : 'in_stock',
          stockUpdatedAt: now,
        })
        .returning();
      productRows.push(p);
    }
  }

  // Bayiler: 8 adet, bir kısmında iskonto; sonuncusu uzun süredir sipariş vermiyor.
  const password = await hash('Demo1234');
  const dealerRows: (typeof schema.dealers.$inferSelect)[] = [];
  for (const [i, [title, contact, city, district]] of DEALERS.entries()) {
    const [d] = await db
      .insert(schema.dealers)
      .values({
        companyTitle: `${title} (demo)`,
        companyTitleKey: companyTitleKey(`${title} (demo)`),
        contactName: contact,
        email: `bayi${i + 1}${DEMO_DOMAIN}`,
        phone: `0532${String(1000000 + i * 1111).slice(0, 7)}`,
        city,
        district,
        address: `${district} Mah. Demo Sk. No:${i + 1}`,
        source: 'invitation',
        status: 'active',
        passwordHash: password,
        emailVerifiedAt: new Date(now.getTime() - 450 * DAY),
        reviewedAt: new Date(now.getTime() - 440 * DAY),
        generalDiscountPercent: [null, '5.00', '10.00', null, '7.50', null, '12.00', null][i],
      })
      .returning();
    dealerRows.push(d);
  }

  // Siparişler: son 14 ay, yakın aylar daha yoğun; son bayi 90 günden eskiye kadar sipariş verdi.
  const total = 210;
  let created = 0;
  for (let n = 0; n < total; n++) {
    // 0 (bugün) .. 425 gün önce; yakınlara ağırlık.
    const ageDays = Math.floor(Math.pow(rand(), 1.4) * 425);
    let dealer = pick(dealerRows);
    if (dealer.id === dealerRows[7].id && ageDays < 90) dealer = dealerRows[Math.floor(rand() * 7)];
    const submittedAt = new Date(now.getTime() - ageDays * DAY - Math.floor(rand() * 10) * 3_600_000);
    const lineCount = 1 + Math.floor(rand() * 5);
    const chosen = new Map<string, { product: typeof schema.products.$inferSelect; qty: number }>();
    while (chosen.size < lineCount) {
      const product = pick(productRows);
      chosen.set(product.id, { product, qty: product.caseQuantity * (1 + Math.floor(rand() * 8)) });
    }
    const lines = [...chosen.values()].map(({ product, qty }, i) => {
      const net = new Money(dealerLineNet(qty, product.listPrice, dealer.generalDiscountPercent, null));
      const gross = new Money(product.listPrice).times(qty).toDecimalPlaces(2, Money.ROUND_HALF_UP);
      const vat = net.times(product.vatRate).div(100).toDecimalPlaces(2, Money.ROUND_HALF_UP);
      return {
        product, qty, lineNo: i + 1, net, gross, vat,
        discountPercent: calculateDealerPrice(product.listPrice, dealer.generalDiscountPercent, null).discountPercent ?? '0.00',
        outOfStock: product.stockStatus === 'out_of_stock' && rand() < 0.5,
      };
    });
    const sum = (f: (l: (typeof lines)[number]) => MoneyValue) => lines.reduce((a, l) => a.plus(f(l)), new Money(0));
    const net = sum((l) => l.net);
    const gross = sum((l) => l.gross);
    const vat = sum((l) => l.vat);

    // Durum yaşa göre: eskiler teslim edilmiş (bir kısmı iptal), yeniler akışın başında.
    const path: ('submitted' | 'negotiating' | 'approved' | 'shipped' | 'delivered' | 'cancelled')[] = ['submitted'];
    const flow = ['negotiating', 'approved', 'shipped', 'delivered'] as const;
    const reach = ageDays > 75 ? 4 : ageDays > 45 ? 3 + Math.floor(rand() * 2) : ageDays > 20 ? 2 + Math.floor(rand() * 3) : ageDays > 7 ? 1 + Math.floor(rand() * 3) : Math.floor(rand() * 2);
    if (rand() < 0.08) {
      // İptal: akışın ilk adımlarından birinden (teslim edilenler iptal edilemez).
      for (let s = 0; s < Math.min(reach, 3, Math.floor(rand() * 3)); s++) path.push(flow[s]);
      path.push('cancelled');
    } else {
      for (let s = 0; s < Math.min(reach, 4); s++) path.push(flow[s]);
    }
    const status = path.at(-1)!;
    const stepAt = (i: number) => new Date(Math.min(now.getTime(), submittedAt.getTime() + i * (1 + Math.floor(rand() * 3)) * DAY));

    const delivery = pick(['carrier', 'pickup', 'truck'] as const);
    const [order] = await db
      .insert(schema.orders)
      .values({
        dealerId: dealer.id,
        status,
        deliveryMethod: delivery,
        deliveryAddress: delivery === 'carrier' ? `${dealer.address}, ${dealer.district} / ${dealer.city}` : null,
        carrierName: delivery === 'carrier' ? pick(['Yurtiçi Kargo', 'Aras Kargo', 'Mng Nakliyat']) : null,
        carrierBranch: delivery === 'carrier' ? `${dealer.city} Şube` : null,
        grossTotal: gross.toFixed(2),
        discountTotal: gross.minus(net).toFixed(2),
        netTotal: net.toFixed(2),
        vatTotal: vat.toFixed(2),
        grandTotal: net.plus(vat).toFixed(2),
        transferStatus: ageDays > 14 && status !== 'cancelled' ? 'transferred' : 'pending',
        transferredAt: ageDays > 14 && status !== 'cancelled' ? stepAt(1) : null,
        transferReference: ageDays > 14 && status !== 'cancelled' ? `BH-${10000 + n}` : null,
        transferredBy: ageDays > 14 && status !== 'cancelled' ? (admin?.id ?? null) : null,
        submittedAt,
      })
      .returning();
    await db.insert(schema.orderLines).values(
      lines.map((l) => ({
        orderId: order.id,
        productId: l.product.id,
        lineNo: l.lineNo,
        barcode: l.product.barcode,
        productCode: l.product.code,
        productName: l.product.name,
        caseQuantity: l.product.caseQuantity,
        quantity: l.qty,
        unitListPrice: l.product.listPrice,
        discountPercent: l.discountPercent,
        grossAmount: l.gross.toFixed(2),
        discountAmount: l.gross.minus(l.net).toFixed(2),
        netAmount: l.net.toFixed(2),
        vatRate: l.product.vatRate,
        vatAmount: l.vat.toFixed(2),
        outOfStockAtOrder: l.outOfStock,
      })),
    );
    await db.insert(schema.orderStatusHistory).values(
      path.map((to, i) => ({
        orderId: order.id,
        fromStatus: i === 0 ? null : path[i - 1],
        toStatus: to,
        source: i === 0 || !admin ? ('system' as const) : ('admin' as const),
        changedBy: i === 0 || !admin ? null : admin.id,
        note: to === 'cancelled' ? 'Demo: bayi vazgeçti.' : null,
        createdAt: i === 0 ? submittedAt : stepAt(i),
      })),
    );
    created += 1;
  }

  return [
    `Demo verisi hazır: ${dealerRows.length} bayi, ${productRows.length} ürün, ${created} sipariş (son 14 ay).`,
    `  Demo bayi girişi: bayi1${DEMO_DOMAIN} ... bayi${dealerRows.length}${DEMO_DOMAIN} / Demo1234`,
    '  Silmek için: npm run db:demo -- --clear',
  ].join('\n');
}

