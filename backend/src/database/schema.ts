// Amisos B2B veri modeli. Gereksinimler: docs/requirements/bayi-hesabi.md
// Kolon adları kodda camelCase, veritabanında snake_case (drizzle `casing`).
import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  date,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
/** Para tutarı: KDV hariç, 2 basamak (K-11, K-39). Kodda string olarak gelir, money.ts ile hesaplanır. */
const money = () => numeric({ precision: 14, scale: 2 });
/** Yüzde oranı: 0,00 – 100,00. */
const percent = () => numeric({ precision: 5, scale: 2 });

// ---------------------------------------------------------------------------
// Enum'lar
// ---------------------------------------------------------------------------

/** Bayi yaşam döngüsü (GR-BAYI-001, 002, 004, 006). */
export const dealerStatus = pgEnum('dealer_status', [
  'pending_email', // başvurdu, e-postasını doğrulamadı (K-03)
  'pending_approval', // e-posta doğrulandı, Admin onayı bekliyor (K-04)
  'active',
  'rejected',
  'passive', // Admin pasife aldı, giriş yapamaz (K-08)
]);

/** Hesap nasıl başladı (K-02). */
export const dealerSource = pgEnum('dealer_source', ['application', 'invitation']);

export const stockStatus = pgEnum('stock_status', ['in_stock', 'out_of_stock']);
export const stockSource = pgEnum('stock_source', ['manual', 'bizimhesap']);

/** Ön sipariş durumları (K-25). */
export const orderStatus = pgEnum('order_status', [
  'submitted', // Gönderildi
  'negotiating', // Görüşülüyor
  'approved', // Onaylandı
  'shipped', // Sevk edildi
  'delivered', // Teslim edildi
  'cancelled', // İptal
]);

/** Teslimat şekilleri (K-36). */
export const deliveryMethod = pgEnum('delivery_method', [
  'carrier', // Ambar ile
  'pickup', // Bayi kendisi alır
  'truck', // Tır yüklemesi
]);

/** BizimHesap aktarım durumu (K-17). Entegrasyon sonraki aşamada yapılacak. */
export const transferStatus = pgEnum('transfer_status', [
  'pending',
  'transferred',
  'failed',
  'manual', // entegrasyon yok/başarısız, ekip elle girecek
]);

export const statusChangeSource = pgEnum('status_change_source', ['system', 'admin', 'bizimhesap']);
export const consentType = pgEnum('consent_type', ['kvkk', 'terms', 'marketing']);
export const actorType = pgEnum('actor_type', ['admin', 'dealer', 'system']);
export const tokenPurpose = pgEnum('token_purpose', [
  'email_verification',
  'password_reset',
  'invitation',
]);
/** Bildirim (e-posta) kuyruğu durumu (GR-BLD-001). */
export const notificationStatus = pgEnum('notification_status', ['pending', 'sent', 'failed']);
export const tokenSubject = pgEnum('token_subject', ['admin', 'dealer']);

// ---------------------------------------------------------------------------
// Kullanıcılar
// ---------------------------------------------------------------------------

/** Yönetim kullanıcıları. Şimdilik tek rol: Admin (K-42). */
export const adminUsers = pgTable(
  'admin_users',
  {
    id: uuid().primaryKey().defaultRandom(),
    email: text().notNull(),
    fullName: text().notNull(),
    passwordHash: text().notNull(),
    isActive: boolean().notNull().default(true),
    lastLoginAt: timestamp({ withTimezone: true }),
    /** K-78: bildirim merkezinde bu andan sonraki olaylar "okunmamış" sayılır (Admin başına). */
    notificationsReadAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('admin_users_email_uq').on(sql`lower(${t.email})`)],
);

/**
 * Bayi hesabı. Her bayinin tek kullanıcısı vardır, giriş bilgisi bu tablodadır (K-07).
 * Başvuru bilgileri (K-35), durum (K-02 – K-04, K-08) ve iskonto (K-12) burada.
 */
