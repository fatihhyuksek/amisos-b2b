// Demo verisi kütüphanesi (db:demo betiği ve testler kullanır). Yalnızca geliştirme: raporlar ve panel için gerçekçi demo verisi (son 14 ay).
// Kullanım: npm run db:demo            (önceki demo verisini siler, yeniden üretir)
//           npm run db:demo -- --clear (yalnızca demo verisini siler)
// Demo kayıtları ayırt edilir: bayi e-postası `@demo.amisos.local`, ürün barkodu `869990` ile başlar,
// ürün grubu sıra numarası >= 9000. Gerçek (elle girilmiş) kayıtlara dokunulmaz.
// Demo bayiler giriş yapabilir: şifre Demo1234. Üretim sabit tohumludur (her çalıştırmada aynı veri).
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { hash } from '@node-rs/argon2';
import { and, eq, gte, inArray, like, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Money, type MoneyValue } from '../common/money.js';
import * as schema from '../database/schema.js';
import { companyTitleKey } from '../dealers/company-title.js';
import { calculateDealerPrice, dealerLineNet } from '../pricing/pricing.service.js';
import { processImage } from '../media/image-processing.js';

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

const GROUPS = ['Bardak ve Kupa', 'Tabak ve Servis', 'Tencere ve Tava', 'Mutfak Gereçleri', 'Saklama Kapları', 'Dekorasyon'];
/** [ürün adı, görsel (demo-assets/products/<slug>.webp), açıklama] */
const PRODUCT_NAMES: Record<string, [string, string, string][]> = {
  'Bardak ve Kupa': [
    ["İnce Belli Çay Bardağı 6'lı", 'cay-bardagi', 'Klasik ince belli çay bardağı, tabaklı. Bulaşık makinesinde yıkanabilir temperli cam.'],
    ["Su Bardağı 6'lı 300 ml", 'su-bardagi', 'Günlük kullanıma uygun, kalın tabanlı şeffaf su bardağı.'],
    ['Porselen Kahve Fincanı Seti 6 Kişilik', 'kahve-fincani', 'Türk kahvesi için tabaklı porselen fincan seti; siyah, beyaz ve petrol yeşili.'],
    ['Stoneware Kupa 350 ml', 'kupa', 'Mat sırlı, kum rengi el yapımı görünümlü kupa.'],
    ["Renkli Meşrubat Bardağı 6'lı", 'mesrubat-bardagi', 'Uzun form meşrubat bardağı; soğuk içecek ve kokteyl servisi için.'],
  ],
  'Tabak ve Servis': [
    ['Altın Yaldızlı Yemek Tabağı 27 cm', 'yemek-tabagi', 'Beyaz porselen, ince altın yaldız kenarlı düz tabak.'],
    ['Çizgili Çorba Kasesi 16 cm', 'corba-kasesi', 'Lacivert çizgi detaylı, derin porselen çorba kasesi.'],
    ['Siyah Servis Tabağı 32 cm', 'servis-tabagi', 'Altın kenar detaylı mat siyah servis ve sunum tabağı.'],
    ["Mint Pasta Tabağı 6'lı 19 cm", 'tatli-tabagi', 'Pastel mint renkli, altın kenarlı tatlı tabağı seti.'],
    ['Adaçayı Salata Kasesi 24 cm', 'salata-kasesi', 'Reaktif sırlı adaçayı yeşili geniş salata ve servis kasesi.'],
    ['Çatal Kaşık Bıçak Seti 18 Parça', 'catal-kasik-seti', '18/10 paslanmaz çelik, ayna parlaklığında 6 kişilik yemek takımı.'],
  ],
  'Tencere ve Tava': [
    ['Çelik Tencere Cam Kapaklı 20 cm', 'celik-tencere', 'Kapsül tabanlı paslanmaz çelik tencere; indüksiyon uyumlu, cam kapaklı.'],
    ['Granit Tava 26 cm', 'granit-tava', 'Yapışmaz granit kaplama, ahşap görünümlü saplı döküm tava.'],
    ['Düdüklü Tencere 5 lt', 'duduklu-tencere', 'Çift emniyet valfli paslanmaz çelik düdüklü tencere.'],
    ['Paslanmaz Çaydanlık Takımı', 'caydanlik', 'Klasik çift katlı çelik çaydanlık; demlik ve su ısıtıcı.'],
    ['Bakır Görünümlü Sahan 18 cm', 'sahan', 'Yumurta ve servis için kulplu bakır renkli sahan.'],
  ],
  'Mutfak Gereçleri': [
    ['Saplı Süzgeç Paslanmaz 24 cm', 'suzgec', 'Delikli paslanmaz çelik süzgeç; makarna ve sebze için.'],
    ['Ahşap Kesme Tahtası 40 cm', 'kesme-tahtasi', 'Kayın ağacından, askı delikli kesme ve servis tahtası.'],
    ['Stantlı Bıçak Seti 5 Parça', 'bicak-seti', 'Ahşap stantlı, kaymaz saplı mutfak bıçağı seti.'],
    ['Dört Yüzlü Rende', 'rende', 'Paslanmaz çelik, kaymaz tabanlı dört yüzlü rende.'],
    ['Servis Gereçleri Seti 5 Parça', 'spatula-seti', 'Spatula, kepçe, kaşık ve çırpma teli; seramik standlı.'],
  ],
  'Saklama Kapları': [
    ['Cam Saklama Kabı 1 lt', 'cam-saklama', 'Borosilikat cam, kilitli kapaklı; fırın ve mikrodalgaya uygun.'],
    ["Renkli Saklama Kutusu 3'lü", 'plastik-kutu', 'BPA içermeyen, istiflenebilir renkli kapaklı saklama kutuları.'],
    ["Baharat Takımı 4'lü", 'baharat-takimi', 'Siyah kapaklı cam baharat kavanozları.'],
    ['Metal Ekmek Kutusu', 'ekmek-kutusu', 'Kapaklı, krem renkli metal ekmek saklama kutusu.'],
    ['Çelik Termos 1 lt', 'termos', 'Çift cidarlı vakumlu çelik termos; 24 saat sıcak, 24 saat soğuk.'],
  ],
  Dekorasyon: [
    ['Seramik Vazo 32 cm', 'seramik-vazo', 'Krem rengi mat seramik vazo; kuru çiçek aranjmanlarına uygun.'],
    ["Cam Mumluk Seti 3'lü", 'mumluk-seti', 'Farklı boylarda şeffaf cam mumluk; mumlar dahildir.'],
    ['Dekoratif Oval Tepsi', 'dekoratif-tepsi', 'Altın renkli metal, kulplu oval dekoratif tepsi.'],
    ['Siyah Altın Dekoratif Kase', 'dekoratif-kase', 'İç yüzeyi altın renkli siyah seramik dekoratif kase.'],
    ["Mini Vazo Seti 3'lü", 'mini-vazo', 'Terrakota, krem ve yeşil tonlarında mini seramik vazolar.'],
  ],
};
/** Ana sayfada "öne çıkan" olarak işaretlenecek demo ürün görselleri. */
const FEATURED = new Set(['cay-bardagi', 'yemek-tabagi', 'servis-tabagi', 'celik-tencere', 'granit-tava', 'seramik-vazo', 'catal-kasik-seti', 'kahve-fincani']);
/** Son 30 günde eklenmiş görünecek ("Yeni" rozeti) demo ürünler. */
const RECENT = new Set(['mumluk-seti', 'dekoratif-tepsi', 'dekoratif-kase', 'mini-vazo', 'salata-kasesi', 'termos']);
const BANNERS: { file: string; title: string; subtitle: string; group: string }[] = [
  { file: 'kampanya-sofra', title: 'Sofranıza yeni sezon şıklığı', subtitle: 'Tabak ve servis koleksiyonu', group: 'Tabak ve Servis' },
  { file: 'kampanya-mutfak', title: 'Profesyonel mutfak ekipmanı', subtitle: 'Tencere ve tavada koli bazında toptan fiyat', group: 'Tencere ve Tava' },
  { file: 'kampanya-dekor', title: 'Evlere sıcaklık katan detaylar', subtitle: 'Dekorasyon ürünleri stokta', group: 'Dekorasyon' },
];
/**
 * Demo görselleri `originalName` önekiyle ayrılır. Önek "/" içerir: yüklenen dosya adlarından yol kısmı atıldığı için
 * (media.service.ts fixFilename) Admin'in yüklediği bir görsel bu önekle başlayamaz.
 */
