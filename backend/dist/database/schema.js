import { sql } from 'drizzle-orm';
import { bigint, boolean, check, index, integer, jsonb, numeric, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, } from 'drizzle-orm/pg-core';
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const money = () => numeric({ precision: 14, scale: 2 });
const percent = () => numeric({ precision: 5, scale: 2 });
export const dealerStatus = pgEnum('dealer_status', [
    'pending_email',
    'pending_approval',
    'active',
    'rejected',
    'passive',
]);
export const dealerSource = pgEnum('dealer_source', ['application', 'invitation']);
export const stockStatus = pgEnum('stock_status', ['in_stock', 'out_of_stock']);
export const stockSource = pgEnum('stock_source', ['manual', 'bizimhesap']);
export const orderStatus = pgEnum('order_status', [
    'submitted',
    'negotiating',
    'approved',
    'shipped',
    'delivered',
    'cancelled',
]);
export const deliveryMethod = pgEnum('delivery_method', [
    'carrier',
    'pickup',
    'truck',
]);
export const transferStatus = pgEnum('transfer_status', [
    'pending',
    'transferred',
    'failed',
    'manual',
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
export const adminUsers = pgTable('admin_users', {
    id: uuid().primaryKey().defaultRandom(),
    email: text().notNull(),
    fullName: text().notNull(),
    passwordHash: text().notNull(),
    isActive: boolean().notNull().default(true),
    lastLoginAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
}, (t) => [uniqueIndex('admin_users_email_uq').on(sql `lower(${t.email})`)]);
export const dealers = pgTable('dealers', {
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
    passwordHash: text(),
    emailVerifiedAt: timestamp({ withTimezone: true }),
    generalDiscountPercent: percent(),
    reviewedAt: timestamp({ withTimezone: true }),
    reviewedBy: uuid().references(() => adminUsers.id),
    rejectionReason: text(),
    lastLoginAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
}, (t) => [
    uniqueIndex('dealers_email_uq')
        .on(sql `lower(${t.email})`)
        .where(sql `${t.status} <> 'rejected'`),
    uniqueIndex('dealers_company_title_uq')
        .on(sql `lower(${t.companyTitle})`)
        .where(sql `${t.status} <> 'rejected'`),
    index('dealers_status_idx').on(t.status),
    check('dealers_general_discount_range', sql `${t.generalDiscountPercent} IS NULL OR (${t.generalDiscountPercent} > 0 AND ${t.generalDiscountPercent} < 100)`),
    check('dealers_rejection_has_reason', sql `${t.status} <> 'rejected' OR ${t.rejectionReason} IS NOT NULL`),
]);
export const authTokens = pgTable('auth_tokens', {
    id: uuid().primaryKey().defaultRandom(),
    subjectType: tokenSubject().notNull(),
    subjectId: uuid().notNull(),
    purpose: tokenPurpose().notNull(),
    tokenHash: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    usedAt: timestamp({ withTimezone: true }),
    createdAt: createdAt(),
}, (t) => [
    uniqueIndex('auth_tokens_hash_uq').on(t.tokenHash),
    index('auth_tokens_subject_idx').on(t.subjectType, t.subjectId, t.purpose),
]);
export const consents = pgTable('consents', {
    id: uuid().primaryKey().defaultRandom(),
    dealerId: uuid()
        .notNull()
        .references(() => dealers.id),
    type: consentType().notNull(),
    documentVersion: text().notNull(),
    granted: boolean().notNull(),
    createdAt: createdAt(),
}, (t) => [index('consents_dealer_idx').on(t.dealerId, t.type)]);
export const productGroups = pgTable('product_groups', {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    sortOrder: integer().notNull().default(0),
    isActive: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
}, (t) => [uniqueIndex('product_groups_name_uq').on(sql `lower(${t.name})`)]);
export const products = pgTable('products', {
    id: uuid().primaryKey().defaultRandom(),
    groupId: uuid()
        .notNull()
        .references(() => productGroups.id),
    barcode: text().notNull(),
    code: text(),
    name: text().notNull(),
    description: text(),
    caseQuantity: integer().notNull().default(1),
    listPrice: money().notNull(),
    vatRate: percent().notNull(),
    stockStatus: stockStatus().notNull().default('out_of_stock'),
    stockSource: stockSource().notNull().default('manual'),
    stockUpdatedAt: timestamp({ withTimezone: true }),
    isActive: boolean().notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
}, (t) => [
    uniqueIndex('products_barcode_uq').on(t.barcode),
    uniqueIndex('products_code_uq')
        .on(t.code)
        .where(sql `${t.code} IS NOT NULL`),
    index('products_group_idx').on(t.groupId),
    index('products_name_idx').on(sql `lower(${t.name})`),
    check('products_barcode_not_blank', sql `length(trim(${t.barcode})) > 0`),
    check('products_case_quantity_positive', sql `${t.caseQuantity} > 0`),
    check('products_list_price_non_negative', sql `${t.listPrice} >= 0`),
    check('products_vat_rate_range', sql `${t.vatRate} >= 0 AND ${t.vatRate} < 100`),
]);
export const productImages = pgTable('product_images', {
    id: uuid().primaryKey().defaultRandom(),
    productId: uuid()
        .notNull()
        .references(() => products.id, { onDelete: 'cascade' }),
    storageKey: text().notNull(),
    altText: text(),
    sortOrder: integer().notNull().default(0),
    createdAt: createdAt(),
}, (t) => [index('product_images_product_idx').on(t.productId, t.sortOrder)]);
export const dealerGroupDiscounts = pgTable('dealer_group_discounts', {
    dealerId: uuid()
        .notNull()
        .references(() => dealers.id, { onDelete: 'cascade' }),
    groupId: uuid()
        .notNull()
        .references(() => productGroups.id, { onDelete: 'cascade' }),
    discountPercent: percent().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
}, (t) => [
    primaryKey({ columns: [t.dealerId, t.groupId] }),
    check('dealer_group_discounts_range', sql `${t.discountPercent} > 0 AND ${t.discountPercent} < 100`),
]);
export const cartItems = pgTable('cart_items', {
    dealerId: uuid()
        .notNull()
        .references(() => dealers.id, { onDelete: 'cascade' }),
    productId: uuid()
        .notNull()
        .references(() => products.id, { onDelete: 'cascade' }),
    quantity: integer().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
}, (t) => [
    primaryKey({ columns: [t.dealerId, t.productId] }),
    check('cart_items_quantity_positive', sql `${t.quantity} > 0`),
]);
export const orders = pgTable('orders', {
    id: uuid().primaryKey().defaultRandom(),
    orderNo: integer().generatedAlwaysAsIdentity({ startWith: 1000 }),
    dealerId: uuid()
        .notNull()
        .references(() => dealers.id),
    status: orderStatus().notNull().default('submitted'),
    deliveryMethod: deliveryMethod().notNull(),
    deliveryAddress: text(),
    carrierName: text(),
    carrierBranch: text(),
    note: text(),
    currency: text().notNull().default('TRY'),
    grossTotal: money().notNull(),
    discountTotal: money().notNull(),
    netTotal: money().notNull(),
    vatTotal: money().notNull(),
    grandTotal: money().notNull(),
    transferStatus: transferStatus().notNull().default('pending'),
    bizimhesapGuid: text(),
    transferError: text(),
    transferredAt: timestamp({ withTimezone: true }),
    submittedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
}, (t) => [
    uniqueIndex('orders_order_no_uq').on(t.orderNo),
    index('orders_dealer_idx').on(t.dealerId, t.submittedAt),
    index('orders_status_idx').on(t.status),
    index('orders_submitted_at_idx').on(t.submittedAt),
    check('orders_carrier_requires_address', sql `${t.deliveryMethod} <> 'carrier' OR (
        length(trim(coalesce(${t.deliveryAddress}, ''))) > 0
        AND length(trim(coalesce(${t.carrierName}, ''))) > 0
        AND length(trim(coalesce(${t.carrierBranch}, ''))) > 0
      )`),
    check('orders_totals_consistent', sql `${t.netTotal} = ${t.grossTotal} - ${t.discountTotal}
        AND ${t.grandTotal} = ${t.netTotal} + ${t.vatTotal}`),
]);
export const orderLines = pgTable('order_lines', {
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
    discountPercent: percent().notNull().default('0'),
    grossAmount: money().notNull(),
    discountAmount: money().notNull(),
    netAmount: money().notNull(),
    vatRate: percent().notNull(),
    vatAmount: money().notNull(),
    outOfStockAtOrder: boolean().notNull().default(false),
}, (t) => [
    uniqueIndex('order_lines_order_line_uq').on(t.orderId, t.lineNo),
    index('order_lines_product_idx').on(t.productId),
    check('order_lines_quantity_positive', sql `${t.quantity} > 0`),
    check('order_lines_case_multiple', sql `${t.quantity} % ${t.caseQuantity} = 0`),
    check('order_lines_discount_range', sql `${t.discountPercent} >= 0 AND ${t.discountPercent} < 100`),
    check('order_lines_amounts_consistent', sql `${t.netAmount} = ${t.grossAmount} - ${t.discountAmount}`),
]);
export const orderStatusHistory = pgTable('order_status_history', {
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
}, (t) => [
    index('order_status_history_order_idx').on(t.orderId, t.createdAt),
    check('order_status_history_admin_has_user', sql `${t.source} <> 'admin' OR ${t.changedBy} IS NOT NULL`),
]);
export const auditLog = pgTable('audit_log', {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    actorType: actorType().notNull(),
    actorId: uuid(),
    action: text().notNull(),
    entityType: text().notNull(),
    entityId: text().notNull(),
    reason: text(),
    data: jsonb(),
    createdAt: createdAt(),
}, (t) => [
    index('audit_log_entity_idx').on(t.entityType, t.entityId, t.createdAt),
    index('audit_log_created_at_idx').on(t.createdAt),
]);
//# sourceMappingURL=schema.js.map