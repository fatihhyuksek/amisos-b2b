// Backend istemcisi. Oturum httpOnly çerezle tutulur (GR-BAYI-007, K-29).

export type UserType = 'admin' | 'dealer'

export interface AuthUser {
  type: UserType
  id: string
  email: string
  name: string
}

/** Sunucu hata gövdesindeki message gösterilmez; yalnızca durum kodu kullanılır. */
export class ApiError extends Error {
  readonly status: number
  /** Sunucunun makine okunur hata kodu (ör. DUPLICATE_APPLICATION, INVALID_STATE, VALIDATION). */
  readonly code?: string
  /** VALIDATION hatasında alan adı → mesaj. */
  readonly fields?: Record<string, string>
  constructor(status: number, code?: string, fields?: Record<string, string>) {
    super(`HTTP ${status}`)
    this.status = status
    this.code = code
    this.fields = fields
  }
}

async function toError(res: Response): Promise<ApiError> {
  let code: string | undefined
  let fields: Record<string, string> | undefined
  try {
    const body = (await res.json()) as { code?: unknown; fields?: unknown }
    if (typeof body.code === 'string') code = body.code
    if (body.fields && typeof body.fields === 'object') fields = body.fields as Record<string, string>
  } catch {
    /* gövde JSON değil */
  }
  return new ApiError(res.status, code, fields)
}

async function send(method: string, path: string, body?: unknown): Promise<Response> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw await toError(res)
  return res
}

const post = (path: string, body?: unknown) => send('POST', path, body)
const put = (path: string, body?: unknown) => send('PUT', path, body)

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`/api${path}`, { credentials: 'include', signal })
  if (!res.ok) throw await toError(res)
  return (await res.json()) as T
}

/** Oturum yoksa null döner; başka hatalarda ApiError / ağ hatası fırlatır. */
export async function fetchMe(signal?: AbortSignal): Promise<AuthUser | null> {
  const res = await fetch('/api/auth/me', { credentials: 'include', signal })
  if (res.status === 401) return null
  if (!res.ok) throw new ApiError(res.status)
  return (await res.json()) as AuthUser
}

export async function login(type: UserType, email: string, password: string): Promise<void> {
  await post(`/auth/${type}/login`, { email, password })
}

export async function logout(): Promise<void> {
  await post('/auth/logout')
}

export async function requestPasswordReset(email: string, type: UserType): Promise<void> {
  await post('/auth/password-reset/request', { email, type })
}

export async function confirmPasswordReset(token: string, password: string): Promise<void> {
  await post('/auth/password-reset/confirm', { token, password })
}

export async function verifyEmail(token: string): Promise<void> {
  await post('/auth/email/verify', { token })
}

// ---------- Bayi başvurusu ve Admin bayi yönetimi (docs/api/bayi-hesabi-api.md) ----------

export interface DealerInput {
  companyTitle: string
  contactName: string
  email: string
  phone: string
  city: string
  district: string
  address: string
}

export interface ApplicationInput extends DealerInput {
  consents: { kvkk: boolean; terms: boolean; marketing: boolean }
}

export type DealerStatus = 'pending_email' | 'pending_approval' | 'active' | 'rejected' | 'passive'

export interface DealerSummary {
  id: string
  companyTitle: string
  contactName: string
  email: string
  phone: string
  city: string
  district: string
  status: DealerStatus
  source: 'application' | 'invitation'
  hasPassword: boolean
  generalDiscountPercent: string | null
  createdAt: string
  reviewedAt: string | null
  lastLoginAt: string | null
  approvalOverdue: boolean
}

export interface DealerDetail extends DealerSummary {
  address: string
  emailVerifiedAt: string | null
  rejectionReason: string | null
  consents: { type: string; granted: boolean; documentVersion: string; createdAt: string }[]
  history: { action: string; reason: string | null; actor: string | null; createdAt: string }[]
}

export interface DealerList {
  items: DealerSummary[]
  total: number
  page: number
  pageSize: number
}

export interface DealerCounts {
  pendingApproval: number
  overdue: number
  pendingEmail: number
  active: number
  passive: number
}

export async function submitApplication(input: ApplicationInput): Promise<void> {
  await post('/applications', input)
}

export async function acceptInvitation(
  token: string,
  password: string,
  consents: ApplicationInput['consents'],
): Promise<void> {
  await post('/auth/invitation/accept', { token, password, consents })
}