export const dealers = pgTable(
  'dealers',
  {
    id: uuid().primaryKey().defaultRandom(),
    companyTitle: text().notNull(),
    /**
     * Firma unvanı tekillik anahtarı (GR-BAYI-005, K-57 sonrası inceleme #7): Türkçe yerelle küçültülmüş,
     * iç boşlukları tek boşluğa indirilmiş unvan. Uygulama `companyTitleKey()` ile üretir
     * (src/dealers/company-title.ts); migration mevcut satırları aynı sonucu verecek SQL ile doldurur.
     */
    companyTitleKey: text().notNull(),
    contactName: text().notNull(),
    email: text().notNull(),
    phone: text().notNull(),
    city: text().notNull(),
    district: text().notNull(),
    address: text().notNull(),
    /** K-68: isteğe bağlı vergi bilgileri (VKN 10 / TCKN 11 hane). */
    taxOffice: text(),
    taxNumber: text(),

    status: dealerStatus().notNull().default('pending_email'),
    source: dealerSource().notNull(),
    /** Hesap açılınca (davet veya onay sonrası) şifre belirlenir. */
    passwordHash: text(),
    emailVerifiedAt: timestamp({ withTimezone: true }),

    /** Müşteriye tek iskonto oranı (K-12). Boşsa standart liste fiyatı. */
    generalDiscountPercent: percent(),

    reviewedAt: timestamp({ withTimezone: true }),
    reviewedBy: uuid().references(() => adminUsers.id),
    rejectionReason: text(),
    lastLoginAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // GR-BAYI-004 / GR-BAYI-005: aynı e-posta veya aynı firma unvanıyla ikinci kayıt olamaz.
    // K-51: reddedilen başvurular tekilliğe dahil değil; reddedilen bayi yeniden başvurabilir.
    uniqueIndex('dealers_email_uq')
      .on(sql`lower(${t.email})`)
      .where(sql`${t.status} <> 'rejected'`),
    uniqueIndex('dealers_company_title_key_uq')
      .on(t.companyTitleKey)
      .where(sql`${t.status} <> 'rejected'`),
    index('dealers_status_idx').on(t.status),
    check(
      'dealers_general_discount_range',
      sql`${t.generalDiscountPercent} IS NULL OR (${t.generalDiscountPercent} > 0 AND ${t.generalDiscountPercent} < 100)`,
    ),
    check(
      'dealers_rejection_has_reason',
      sql`${t.status} <> 'rejected' OR ${t.rejectionReason} IS NOT NULL`,
    ),
  ],
);

/** E-posta doğrulama, şifre sıfırlama ve davet bağlantıları. Token'ın kendisi değil özeti saklanır. */
export const authTokens = pgTable(
  'auth_tokens',
  {
    id: uuid().primaryKey().defaultRandom(),
    subjectType: tokenSubject().notNull(),
    subjectId: uuid().notNull(),
    purpose: tokenPurpose().notNull(),
    tokenHash: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    usedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('auth_tokens_hash_uq').on(t.tokenHash),
    index('auth_tokens_subject_idx').on(t.subjectType, t.subjectId, t.purpose),
  ],
);

/**
 * Sunucu taraflı oturum (GR-BAYI-006, GR-BAYI-007, K-29). Çerezdeki token'ın kendisi değil
 * SHA-256 özeti saklanır. Kayan süre: her kullanımda `expires_at` uzar.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid().primaryKey().defaultRandom(),
    tokenHash: text().notNull(),
    subjectType: tokenSubject().notNull(),
    subjectId: uuid().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: createdAt(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_uq').on(t.tokenHash),
    index('sessions_subject_idx').on(t.subjectType, t.subjectId),
    index('sessions_expires_at_idx').on(t.expiresAt),
  ],
);

/** KVKK, kullanım koşulları ve pazarlama onayları; metin sürümüyle (GR-KVK-001). */
export const consents = pgTable(
  'consents',
  {
    id: uuid().primaryKey().defaultRandom(),
    dealerId: uuid()
      .notNull()
      .references(() => dealers.id),
    type: consentType().notNull(),
    documentVersion: text().notNull(),
    granted: boolean().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('consents_dealer_idx').on(t.dealerId, t.type)],
);