const DEMO_MEDIA_PREFIX = 'demo-assets/';
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
export interface DemoOptions {
  clearOnly?: boolean;
  /**
   * Görsellerle üretim: `mediaDir` (MEDIA_DIR) ve `assetsDir` (backend/demo-assets) verilirse demo ürün görselleri,
   * kampanya görselleri ve öne çıkan ürünler de üretilir. Verilmezse (testler) görsel yazılmaz.
   */
  mediaDir?: string;
  assetsDir?: string;
}

export async function runDemo(db: Db, options: DemoOptions = {}): Promise<string | null> {
  const removedMedia: string[] = [];
  const written: string[] = [];
  try {
    const result = await db.transaction(async (tx) => {
      removedMedia.push(...(await clear(tx)));
      if (options.clearOnly) return null;
      await assertNoConflicts(tx);
      return generate(tx, options, written);
    });
    // Silinen demo görsellerinin dosyaları transaction başarıyla bittikten sonra kaldırılır.
    if (options.mediaDir) await removeMediaDirs(options.mediaDir, removedMedia);
    return result;
  } catch (error) {
    // Transaction geri alındı: bu çalıştırmada yazılan dosyalar da kaldırılır.
    if (options.mediaDir) await removeMediaDirs(options.mediaDir, written);
    throw error;
  }
}