export function fetchDealerSummary(signal?: AbortSignal): Promise<DealerCounts> {
  return getJson('/admin/dealers/summary', signal)
}

export function fetchDealers(
  params: { status: DealerStatus | ''; q: string; page: number; pageSize: number },
  signal?: AbortSignal,
): Promise<DealerList> {
  const qs = new URLSearchParams()
  if (params.status) qs.set('status', params.status)
  if (params.q) qs.set('q', params.q)
  qs.set('page', String(params.page))
  qs.set('pageSize', String(params.pageSize))
  return getJson(`/admin/dealers?${qs.toString()}`, signal)
}

export function fetchDealer(id: string, signal?: AbortSignal): Promise<DealerDetail> {
  return getJson(`/admin/dealers/${encodeURIComponent(id)}`, signal)
}

export async function createDealer(input: DealerInput): Promise<DealerSummary> {
  const res = await post('/admin/dealers', input)
  return (await res.json()) as DealerSummary
}

const dealerPath = (id: string) => `/admin/dealers/${encodeURIComponent(id)}`

export async function approveDealer(id: string): Promise<void> {
  await post(`${dealerPath(id)}/approve`)
}
export async function rejectDealer(id: string, reason: string): Promise<void> {
  await post(`${dealerPath(id)}/reject`, { reason })
}
export async function deactivateDealer(id: string, reason: string): Promise<void> {
  await post(`${dealerPath(id)}/deactivate`, { reason })
}
export async function activateDealer(id: string, reason?: string): Promise<void> {
  await post(`${dealerPath(id)}/activate`, reason ? { reason } : {})
}
export async function resendInvitation(id: string): Promise<void> {
  await post(`${dealerPath(id)}/resend-invitation`)
}
export async function updateDealerTerms(id: string, generalDiscountPercent: string | null): Promise<void> {
  await send('PATCH', `${dealerPath(id)}/terms`, { generalDiscountPercent })
}

// ---------- Katalog, görsel kütüphanesi, iskonto (docs/api/katalog-api.md) ----------

const del = (path: string) => send('DELETE', path)

/** multipart gönderimi: Content-Type'ı tarayıcı sınır (boundary) ile birlikte koyar. */
async function sendForm(path: string, form: FormData): Promise<Response> {
  const res = await fetch(`/api${path}`, { method: 'POST', credentials: 'include', body: form })
  if (!res.ok) throw await toError(res)
  return res
}

export interface Paged<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

function qsOf(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v))
  const s = qs.toString()
  return s ? `?${s}` : ''
}

// Görsel kütüphanesi (K-61, K-62)
export interface Media {
  id: string
  filename: string
  url: string
  thumbUrl: string
  width: number
  height: number
  size: number
  usedBy: number
  createdAt: string
}

export interface UploadResult {
  items: Media[]
  errors: { filename: string; message: string }[]
}

export function fetchMedia(
  params: { q?: string; unused?: boolean; page: number; pageSize: number },
  signal?: AbortSignal,
): Promise<Paged<Media>> {
  return getJson(
    `/admin/media${qsOf({ q: params.q, unused: params.unused ? 'true' : undefined, page: params.page, pageSize: params.pageSize })}`,
    signal,
  )
}

export async function uploadMedia(files: File[]): Promise<UploadResult> {
  const form = new FormData()
  for (const f of files) form.append('files', f)
  return (await (await sendForm('/admin/media', form)).json()) as UploadResult
}

export async function deleteMedia(id: string): Promise<void> {
  await del(`/admin/media/${encodeURIComponent(id)}`)
}

// Ürün grupları
export interface ProductGroup {
  id: string
  name: string
  sortOrder: number
  isActive: boolean
  productCount: number
}

export function fetchProductGroups(signal?: AbortSignal): Promise<ProductGroup[]> {
  return getJson('/admin/product-groups', signal)
}

export async function createProductGroup(name: string, sortOrder?: number): Promise<ProductGroup> {
  const res = await post('/admin/product-groups', { name, sortOrder })
  return (await res.json()) as ProductGroup
}

export async function updateProductGroup(
  id: string,
  patch: { name?: string; sortOrder?: number; isActive?: boolean },
): Promise<ProductGroup> {
  const res = await send('PATCH', `/admin/product-groups/${encodeURIComponent(id)}`, patch)
  return (await res.json()) as ProductGroup
}