// ---------------------------------------------------------------------------
// Ürünler
// ---------------------------------------------------------------------------

export const productGroups = pgTable(
  'product_groups',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    /**
     * Ad tekillik anahtarı (API sözleşmesi: aynı ad Türkçe büyük/küçük harf duyarsız): `companyTitleKey()`
     * ile üretilir (src/dealers/company-title.ts); migration mevcut satırları aynı sonucu veren SQL ile doldurur.
     */
    nameKey: text().notNull(),
    /**
     * K-82: vitrin adresi `/katalog/<slug>`; tekil, boş olamaz. Boş bırakılırsa veritabanı tetikleyicisi addan üretir
     * (uygulama yine de `allocateGroupSlug` ile açıkça yazar).
     */
    slug: text().notNull().default(''),
    seoTitle: text(),
    seoDescription: text(),
    /** K-82: grup sayfası tanıtım metni (≤1000). */
    description: text(),
    sortOrder: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('product_groups_name_key_uq').on(t.nameKey),
    uniqueIndex('product_groups_slug_uq').on(t.slug),
    check('product_groups_slug_not_blank', sql`length(trim(${t.slug})) > 0`),
  ],
);

/**
 * Görsel kütüphanesi (K-61, K-62). Dosyalar diskte `MEDIA_DIR/<id>/{thumb,large}.webp`; yol yalnızca
 * `id`'den türetilir. `storageKey` = `<id>` (dizin adı).
 */