async function removeMediaDirs(mediaDir: string, ids: string[]): Promise<void> {
  for (const id of ids) {
    if (/^[0-9a-f-]{36}$/.test(id)) await rm(path.join(path.resolve(mediaDir), id), { recursive: true, force: true });
  }
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

/** Yalnızca demo işaretli kayıtları siler (siparişler -> bayiler -> ürünler -> gruplar -> görseller). Silinen görsel id'lerini döner. */
async function clear(db: Executor): Promise<string[]> {
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
  // Demo kampanya görselleri ve hiçbir yerde kullanılmayan demo görselleri.
  const demoMedia = (
    await db.select({ id: schema.media.id }).from(schema.media).where(like(schema.media.originalName, `${DEMO_MEDIA_PREFIX}%`))
  ).map((m) => m.id);
  if (demoMedia.length === 0) return [];
  // Yalnızca demo kampanyaları silinir (demo görselli VE demo başlıklı); gerçek bir kampanya demo görselini kullanıyorsa kalır.
  await db
    .delete(schema.banners)
    .where(and(inArray(schema.banners.mediaId, demoMedia), inArray(schema.banners.title, BANNERS.map((b) => b.title))));
  const removed = await db
    .delete(schema.media)
    .where(
      and(
        inArray(schema.media.id, demoMedia),
        sql`not exists (select 1 from product_images pi where pi.media_id = ${schema.media.id})`,
        sql`not exists (select 1 from banners b where b.media_id = ${schema.media.id})`,
      ),
    )
    .returning({ id: schema.media.id });
  return removed.map((m) => m.id);
}

/** Demo görselini işleyip MEDIA_DIR'e yazar ve görsel kütüphanesine ekler. */
async function storeDemoImage(db: Executor, file: string, adminId: string, mediaDir: string, written: string[]): Promise<string> {
  const processed = await processImage(await readFile(file));
  const id = randomUUID();
  const dir = path.join(path.resolve(mediaDir), id);
  await mkdir(dir, { recursive: true });
  written.push(id);
  await writeFile(path.join(dir, 'thumb.webp'), processed.thumb);
  await writeFile(path.join(dir, 'large.webp'), processed.large);
  await db.insert(schema.media).values({
    id,
    storageKey: id,
    originalName: `${DEMO_MEDIA_PREFIX}${path.basename(path.dirname(file))}/${path.basename(file)}`,
    mime: processed.mime,
    size: processed.large.length,
    width: processed.width,
    height: processed.height,
    uploadedBy: adminId,
  });
  return id;
}

async function generate(db: Executor, options: DemoOptions, written: string[]): Promise<string> {
  const rand = rng(20261114);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)];
  const now = new Date();
  const [admin] = await db.select({ id: schema.adminUsers.id }).from(schema.adminUsers).where(eq(schema.adminUsers.isActive, true)).limit(1);

  const withImages = Boolean(options.mediaDir && options.assetsDir && admin);
  const groupIds = new Map<string, string>();
  let imageCount = 0;

  // Ürün grupları ve ürünler (31 ürün).
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
    groupIds.set(name, groupId);
    for (const [pi, [productName, slug, description]] of PRODUCT_NAMES[name].entries()) {
      const caseQuantity = pick([1, 2, 4, 6, 6, 12, 12]);
      const list = (8 + Math.floor(rand() * 400) + [0, 0.5, 0.9, 0.99][Math.floor(rand() * 4)]).toFixed(2);
      const [p] = await db
        .insert(schema.products)
        .values({
          groupId,
          barcode: `${DEMO_BARCODE_PREFIX}${String(gi * 10 + pi).padStart(7, '0')}`,
          code: `DEMO-${gi + 1}${pi + 1}`,
          name: productName,
          description,
          isFeatured: FEATURED.has(slug),
          // "Yeni" rozeti için birkaç ürün son 30 günde eklenmiş görünür; diğerleri eski.
          createdAt: new Date(now.getTime() - (RECENT.has(slug) ? 2 + Math.floor(rand() * 20) : 200 + Math.floor(rand() * 200)) * DAY),
          caseQuantity,
          listPrice: list,
          vatRate: pick(['20.00', '20.00', '20.00', '10.00']),
          stockStatus: rand() < 0.18 ? 'out_of_stock' : 'in_stock',
          stockUpdatedAt: now,
        })
        .returning();
      productRows.push(p);
      if (withImages) {
        const mediaId = await storeDemoImage(db, path.join(options.assetsDir!, 'products', `${slug}.webp`), admin!.id, options.mediaDir!, written);
        await db.insert(schema.productImages).values({ productId: p.id, mediaId, sortOrder: 0 });
        imageCount += 1;
      }
    }
  }

  // Kampanya görselleri (ana sayfa karuseli); her biri ilgili ürün grubuna bağlanır.
  if (withImages) {
    for (const [i, b] of BANNERS.entries()) {
      const mediaId = await storeDemoImage(db, path.join(options.assetsDir!, 'banners', `${b.file}.webp`), admin!.id, options.mediaDir!, written);
      await db.insert(schema.banners).values({
        mediaId,
        title: b.title,
        subtitle: b.subtitle,
        linkPath: `/katalog?grup=${groupIds.get(b.group)}`,
        sortOrder: i,
      });
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
    `Demo verisi hazır: ${dealerRows.length} bayi, ${productRows.length} ürün, ${created} sipariş (son 14 ay)` +
      (withImages ? `, ${imageCount} ürün görseli, ${BANNERS.length} kampanya görseli.` : '.'),
    ...(options.mediaDir && !admin ? ['  Görseller atlandı: önce bir Admin hesabı oluşturun (npm run db:seed).'] : []),
    `  Demo bayi girişi: bayi1${DEMO_DOMAIN} ... bayi${dealerRows.length}${DEMO_DOMAIN} / Demo1234`,
    '  Silmek için: npm run db:demo -- --clear',
  ].join('\n');
}