export async function deleteProductGroup(id: string): Promise<void> {
  await del(`/admin/product-groups/${encodeURIComponent(id)}`)
}

// Ürünler (Admin)
export type StockStatus = 'in_stock' | 'out_of_stock'

export interface ProductImage {
  url: string
  thumbUrl: string
}

export interface AdminProduct {
  id: string
  groupId: string
  groupName: string
  barcode: string
  code: string | null
  name: string
  description: string | null
  caseQuantity: number
  listPrice: string
  vatRate: string
  stockStatus: StockStatus
  isActive: boolean
  images: (ProductImage & { mediaId: string; sortOrder: number })[]
  createdAt: string
  updatedAt: string
}

export interface ProductInput {
  groupId: string
  barcode: string
  code: string | null
  name: string
  description: string | null
  caseQuantity: number
  listPrice: string
  vatRate: string
  stockStatus: StockStatus
  isActive: boolean
  mediaIds: string[]
}

export function fetchAdminProducts(
  params: { q?: string; groupId?: string; stock?: string; active?: string; page: number; pageSize: number },
  signal?: AbortSignal,
): Promise<Paged<AdminProduct>> {
  return getJson(`/admin/products${qsOf(params)}`, signal)
}

export function fetchAdminProduct(id: string, signal?: AbortSignal): Promise<AdminProduct> {
  return getJson(`/admin/products/${encodeURIComponent(id)}`, signal)
}

export async function createProduct(input: ProductInput): Promise<AdminProduct> {
  return (await (await post('/admin/products', input)).json()) as AdminProduct
}

export async function updateProduct(id: string, patch: Partial<ProductInput>): Promise<AdminProduct> {
  const res = await send('PATCH', `/admin/products/${encodeURIComponent(id)}`, patch)
  return (await res.json()) as AdminProduct
}

export interface ImportReport {
  total: number
  created: number
  updated: number
  /** Dosyadaki değerleri mevcutla aynı olan, değişmeyecek ürünler. */
  unchanged: number
  groupsCreated: string[]
  errors: { row: number; column: string; message: string }[]
  warnings: { row: number; message: string }[]
}

/** Şablonu blob olarak indirir (K-59). */
export async function fetchImportTemplate(): Promise<Blob> {
  const res = await fetch('/api/admin/products/import-template', { credentials: 'include' })
  if (!res.ok) throw await toError(res)
  return res.blob()
}

/** dryRun=false iken hata varsa 422 aynı rapor gövdesiyle döner; rapor olarak iletilir. */
export async function importProducts(file: File, dryRun: boolean): Promise<ImportReport> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`/api/admin/products/import?dryRun=${dryRun}`, {
    method: 'POST',
    credentials: 'include',
    body: form,
  })
  if (res.status === 422) {
    try {
      const body = (await res.json()) as Partial<ImportReport>
      if (Array.isArray(body.errors)) {
        return {
          total: body.total ?? 0,
          created: body.created ?? 0,
          updated: body.updated ?? 0,
          unchanged: body.unchanged ?? 0,
          groupsCreated: body.groupsCreated ?? [],
          errors: body.errors,
          warnings: body.warnings ?? [],
        }
      }
    } catch {
      /* gövde okunamadı */
    }
    throw new ApiError(422)
  }
  if (!res.ok) throw await toError(res)
  const body = (await res.json()) as ImportReport
  return { ...body, unchanged: body.unchanged ?? 0, warnings: body.warnings ?? [] }
}

// Bayi grup iskontoları (K-12, K-13)
export interface GroupDiscount {
  groupId: string
  groupName: string
  discountPercent: string | null
}

export function fetchGroupDiscounts(dealerId: string, signal?: AbortSignal): Promise<GroupDiscount[]> {
  return getJson(`${dealerPath(dealerId)}/group-discounts`, signal)
}

export async function saveGroupDiscounts(
  dealerId: string,
  items: { groupId: string; discountPercent: string }[],
): Promise<void> {
  await send('PUT', `${dealerPath(dealerId)}/group-discounts`, { items })
}

// Bayi kataloğu (K-40)
export interface CatalogProduct {
  id: string
  name: string
  barcode: string
  code: string | null
  description: string | null
  groupId: string
  groupName: string
  caseQuantity: number
  stock: StockStatus
  listPrice: string
  price: string
  discountPercent: string | null
  vatRate: string
  images: ProductImage[]
}