export const media = pgTable(
  'media',
  {
    id: uuid().primaryKey().defaultRandom(),
    storageKey: text().notNull(),
    /** Yüklenen dosyanın adı (aranabilir, ör. barkod). */
    originalName: text().notNull(),
    /** Yüklenen özgün dosyanın içerikten saptanan türü (image/jpeg, image/png, image/webp). */
    mime: text().notNull(),
    /** Büyük (large) sürümün bayt boyutu. */
    size: integer().notNull(),
    width: integer().notNull(),
    height: integer().notNull(),
    uploadedBy: uuid()
      .notNull()
      .references(() => adminUsers.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('media_storage_key_uq').on(t.storageKey),
    index('media_created_at_idx').on(t.createdAt),
  ],
);

/** Ürünler portalda yönetilir (K-14). Barkod zorunlu ve tekil (K-16, K-30). */
export const products = pgTable(
  'products',
  {
    id: uuid().primaryKey().defaultRandom(),
    groupId: uuid()
      .notNull()
      .references(() => productGroups.id),
    barcode: text().notNull(),
    /** BizimHesap ürün kodu; yoksa eşleşme yalnızca barkodla yapılır (K-15). */
    code: text(),
    /** K-80: BizimHesap ürün ID'si (tekil, null hariç). Eşleşme yine barkodla yapılır. */
    bizimhesapId: text(),
    /** K-82: vitrin adresi `/urun/<slug>`; tekil, boş olamaz. Boş bırakılırsa tetikleyici addan üretir. */
    slug: text().notNull().default(''),
    seoTitle: text(),
    seoDescription: text(),
    name: text().notNull(),
    description: text(),
    /** Koli içi adedi; tek satılan üründe 1 (K-21, K-32). */
    caseQuantity: integer().notNull().default(1),
    /** Standart liste fiyatı, KDV hariç (K-10, K-11). */
    listPrice: money().notNull(),
    vatRate: percent().notNull(),
    stockStatus: stockStatus().notNull().default('out_of_stock'),
    stockSource: stockSource().notNull().default('manual'),
    stockUpdatedAt: timestamp({ withTimezone: true }),
    isActive: boolean().notNull().default(true),
    /** K-74: Admin "öne çıkan" işareti (ana sayfa bölümü). */
    isFeatured: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('products_barcode_uq').on(t.barcode),
    uniqueIndex('products_code_uq')
      .on(t.code)
      .where(sql`${t.code} IS NOT NULL`),
    uniqueIndex('products_bizimhesap_id_uq')
      .on(t.bizimhesapId)
      .where(sql`${t.bizimhesapId} IS NOT NULL`),
    uniqueIndex('products_slug_uq').on(t.slug),
    check('products_slug_not_blank', sql`length(trim(${t.slug})) > 0`),
    index('products_group_idx').on(t.groupId),
    index('products_name_idx').on(sql`lower(${t.name})`),
    index('products_featured_idx')
      .on(t.id)
      .where(sql`${t.isFeatured}`),
    check('products_barcode_not_blank', sql`length(trim(${t.barcode})) > 0`),
    check('products_case_quantity_positive', sql`${t.caseQuantity} > 0`),
    check('products_list_price_non_negative', sql`${t.listPrice} >= 0`),
    check('products_vat_rate_range', sql`${t.vatRate} >= 0 AND ${t.vatRate} < 100`),
  ],
);

/** K-82: ürün slug'ı değişince eski adres burada tutulur; vitrin 301 ile yeni adrese yönlendirir. */
export const productSlugRedirects = pgTable(
  'product_slug_redirects',
  {
    slug: text().primaryKey(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [index('product_slug_redirects_product_idx').on(t.productId)],
);

/** Ürün görselleri; birden çok görsel ve sıra (K-40). */
export const productImages = pgTable(
  'product_images',
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    /** Görsel kütüphanesindeki kayıt; kullanımdaki görsel silinemez (K-62). */
    mediaId: uuid()
      .notNull()
      .references(() => media.id, { onDelete: 'restrict' }),
    sortOrder: integer().notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [
    index('product_images_product_idx').on(t.productId, t.sortOrder),
    uniqueIndex('product_images_product_media_uq').on(t.productId, t.mediaId),
    index('product_images_media_idx').on(t.mediaId),
  ],
);

/** Bayiye ürün grubu bazında iskonto (K-12). Genel oranla birlikte yüksek olan uygulanır (K-13). */
export const dealerGroupDiscounts = pgTable(
  'dealer_group_discounts',
  {
    dealerId: uuid()
      .notNull()
      .references(() => dealers.id, { onDelete: 'cascade' }),
    groupId: uuid()
      .notNull()
      .references(() => productGroups.id, { onDelete: 'cascade' }),
    discountPercent: percent().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.dealerId, t.groupId] }),
    check(
      'dealer_group_discounts_range',
      sql`${t.discountPercent} > 0 AND ${t.discountPercent} < 100`,
    ),
  ],
);

/**
 * Ana sayfa kampanya görselleri (K-65). Görsel kütüphaneden gelir (K-62); kullanımdaki görsel silinemez.
 * `link_path` yalnızca uygulama içi yoldur: açık yönlendirme yok.
 */
export const banners = pgTable(
  'banners',
  {
    id: uuid().primaryKey().defaultRandom(),
    mediaId: uuid()
      .notNull()
      .references(() => media.id, { onDelete: 'restrict' }),
    /** Zorunlu; görselin alt metni olarak da kullanılır. */
    title: text().notNull(),
    subtitle: text(),
    linkPath: text(),
    sortOrder: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    startsAt: timestamp({ withTimezone: true }),
    endsAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('banners_media_idx').on(t.mediaId),
    index('banners_sort_idx').on(t.sortOrder),
    check('banners_title_not_blank', sql`length(trim(${t.title})) > 0`),
    // "/" ile başlar; "//", ters eğik çizgi, boşluk ve şema (":" "/" öncesinde olamaz) yok.
    check('banners_link_path_internal', sql`${t.linkPath} IS NULL OR ${t.linkPath} ~ '^/([^/\\\\\\s][^\\\\\\s]*)?$'`),
    check('banners_period_valid', sql`${t.startsAt} IS NULL OR ${t.endsAt} IS NULL OR ${t.endsAt} > ${t.startsAt}`),
  ],
);

// ---------------------------------------------------------------------------
// Sepet ve ön sipariş
// ---------------------------------------------------------------------------

