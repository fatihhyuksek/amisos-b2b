// Amisos B2B veri modeli. Gereksinimler: docs/requirements/bayi-hesabi.md
// Kolon adları kodda camelCase, veritabanında snake_case (drizzle `casing`).
import { sql } from 'drizzle-orm';
import {
  bigint,
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
    contactName: text().notNull(),
    email: text().notNull(),
    phone: text().notNull(),
    city: text().notNull(),
    district: text().notNull(),
    address: text().notNull(),

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
    uniqueIndex('dealers_email_uq').on(sql`lower(${t.email})`),
    uniqueIndex('dealers_company_title_uq').on(sql`lower(${t.companyTitle})`),
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
    sortOrder: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('product_groups_name_uq').on(sql`lower(${t.name})`)],
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
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('products_barcode_uq').on(t.barcode),
    uniqueIndex('products_code_uq')
      .on(t.code)
      .where(sql`${t.code} IS NOT NULL`),
    index('products_group_idx').on(t.groupId),
    index('products_name_idx').on(sql`lower(${t.name})`),
    check('products_barcode_not_blank', sql`length(trim(${t.barcode})) > 0`),
    check('products_case_quantity_positive', sql`${t.caseQuantity} > 0`),
    check('products_list_price_non_negative', sql`${t.listPrice} >= 0`),
    check('products_vat_rate_range', sql`${t.vatRate} >= 0 AND ${t.vatRate} < 100`),
  ],
);

/** Ürün görselleri; birden çok görsel ve sıra (K-40). */
export const productImages = pgTable(
  'product_images',
  {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    storageKey: text().notNull(),
    altText: text(),
    sortOrder: integer().notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('product_images_product_idx').on(t.productId, t.sortOrder)],
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

    submittedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex('orders_order_no_uq').on(t.orderNo),
    index('orders_dealer_idx').on(t.dealerId, t.submittedAt),
    index('orders_status_idx').on(t.status),
    index('orders_submitted_at_idx').on(t.submittedAt),
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