export interface CatalogGroup {
  id: string
  name: string
  productCount: number
  /** Grubun kapak küçük resmi (ilk görselli ürün); yoksa null/eksik. */
  thumbUrl?: string | null
}

export function fetchCatalogGroups(signal?: AbortSignal): Promise<CatalogGroup[]> {
  return getJson('/catalog/groups', signal)
}

export function fetchCatalogProducts(
  params: {
    q?: string
    groupId?: string
    sort?: 'newest'
    stock?: 'in_stock'
    page: number
    pageSize: number
  },
  signal?: AbortSignal,
): Promise<Paged<CatalogProduct>> {
  return getJson(`/catalog/products${qsOf(params)}`, signal)
}

export function fetchCatalogProduct(id: string, signal?: AbortSignal): Promise<CatalogProduct> {
  return getJson(`/catalog/products/${encodeURIComponent(id)}`, signal)
}

// ---------- Sepet ve ön sipariş (docs/api/siparis-api.md) ----------
// Tutarlar metin olarak gelir ve olduğu gibi gösterilir; arayüzde hesap yapılmaz.

export interface CartLine {
  productId: string
  barcode: string
  code: string | null
  name: string
  thumbUrl: string | null
  quantity: number
  caseQuantity: number
  stock: StockStatus
  listPrice: string
  discountPercent: string | null
  unitPrice: string
  lineGross: string
  lineDiscount: string
  lineNet: string
  vatRate: string
  lineVat: string
}

export interface MoneySummary {
  grossTotal: string
  discountTotal: string
  netTotal: string
  vatTotal: string
  grandTotal: string
}

export interface CartAdjusted {
  productId: string
  name: string
  from: number
  to: number
  caseQuantity: number
}

export interface Cart {
  /** Sepet sürümü; sipariş gönderirken expectedVersion olarak geri gönderilir. */
  version: string
  lines: CartLine[]
  summary: MoneySummary
  warnings: { code: string; productId: string; name: string }[]
  removed: { productId: string; name: string }[]
  adjusted: CartAdjusted[]
}

export function fetchCart(signal?: AbortSignal): Promise<Cart> {
  return getJson('/cart', signal)
}

/** Ekler veya miktarı değiştirir (0 = kaldırır). Koli katı değilse 400 CASE_MULTIPLE. */
export async function putCartItem(productId: string, quantity: number): Promise<Cart> {
  return (await (await put(`/cart/items/${encodeURIComponent(productId)}`, { quantity })).json()) as Cart
}

export async function deleteCartItem(productId: string): Promise<Cart> {
  return (await (await del(`/cart/items/${encodeURIComponent(productId)}`)).json()) as Cart
}

export async function clearCartApi(): Promise<void> {
  await del('/cart')
}

export interface CheckoutDefaults {
  address: string
  lastCarrier: { name: string; branch: string } | null
}

export function fetchCheckoutDefaults(signal?: AbortSignal): Promise<CheckoutDefaults> {
  return getJson('/cart/checkout-defaults', signal)
}

export type DeliveryMethod = 'carrier' | 'pickup' | 'truck'

export interface OrderInput {
  deliveryMethod: DeliveryMethod
  deliveryAddress?: string
  carrierName?: string
  carrierBranch?: string
  note?: string
  expectedTotal: string
  expectedVersion: string
}

/** 409 PRICE_CHANGED gövdesindeki güncel sepeti de taşır. */
export class PriceChangedError extends ApiError {
  readonly cart: Cart
  constructor(cart: Cart) {
    super(409, 'PRICE_CHANGED')
    this.cart = cart
  }
}