/** Kalıcı sepet; çıkış yapılsa da korunur (K-41). Fiyat burada tutulmaz, gösterimde hesaplanır. */
export const cartItems = pgTable(
  'cart_items',
  {
    dealerId: uuid()
      .notNull()
      .references(() => dealers.id, { onDelete: 'cascade' }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    quantity: integer().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ columns: [t.dealerId, t.productId] }),
    check('cart_items_quantity_positive', sql`${t.quantity} > 0`),
  ],
);

/** Ön sipariş. Gönderildikten sonra içeriği değişmez (K-22). Tutarlar KDV hariç + KDV ayrı (K-33). */
export const orders = pgTable(
  'orders',
  {
    id: uuid().primaryKey().defaultRandom(),
    /** Bayiye ve ekibe gösterilen sıralı sipariş numarası. */
    orderNo: integer().generatedAlwaysAsIdentity({ startWith: 1000 }),
    dealerId: uuid()
      .notNull()
      .references(() => dealers.id),
    status: orderStatus().notNull().default('submitted'),

    deliveryMethod: deliveryMethod().notNull(),
    /** Yalnızca ambar ile teslimatta zorunlu (K-27, K-37, K-38). */
    deliveryAddress: text(),
    carrierName: text(),
    carrierBranch: text(),
    note: text(),

    currency: text().notNull().default('TRY'),
    /** İskonto öncesi brüt toplam (KDV hariç). */
    grossTotal: money().notNull(),
    discountTotal: money().notNull(),
    /** İskonto sonrası net toplam (KDV hariç). */
    netTotal: money().notNull(),
    vatTotal: money().notNull(),
    grandTotal: money().notNull(),

    // BizimHesap aktarımı (K-17). Entegrasyon sonraki aşamada; alanlar şimdiden hazır.
    transferStatus: transferStatus().notNull().default('pending'),
    bizimhesapGuid: text(),
    transferError: text(),
    transferredAt: timestamp({ withTimezone: true }),
    /** Elle girişte (K-17 yedek yolu) BizimHesap belge/sipariş no'su ve işareti koyan Admin. */
    transferReference: text(),
    transferredBy: uuid().references(() => adminUsers.id),

    submittedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('orders_order_no_uq').on(t.orderNo),
    index('orders_dealer_idx').on(t.dealerId, t.submittedAt),
    index('orders_status_idx').on(t.status),
    index('orders_submitted_at_idx').on(t.submittedAt),
    // Raporlar (K-46): iptal edilmeyen siparişlerin dönem taraması; kısmi indeks daha küçük ve yeterli.
    index('orders_submitted_sold_idx')
      .on(t.submittedAt)
      .where(sql`${t.status} <> 'cancelled'`),
    check(
      'orders_carrier_requires_address',
      sql`${t.deliveryMethod} <> 'carrier' OR (
        length(trim(coalesce(${t.deliveryAddress}, ''))) > 0
        AND length(trim(coalesce(${t.carrierName}, ''))) > 0
        AND length(trim(coalesce(${t.carrierBranch}, ''))) > 0
      )`,
    ),
    check(
      'orders_totals_consistent',
      sql`${t.netTotal} = ${t.grossTotal} - ${t.discountTotal}
        AND ${t.grandTotal} = ${t.netTotal} + ${t.vatTotal}`,
    ),
  ],
);

/**
 * Ön sipariş satırı. Ürün bilgileri ve fiyat sipariş anındaki haliyle kopyalanır;
 * sonradan ürün veya fiyat değişse de sipariş değişmez (GR-BAYI-003, GR-URN-001).
 */
export const orderLines = pgTable(
  'order_lines',
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    productId: uuid()
      .notNull()
      .references(() => products.id),
    lineNo: integer().notNull(),

    barcode: text().notNull(),
    productCode: text(),
    productName: text().notNull(),
    caseQuantity: integer().notNull(),
    quantity: integer().notNull(),

    unitListPrice: money().notNull(),
    /** Uygulanan iskonto: genel ve grup oranından yüksek olanı (K-13). */
    discountPercent: percent().notNull().default('0'),
    grossAmount: money().notNull(),
    discountAmount: money().notNull(),
    netAmount: money().notNull(),
    vatRate: percent().notNull(),
    vatAmount: money().notNull(),
    /** Sipariş anında stokta "Yok" idi (K-20, GR-SIP-003). */
    outOfStockAtOrder: boolean().notNull().default(false),
  },
  (t) => [
    uniqueIndex('order_lines_order_line_uq').on(t.orderId, t.lineNo),
    index('order_lines_product_idx').on(t.productId),
    check('order_lines_quantity_positive', sql`${t.quantity} > 0`),
    // GR-SIP-004: koli içi adedinin katı.
    check('order_lines_case_multiple', sql`${t.quantity} % ${t.caseQuantity} = 0`),
    check('order_lines_discount_range', sql`${t.discountPercent} >= 0 AND ${t.discountPercent} < 100`),
    check(
      'order_lines_amounts_consistent',
      sql`${t.netAmount} = ${t.grossAmount} - ${t.discountAmount}`,
    ),
  ],
);

/** Durum geçmişi; her değişiklik zaman ve kaynakla (GR-SIP-006). */
export const orderStatusHistory = pgTable(
  'order_status_history',
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    fromStatus: orderStatus(),
    toStatus: orderStatus().notNull(),
    source: statusChangeSource().notNull(),
    changedBy: uuid().references(() => adminUsers.id),
    note: text(),
    createdAt: createdAt(),
  },
  (t) => [
    index('order_status_history_order_idx').on(t.orderId, t.createdAt),
    check(
      'order_status_history_admin_has_user',
      sql`${t.source} <> 'admin' OR ${t.changedBy} IS NOT NULL`,
    ),
  ],
);

/**
 * E-posta outbox'ı (GR-BLD-001, K-17, K-26): tüm e-postalar önce iş transaction'ında bu tabloya yazılır,
 * commit sonrası bir kez denenir; başarısızsa üstel geri çekilmeyle (en fazla 8 deneme) yeniden denenir.
 * Token içeren e-postalarda `payload.link` gönderilince (veya 24 saat sonra) temizlenir.
 */