export async function submitOrder(input: OrderInput): Promise<{ id: string; orderNo: number }> {
  const res = await fetch('/api/orders', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (res.status === 409) {
    try {
      const body = (await res.clone().json()) as { code?: string; cart?: Cart }
      if (body.code === 'PRICE_CHANGED' && body.cart) throw new PriceChangedError(body.cart)
    } catch (err) {
      if (err instanceof PriceChangedError) throw err
    }
  }
  if (!res.ok) throw await toError(res)
  return (await res.json()) as { id: string; orderNo: number }
}

export type OrderStatusValue =
  | 'submitted'
  | 'negotiating'
  | 'approved'
  | 'shipped'
  | 'delivered'
  | 'cancelled'

export interface OrderListItem {
  id: string
  orderNo: number
  submittedAt: string
  status: OrderStatusValue
  netTotal: string
  grandTotal: string
  lineCount: number
}

export interface OrderLine {
  lineNo: number
  productId: string
  barcode: string
  code: string | null
  name: string
  quantity: number
  caseQuantity: number
  listPrice: string
  discountPercent: string | null
  unitPrice: string
  lineGross: string
  lineDiscount: string
  lineNet: string
  vatRate: string
  lineVat: string
  outOfStock: boolean
}

export interface OrderDetail {
  id: string
  orderNo: number
  status: OrderStatusValue
  submittedAt: string
  deliveryMethod: DeliveryMethod
  deliveryAddress: string | null
  carrierName: string | null
  carrierBranch: string | null
  note: string | null
  lines: OrderLine[]
  summary: MoneySummary
  history: {
    fromStatus: OrderStatusValue | null
    toStatus: OrderStatusValue
    source: string
    /** Bayiye görünür Admin notu (K-26). */
    note?: string | null
    createdAt: string
  }[]
}

export function fetchOrders(
  params: { page: number; pageSize: number },
  signal?: AbortSignal,
): Promise<Paged<OrderListItem>> {
  return getJson(`/orders${qsOf(params)}`, signal)
}

export function fetchOrder(id: string, signal?: AbortSignal): Promise<OrderDetail> {
  return getJson(`/orders/${encodeURIComponent(id)}`, signal)
}

export interface ReorderResult {
  cart: Cart
  added: { productId: string; name: string; quantity: number }[]
  skipped: {
    productId: string
    name: string
    barcode: string
    reason: 'INACTIVE' | 'QUANTITY_LIMIT' | string
  }[]
  adjusted: CartAdjusted[]
}

export async function reorder(id: string): Promise<ReorderResult> {
  return (await (await post(`/orders/${encodeURIComponent(id)}/reorder`)).json()) as ReorderResult
}

// ---------- Kampanya görselleri / banner (docs/api/banner-api.md, K-65) ----------

export interface ShopBanner {
  id: string
  title: string
  subtitle: string | null
  linkPath: string | null
  imageUrl: string
  thumbUrl: string
}

export function fetchShopBanners(signal?: AbortSignal): Promise<ShopBanner[]> {
  return getJson('/catalog/banners', signal)
}

export interface AdminBanner extends ShopBanner {
  mediaId: string
  sortOrder: number
  isActive: boolean
  startsAt: string | null
  endsAt: string | null
  createdAt: string
  updatedAt: string
}

export interface BannerInput {
  mediaId: string
  title: string
  subtitle: string | null
  linkPath: string | null
  isActive: boolean
  startsAt: string | null
  endsAt: string | null
}

export function fetchAdminBanners(signal?: AbortSignal): Promise<AdminBanner[]> {
  return getJson('/admin/banners', signal)
}

export async function createBanner(input: BannerInput): Promise<AdminBanner> {
  return (await (await post('/admin/banners', input)).json()) as AdminBanner
}

export async function updateBanner(id: string, patch: Partial<BannerInput>): Promise<AdminBanner> {
  return (await (
    await send('PATCH', `/admin/banners/${encodeURIComponent(id)}`, patch)
  ).json()) as AdminBanner
}

export async function deleteBanner(id: string): Promise<void> {
  await del(`/admin/banners/${encodeURIComponent(id)}`)
}

export async function reorderBanners(ids: string[]): Promise<AdminBanner[]> {
  return (await (await put('/admin/banners/order', { ids })).json()) as AdminBanner[]
}

// ---------- Bildirimler / e-posta outbox (docs/api/siparis-api.md, GR-BLD-001) ----------

export type NotificationStatus = 'pending' | 'sent' | 'failed'

export type NotificationKind =
  | 'order_confirmation'
  | 'new_order_team'
  | 'new_application'
  | 'invitation'
  | 'rejection'
  | 'password_reset'
  | 'email_verification'
  | 'approval_reminder'

export interface AdminNotification {
  id: string
  kind: NotificationKind
  recipient: string
  status: NotificationStatus
  attempts: number
  lastError: string | null
  nextAttemptAt: string | null
  createdAt: string
  sentAt: string | null
}

export function fetchNotifications(
  params: { status: NotificationStatus; page: number; pageSize: number },
  signal?: AbortSignal,
): Promise<Paged<AdminNotification>> {
  return getJson(`/admin/notifications${qsOf(params)}`, signal)
}

export async function retryNotification(id: string): Promise<AdminNotification> {
  return (await (
    await post(`/admin/notifications/${encodeURIComponent(id)}/retry`)
  ).json()) as AdminNotification
}

// ---------- Admin sipariş yönetimi (docs/api/admin-siparis-api.md) ----------

/** pending/manual: girilmedi; transferred: girildi; failed: entegrasyon aktarımı başarısız. */
export type TransferStatus = 'pending' | 'transferred' | 'failed' | 'manual'

export interface AdminOrderListItem {
  id: string
  orderNo: number
  submittedAt: string
  status: OrderStatusValue
  dealer: { id: string; companyTitle: string }
  lineCount: number
  netTotal: string
  grandTotal: string
  deliveryMethod: DeliveryMethod
  transferStatus: TransferStatus
  hasOutOfStock: boolean
}

export interface AdminOrderFilters {
  status?: OrderStatusValue | ''
  q?: string
  transfer?: 'pending' | 'transferred' | ''
  from?: string
  to?: string
  dealerId?: string
}

export interface AdminOrderSummary {
  submitted: number
  negotiating: number
  approved: number
  shipped: number
  notTransferred: number
}

export interface AdminOrderDetail extends Omit<OrderDetail, 'history'> {
  dealer: {
    id: string
    companyTitle: string
    contactName: string
    email: string
    phone: string
    city: string
    district: string
    address: string
  }
  allowedNextStatuses: OrderStatusValue[]
  history: {
    fromStatus: OrderStatusValue | null
    toStatus: OrderStatusValue
    source: 'system' | 'admin' | 'bizimhesap'
    changedBy: { id: string; fullName: string } | null
    note: string | null
    createdAt: string
  }[]
  transfer: {
    status: TransferStatus
    reference: string | null
    transferredAt: string | null
    transferredBy: { id: string; fullName: string } | null
  }
}

export function fetchAdminOrders(
  params: AdminOrderFilters & { page: number; pageSize: number },
  signal?: AbortSignal,
): Promise<Paged<AdminOrderListItem>> {
  return getJson(`/admin/orders${qsOf({ ...params })}`, signal)
}

export function fetchAdminOrderSummary(signal?: AbortSignal): Promise<AdminOrderSummary> {
  return getJson('/admin/orders/summary', signal)
}

export function fetchAdminOrder(id: string, signal?: AbortSignal): Promise<AdminOrderDetail> {
  return getJson(`/admin/orders/${encodeURIComponent(id)}`, signal)
}

export async function changeOrderStatus(
  id: string,
  status: OrderStatusValue,
  note?: string,
): Promise<AdminOrderDetail> {
  const body = note ? { status, note } : { status }
  return (await (
    await post(`/admin/orders/${encodeURIComponent(id)}/status`, body)
  ).json()) as AdminOrderDetail
}

export async function markOrderTransferred(id: string, reference?: string): Promise<AdminOrderDetail> {
  const body = reference ? { reference } : {}
  return (await (
    await post(`/admin/orders/${encodeURIComponent(id)}/transfer`, body)
  ).json()) as AdminOrderDetail
}

export async function unmarkOrderTransferred(id: string): Promise<AdminOrderDetail> {
  return (await (await del(`/admin/orders/${encodeURIComponent(id)}/transfer`)).json()) as AdminOrderDetail
}

/** Excel dosyasını blob olarak indirir (tek sipariş veya liste). */
export async function downloadOrdersExcel(
  target: { orderId: string } | { filters: AdminOrderFilters },
): Promise<{ blob: Blob; filename: string | null }> {
  const path =
    'orderId' in target
      ? `/admin/orders/${encodeURIComponent(target.orderId)}/export.xlsx`
      : `/admin/orders/export.xlsx${qsOf({ ...target.filters })}`
  const res = await fetch(`/api${path}`, { credentials: 'include' })
  if (!res.ok) throw await toError(res)
  const cd = res.headers.get('content-disposition') ?? ''
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd)
  return { blob: await res.blob(), filename: m ? decodeURIComponent(m[1]) : null }
}