export const notificationOutbox = pgTable(
  'notification_outbox',
  {
    id: uuid().primaryKey().defaultRandom(),
    kind: text().notNull(),
    recipient: text().notNull(),
    payload: jsonb().notNull(),
    status: notificationStatus().notNull().default('pending'),
    attempts: integer().notNull().default(0),
    lastError: text(),
    nextAttemptAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
    sentAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index('notification_outbox_due_idx').on(t.status, t.nextAttemptAt),
    index('notification_outbox_created_idx').on(t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// İşlem kaydı
// ---------------------------------------------------------------------------

/** Onay, red, pasife alma, koşul değişikliği gibi işlemlerin kaydı (GR-BAYI-002, 006, GR-YON-001). */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    actorType: actorType().notNull(),
    actorId: uuid(),
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: text().notNull(),
    reason: text(),
    data: jsonb(),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_log_entity_idx').on(t.entityType, t.entityId, t.createdAt),
    index('audit_log_created_at_idx').on(t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Vitrin, hesap ve admin araçları (K-66 – K-75). API: docs/api/vitrin-hesap-api.md
// ---------------------------------------------------------------------------

/** K-73: duyuru şeridi, iletişim bilgileri ve bilgi sayfaları (anahtar başına bir JSON değer). */
export const siteSettings = pgTable('site_settings', {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid().references(() => adminUsers.id, { onDelete: 'set null' }),
});

/** K-69: bayinin kayıtlı teslimat adresleri (en fazla 20). Bayide en fazla bir varsayılan. */
export const dealerAddresses = pgTable(
  'dealer_addresses',
  {
    id: uuid().primaryKey().defaultRandom(),
    dealerId: uuid()
      .notNull()
      .references(() => dealers.id, { onDelete: 'cascade' }),
    label: text().notNull(),
    carrierName: text().notNull().default(''),
    carrierBranch: text().notNull().default(''),
    address: text().notNull(),
    city: text().notNull().default(''),
    district: text().notNull().default(''),
    isDefault: boolean().notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('dealer_addresses_dealer_idx').on(t.dealerId, t.createdAt),
    uniqueIndex('dealer_addresses_default_uq')
      .on(t.dealerId)
      .where(sql`${t.isDefault}`),
    check('dealer_addresses_label_not_blank', sql`length(trim(${t.label})) > 0`),
    check('dealer_addresses_address_not_blank', sql`length(trim(${t.address})) > 0`),
  ],
);

/** K-70: bayinin favori ürünleri. */
export const dealerFavorites = pgTable(
  'dealer_favorites',
  {
    dealerId: uuid()
      .notNull()
      .references(() => dealers.id, { onDelete: 'cascade' }),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.dealerId, t.productId] }),
    index('dealer_favorites_dealer_idx').on(t.dealerId, t.createdAt),
  ],
);

/** K-75: bayiye bağlı iç notlar; yalnızca Admin görür. */
export const dealerNotes = pgTable(
  'dealer_notes',
  {
    id: uuid().primaryKey().defaultRandom(),
    dealerId: uuid()
      .notNull()
      .references(() => dealers.id, { onDelete: 'cascade' }),
    body: text().notNull(),
    createdBy: uuid()
      .notNull()
      .references(() => adminUsers.id),
    createdAt: createdAt(),
  },
  (t) => [
    index('dealer_notes_dealer_idx').on(t.dealerId, t.createdAt),
    check('dealer_notes_body_not_blank', sql`length(trim(${t.body})) > 0`),
  ],
);

/** K-78: siparişe bağlı iç notlar; yalnızca Admin görür, bayiye hiçbir uçta dönmez. */
export const orderNotes = pgTable(
  'order_notes',
  {
    id: uuid().primaryKey().defaultRandom(),
    orderId: uuid()
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    body: text().notNull(),
    createdBy: uuid()
      .notNull()
      .references(() => adminUsers.id),
    createdAt: createdAt(),
  },
  (t) => [
    index('order_notes_order_idx').on(t.orderId, t.createdAt),
    check('order_notes_body_not_blank', sql`length(trim(${t.body})) > 0`),
  ],
);

// ---------------------------------------------------------------------------
// Analitik (K-84 – K-87). API: docs/api/analitik-vitrin-api.md
// ---------------------------------------------------------------------------

/**
 * K-84: çerezsiz ziyaret ve işlem olayları. IP ve ham User-Agent ASLA saklanmaz; `visitor_key` günlük tuzla
 * üretilmiş tek yönlü özettir. Sunucu olayları: `login`, `order_submitted`. 400 günden eskisi silinir.
 * `product_id`, `group_id`, `order_id` bilerek yumuşak referanstır (FK yok): yazma yükü ve silme bağımsızlığı.
 */
export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    occurredAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    type: text().notNull(),
    sessionKey: text().notNull(),
    visitorKey: text().notNull(),
    dealerId: uuid().references(() => dealers.id, { onDelete: 'cascade' }),
    path: text().notNull(),
    productId: uuid(),
    groupId: uuid(),
    query: text(),
    resultCount: integer(),
    quantity: integer(),
    orderId: uuid(),
    referrerHost: text(),
    device: text().notNull(),
    utmSource: text(),
  },
  (t) => [
    index('analytics_events_occurred_idx').on(t.occurredAt),
    index('analytics_events_type_occurred_idx').on(t.type, t.occurredAt),
    index('analytics_events_dealer_occurred_idx').on(t.dealerId, t.occurredAt),
    index('analytics_events_product_occurred_idx').on(t.productId, t.occurredAt),
  ],
);

/** K-84: günlük gizli tuz (yalnızca bugün/dün tutulur, eskisi silinir → günler arası iz yok). */
export const analyticsDailySalts = pgTable('analytics_daily_salts', {
  day: date({ mode: 'string' }).primaryKey(),
  salt: text().notNull(),
  createdAt: createdAt(),
});
