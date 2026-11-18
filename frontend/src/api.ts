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

/** GET ile dosya indirir (Excel); dosya adı Content-Disposition başlığından alınır. */
export async function downloadFile(path: string): Promise<{ blob: Blob; filename: string | null }> {
  const res = await fetch(`/api${path}`, { credentials: 'include' })
  if (!res.ok) throw await toError(res)
  const cd = res.headers.get('content-disposition') ?? ''
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd)
  return { blob: await res.blob(), filename: m ? decodeURIComponent(m[1]) : null }
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
  /** İsteğe bağlı (K-68). */
  taxOffice?: string
  taxNumber?: string
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
  taxOffice?: string | null
  taxNumber?: string | null
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
  /** Adres parçası (K-82); eski sunucuda olmayabilir. */
  slug?: string
  description?: string | null
  seoTitle?: string | null
  seoDescription?: string | null
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
  patch: {
    name?: string
    sortOrder?: number
    isActive?: boolean
    slug?: string
    description?: string | null
    seoTitle?: string | null
    seoDescription?: string | null
  },
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
  /** Ana sayfada "Öne çıkan ürünler"de gösterilir (K-74). */
  isFeatured?: boolean
  /** Adres parçası, arama başlığı/açıklaması (K-82) ve BizimHesap ürün kimliği (K-80). */
  slug?: string
  seoTitle?: string | null
  seoDescription?: string | null
  bizimhesapId?: string | null
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
  isFeatured?: boolean
  slug?: string
  seoTitle?: string | null
  seoDescription?: string | null
  bizimhesapId?: string | null
  mediaIds: string[]
}

export function fetchAdminProducts(
  params: {
    q?: string
    groupId?: string
    stock?: string
    active?: string
    featured?: string
    priceMissing?: string
    page: number
    pageSize: number
  },
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

// Bayi kataloğu (K-40) ve açık vitrin (K-66)
/**
 * Oturumsuz ve Admin oturumunda fiyat, iskonto, KDV ve stok alanları null gelir (K-66);
 * arayüz bu durumda fiyat yerine "giriş yapın" bağlantısı gösterir.
 */
export interface CatalogProduct {
  id: string
  name: string
  barcode: string
  code: string | null
  description: string | null
  groupId: string
  groupName: string
  caseQuantity: number
  stock: StockStatus | null
  listPrice: string | null
  price: string | null
  discountPercent: string | null
  vatRate: string | null
  images: ProductImage[]
  isFavorite: boolean
  isFeatured: boolean
  isNew: boolean
  /** K-86: son 90 günde en çok satan ilk 20 ürün; eski sunucuda olmayabilir. */
  isBestSeller: boolean
  /** K-79: liste fiyatı girilmemiş; fiyat yerine "Fiyat için bize ulaşın" gösterilir. */
  priceOnRequest: boolean
  /** Adres parçası (K-82); eski sunucuda olmayabilir. */
  slug: string | null
  seoTitle: string | null
  seoDescription: string | null
}

export interface CatalogGroup {
  id: string
  name: string
  productCount: number
  slug?: string | null
  description?: string | null
  seoTitle?: string | null
  seoDescription?: string | null
  /** Grubun kapak küçük resmi (ilk görselli ürün); yoksa null/eksik. */
  thumbUrl?: string | null
}

export function fetchCatalogGroups(signal?: AbortSignal): Promise<CatalogGroup[]> {
  return getJson('/catalog/groups', signal)
}

/** Sözleşmede alan adı `stockStatus`; mevcut uç `stock` döndürüyordu. İkisi de kabul edilir. */
function normalizeProduct(raw: Record<string, unknown>): CatalogProduct {
  const r = raw as Partial<CatalogProduct> & { stockStatus?: StockStatus | null }
  return {
    id: r.id as string,
    name: r.name as string,
    barcode: r.barcode as string,
    code: r.code ?? null,
    description: r.description ?? null,
    groupId: r.groupId as string,
    groupName: r.groupName as string,
    caseQuantity: r.caseQuantity as number,
    stock: r.stock ?? r.stockStatus ?? null,
    listPrice: r.listPrice ?? null,
    price: r.price ?? null,
    discountPercent: r.discountPercent ?? null,
    vatRate: r.vatRate ?? null,
    images: r.images ?? [],
    isFavorite: r.isFavorite ?? false,
    isFeatured: r.isFeatured ?? false,
    isNew: r.isNew ?? false,
    isBestSeller: r.isBestSeller ?? false,
    priceOnRequest: r.priceOnRequest ?? false,
    slug: r.slug ?? null,
    seoTitle: r.seoTitle ?? null,
    seoDescription: r.seoDescription ?? null,
  }
}

export interface CatalogList extends Paged<CatalogProduct> {
  priceVisible: boolean
}

export async function fetchCatalogProducts(
  params: {
    q?: string
    groupId?: string
    sort?: 'newest' | 'popular'
    stock?: 'in_stock'
    featured?: boolean
    isNew?: boolean
    /** K-86: verilen ürün kimlikleri, verilen sırayla (en çok 24). */
    ids?: string[]
    page: number
    pageSize: number
  },
  signal?: AbortSignal,
): Promise<CatalogList> {
  const { featured, isNew, ids, ...rest } = params
  const body = await getJson<Paged<Record<string, unknown>> & { priceVisible?: boolean }>(
    `/catalog/products${qsOf({ ...rest, ids: ids?.join(','), featured: featured ? 'true' : undefined, new: isNew ? 'true' : undefined })}`,
    signal,
  )
  const items = body.items.map(normalizeProduct)
  return {
    ...body,
    items,
    priceVisible: body.priceVisible ?? items.some((p) => p.price !== null),
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Ürün adresi parçası slug ya da (eski bağlantılar için) kimliktir (K-82).
 * Eski slug ise sunucu `redirectTo` döner; `redirectTo` doluysa ürün yerine yeni slug verilir.
 */
export async function fetchCatalogProductByRef(
  ref: string,
  signal?: AbortSignal,
): Promise<{ product: CatalogProduct } | { redirectTo: string }> {
  if (UUID_RE.test(ref)) {
    return {
      product: normalizeProduct(await getJson(`/catalog/products/${encodeURIComponent(ref)}`, signal)),
    }
  }
  const body = await getJson<Record<string, unknown> & { redirectTo?: string }>(
    `/catalog/products/by-slug/${encodeURIComponent(ref)}`,
    signal,
  )
  if (typeof body.redirectTo === 'string') return { redirectTo: body.redirectTo }
  return { product: normalizeProduct(body) }
}

export async function fetchCatalogGroupBySlug(slug: string, signal?: AbortSignal): Promise<CatalogGroup> {
  return getJson(`/catalog/groups/by-slug/${encodeURIComponent(slug)}`, signal)
}

/** Bayi kendine özel net fiyatlı fiyat listesini Excel olarak indirir (K-72). */
export function downloadPriceList(): Promise<{ blob: Blob; filename: string | null }> {
  return downloadFile('/catalog/price-list.xlsx')
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
  /** K-79: fiyat sonradan kaldırılmış; satır gönderilemez. */
  priceOnRequest?: boolean
  slug?: string | null
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
  /** Yalnızca Admin iç notlarının sayısı (K-78). */
  internalNoteCount?: number
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

// ---------- Raporlar (docs/api/rapor-api.md; GR-RAP-001…003, K-46 – K-50) ----------
// Tüm tutar, yüzde ve fark değerleri backend'den hazır gelir; arayüz hesaplamaz.

/** Tutar metriklerinde `amount` metin ("123.45"), sayı metriklerinde sayı gelir; `percent` sayıdır. */
export interface ReportChange<A = string> {
  amount: A
  /** Önceki değer 0 ise null. */
  percent: number | null
}

export interface Comparable<T = string> {
  current: T
  previous: T
  lastYear: T
  changePrev: ReportChange<T>
  changeYear: ReportChange<T>
}

export interface ReportRange {
  from: string
  to: string
}

export interface ReportOverview {
  period: ReportRange
  previous: ReportRange
  lastYear: ReportRange
  metrics: {
    orderCount: Comparable<number>
    netTotal: Comparable
    vatTotal: Comparable
    grandTotal: Comparable
    orderingDealerCount: Comparable<number>
    averageOrderNet: Comparable
  }
}

export interface ReportTrendPoint {
  month: string
  orderCount: number
  netTotal: string
  lastYearNetTotal: string
}

export interface ReportOrderRow {
  id: string
  orderNo: number
  submittedAt: string
  dealer: { id: string; companyTitle: string }
  status: OrderStatusValue
  lineCount: number
  netTotal: string
  grandTotal: string
}

export interface ReportOrders extends Paged<ReportOrderRow> {
  totals: { orderCount: number; netTotal: string; grandTotal: string }
}

export interface ReportDealerRow {
  dealerId: string
  companyTitle: string
  city: string
  orderCount: number
  netTotal: Comparable
  grandTotal: string
  lastOrderAt: string
}

export interface ReportDealerProduct {
  productId: string
  barcode: string
  name: string
  groupName: string
  quantity: number
  netTotal: string
}

export interface ReportInactiveDealer {
  dealerId: string
  companyTitle: string
  contactName: string
  phone: string
  city: string
  lastOrderAt: string | null
  daysSinceLastOrder: number | null
  approvedAt: string | null
}

export interface ReportProductRow {
  productId: string
  barcode: string
  code: string | null
  name: string
  groupName: string
  quantity: number
  orderCount: number
  dealerCount: number
  netTotal: string
}

export interface ReportGroupRow {
  groupId: string
  name: string
  quantity: number
  netTotal: Comparable
  sharePercent: number
}

export interface ReportStatusRow {
  status: OrderStatusValue
  /** Türkçe durum adı (sunucudan). */
  label: string
  count: number
  averageHoursInStatus: number | null
}

export interface ReportOutOfStockRow {
  productId: string
  barcode: string
  name: string
  groupName: string
  quantity: number
  orderCount: number
  dealerCount: number
  lastOrderedAt: string
}

export interface ReportToday {
  today: { orderCount: number; netTotal: string }
  month: { orderCount: number; netTotal: string }
  pendingApplications: number
  overdueApplications: number
  newOrders: number
  failedNotifications: number
}

export type ReportName =
  | 'overview'
  | 'trend'
  | 'orders'
  | 'dealers'
  | 'products'
  | 'groups'
  | 'status'
  | 'out-of-stock'
  | 'inactive-dealers'

type ReportParams = Record<string, string | number | undefined>

export function fetchReport<T>(name: string, params: ReportParams, signal?: AbortSignal): Promise<T> {
  return getJson(`/admin/reports/${name}${qsOf(params)}`, signal)
}

/**
 * Liste raporları backend'de `{ period, ..., items }` biçiminde döner (docs/api/rapor-api.md);
 * ekranlar yalnızca satırları kullanır. Düz dizi gelirse olduğu gibi döner.
 */
export async function fetchReportList<T>(
  name: string,
  params: ReportParams,
  signal?: AbortSignal,
): Promise<T[]> {
  const body = await getJson<T[] | { items: T[] }>(`/admin/reports/${name}${qsOf(params)}`, signal)
  return Array.isArray(body) ? body : body.items
}

/** Rapor Excel'ini aynı parametrelerle blob olarak indirir. */
export async function downloadReportExcel(
  name: ReportName,
  params: ReportParams,
): Promise<{ blob: Blob; filename: string | null }> {
  const res = await fetch(`/api/admin/reports/${name}/export.xlsx${qsOf(params)}`, { credentials: 'include' })
  if (!res.ok) throw await toError(res)
  const cd = res.headers.get('content-disposition') ?? ''
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd)
  return { blob: await res.blob(), filename: m ? decodeURIComponent(m[1]) : null }
}

// ---------- Site ayarları ve bilgi sayfaları (docs/api/vitrin-hesap-api.md §2, K-73) ----------

export type PageSlug = 'hakkimizda' | 'sss' | 'teslimat' | 'kvkk' | 'kullanim-kosullari'

export interface SiteContact {
  phone: string
  /** Boş/null ise arama bağlantısı görünen telefondan türetilir. */
  phoneE164: string | null
  /** null: Admin WhatsApp bağlantısını gizlemiş. */
  whatsappE164: string | null
  email: string
  address: string
  city: string
  workingHours: string
  mapUrl: string | null
}

/** Sosyal medya bağlantıları (K-77): tam https adresi ya da null (gizli). */
export interface SocialLinks {
  instagram: string | null
  facebook: string | null
  youtube: string | null
  tiktok: string | null
  linkedin: string | null
}

/** Site geneli SEO ayarları (K-82). */
export interface SeoSettings {
  siteTitle: string
  /** "%s" sayfa başlığının yerini alır, ör. "%s | AMİSOS B2B". */
  titleTemplate: string
  description: string
  keywords: string | null
  ogImageMediaId: string | null
  indexable: boolean
  googleAnalyticsId: string | null
  googleSiteVerification: string | null
  canonicalBaseUrl: string | null
}

export interface SiteInfo {
  announcement: string | null
  /** Eski sunucu yanıtında olmayabilir. */
  seo?: (Omit<SeoSettings, 'ogImageMediaId'> & { ogImageUrl?: string | null }) | null
  contact: SiteContact
  pages: { slug: string; title: string }[]
  /** Eski sunucu yanıtında olmayabilir. */
  social?: SocialLinks
  /** K-87: yönetilebilir vitrin; ayar yoksa/eski sunucuda olmayabilir. */
  home?: HomeLayout
  navigation?: NavigationSettings
  announcements?: AnnouncementSettings
}

export function fetchSite(signal?: AbortSignal): Promise<SiteInfo> {
  return getJson('/site', signal)
}

export interface SitePage {
  slug: string
  title: string
  /** Düz metin: boş satır paragraf, "## " alt başlık, "- " madde. HTML yoktur. */
  body: string
  updatedAt: string
  /** Sayfa gövdesi değiştikçe 1 artar (onay metni sürümü). */
  version: number
}

export function fetchSitePage(slug: string, signal?: AbortSignal): Promise<SitePage> {
  return getJson(`/site/pages/${encodeURIComponent(slug)}`, signal)
}

export interface AdminSite {
  announcement: string | null
  seo?: SeoSettings & { ogImageUrl?: string | null }
  contact: SiteContact
  pages: { slug: string; title: string; body: string; published: boolean; updatedAt?: string }[]
  social?: SocialLinks
}

/** Kayıt gövdesi: E.164 alanları verilmezse sunucu telefondan türetir, null verilirse gizler. */
export interface AdminSiteInput {
  /** K-87: duyurular artık `/admin/site/announcements` ile yönetilir; gönderilmezse dokunulmaz. */
  announcement?: string | null
  seo?: SeoSettings
  contact: Omit<SiteContact, 'phoneE164' | 'whatsappE164'> & {
    phoneE164?: string | null
    whatsappE164?: string | null
  }
  pages: { slug: string; title: string; body: string; published: boolean }[]
  social?: Partial<SocialLinks>
}

export function fetchAdminSite(signal?: AbortSignal): Promise<AdminSite> {
  return getJson('/admin/site', signal)
}

export async function saveAdminSite(input: AdminSiteInput): Promise<AdminSite> {
  return (await (await put('/admin/site', input)).json()) as AdminSite
}

// ---------- Bayi hesabı (§3, K-67 – K-69) ----------

export interface Account {
  companyTitle: string
  taxOffice: string | null
  taxNumber: string | null
  contactName: string
  email: string
  phone: string
  city: string
  district: string
  address: string
  generalDiscountPercent: string | null
  memberSince: string
  lastLoginAt: string | null
  marketingConsent: boolean
  stats: { orderCount: number; openOrderCount: number; yearNetTotal: string; lastOrderAt: string | null }
}

export interface AccountPatch {
  contactName?: string
  phone?: string
  city?: string
  district?: string
  address?: string
  taxOffice?: string | null
  taxNumber?: string | null
}

export function fetchAccount(signal?: AbortSignal): Promise<Account> {
  return getJson('/account', signal)
}

export async function patchAccount(patch: AccountPatch): Promise<Account> {
  return (await (await send('PATCH', '/account', patch)).json()) as Account
}

export async function changeAccountPassword(currentPassword: string, newPassword: string): Promise<void> {
  await post('/account/password', { currentPassword, newPassword })
}

export async function revokeOtherSessions(): Promise<void> {
  await post('/account/sessions/revoke-others')
}

export async function setMarketingConsent(granted: boolean): Promise<void> {
  await put('/account/marketing-consent', { granted })
}

export interface DealerAddress {
  id: string
  label: string
  carrierName: string
  carrierBranch: string
  address: string
  city: string
  district: string
  isDefault: boolean
  createdAt: string
}

export type DealerAddressInput = Omit<DealerAddress, 'id' | 'createdAt' | 'isDefault'> & {
  isDefault?: boolean
}

export function fetchAddresses(signal?: AbortSignal): Promise<DealerAddress[]> {
  return getJson('/account/addresses', signal)
}

export async function createAddress(input: DealerAddressInput): Promise<DealerAddress> {
  return (await (await post('/account/addresses', input)).json()) as DealerAddress
}

export async function updateAddress(id: string, patch: Partial<DealerAddressInput>): Promise<DealerAddress> {
  return (await (
    await send('PATCH', `/account/addresses/${encodeURIComponent(id)}`, patch)
  ).json()) as DealerAddress
}

export async function deleteAddress(id: string): Promise<void> {
  await del(`/account/addresses/${encodeURIComponent(id)}`)
}

// ---------- Favoriler (§4, K-70) ----------

export async function fetchFavorites(signal?: AbortSignal): Promise<CatalogProduct[]> {
  const body = await getJson<{ items: Record<string, unknown>[] }>('/favorites', signal)
  return body.items.map((r) => ({ ...normalizeProduct(r), isFavorite: true }))
}

export async function addFavorite(productId: string): Promise<void> {
  await put(`/favorites/${encodeURIComponent(productId)}`)
}

export async function removeFavorite(productId: string): Promise<void> {
  await del(`/favorites/${encodeURIComponent(productId)}`)
}

// ---------- Hızlı sipariş (§5, K-71) ----------

export type QuickAddErrorCode = 'NOT_FOUND' | 'INACTIVE' | 'INVALID_QUANTITY' | 'PRICE_NOT_SET'

export interface QuickAddResult {
  added: {
    index: number
    productId: string
    name: string
    barcode: string
    requested: number
    quantity: number
    caseQuantity: number
    outOfStock: boolean
  }[]
  errors: { index: number; query: string; code: QuickAddErrorCode | string }[]
  cart: Cart
}

export async function quickAdd(lines: { query: string; quantity: number }[]): Promise<QuickAddResult> {
  return (await (await post('/cart/quick-add', { lines })).json()) as QuickAddResult
}

/** Bayinin kendi siparişi için Excel (K-72). */
export function downloadMyOrderExcel(orderId: string): Promise<{ blob: Blob; filename: string | null }> {
  return downloadFile(`/orders/${encodeURIComponent(orderId)}/export.xlsx`)
}

// ---------- Admin araçları (§7, K-74, K-75) ----------

export interface DealerPatch {
  companyTitle?: string
  contactName?: string
  email?: string
  phone?: string
  city?: string
  district?: string
  address?: string
  taxOffice?: string | null
  taxNumber?: string | null
}

export async function patchDealer(id: string, patch: DealerPatch): Promise<DealerDetail> {
  return (await (await send('PATCH', dealerPath(id), patch)).json()) as DealerDetail
}

export interface DealerNote {
  id: string
  body: string
  createdAt: string
  createdBy: { id: string; fullName: string }
}

export function fetchDealerNotes(dealerId: string, signal?: AbortSignal): Promise<DealerNote[]> {
  return getJson(`${dealerPath(dealerId)}/notes`, signal)
}

export async function addDealerNote(dealerId: string, body: string): Promise<DealerNote> {
  return (await (await post(`${dealerPath(dealerId)}/notes`, { body })).json()) as DealerNote
}

export async function deleteDealerNote(dealerId: string, noteId: string): Promise<void> {
  await del(`${dealerPath(dealerId)}/notes/${encodeURIComponent(noteId)}`)
}

export type BulkAction =
  | 'activate'
  | 'deactivate'
  | 'in_stock'
  | 'out_of_stock'
  | 'feature'
  | 'unfeature'
  | 'set_group'

export async function bulkProducts(input: {
  ids: string[]
  action: BulkAction
  groupId?: string
}): Promise<{ updated: number }> {
  return (await (await post('/admin/products/bulk', input)).json()) as { updated: number }
}

export interface AuditEntry {
  id: string
  createdAt: string
  actor: { type: 'admin' | 'dealer' | 'system'; id: string | null; name: string | null }
  action: string
  actionLabel: string
  entityType: string
  entityId: string | null
  entityLabel: string | null
  reason: string | null
  data: unknown
}

export function fetchAudit(
  params: {
    page: number
    pageSize: number
    entityType?: string
    actorType?: string
    q?: string
    from?: string
    to?: string
  },
  signal?: AbortSignal,
): Promise<Paged<AuditEntry>> {
  return getJson(`/admin/audit${qsOf(params)}`, signal)
}

export interface AdminAccount {
  id: string
  email: string
  fullName: string
  lastLoginAt: string | null
}

export function fetchAdminAccount(signal?: AbortSignal): Promise<AdminAccount> {
  return getJson('/admin/account', signal)
}

export async function patchAdminAccount(fullName: string): Promise<AdminAccount> {
  return (await (await send('PATCH', '/admin/account', { fullName })).json()) as AdminAccount
}

export async function changeAdminPassword(currentPassword: string, newPassword: string): Promise<void> {
  await post('/admin/account/password', { currentPassword, newPassword })
}

// ---------- Yönetim paneli yenilemesi (docs/api/admin-panel-api.md; K-77, K-78) ----------

export interface SearchResults {
  orders: {
    id: string
    orderNo: number
    dealerName: string
    status: OrderStatusValue
    grandTotal: string
    submittedAt: string
  }[]
  dealers: { id: string; companyTitle: string; contactName: string; city: string; status: DealerStatus }[]
  products: {
    id: string
    name: string
    barcode: string
    code: string | null
    thumbUrl: string | null
    isActive: boolean
  }[]
}

export function fetchAdminSearch(q: string, signal?: AbortSignal): Promise<SearchResults> {
  return getJson(`/admin/search${qsOf({ q })}`, signal)
}

export interface DashboardChange {
  current: string
  previous: string
  percent: number | null
}

export interface DashboardCountChange {
  current: number
  previous: number
  percent: number | null
}

export interface Dashboard {
  sales30d: { date: string; orderCount: number; netTotal: string }[]
  kpis: {
    monthNet: DashboardChange
    monthOrders: DashboardCountChange
    averageOrderNet: DashboardChange
    activeDealers: { current: number; orderingThisMonth: number }
  }
  pipeline: { status: OrderStatusValue; count: number }[]
  attention: {
    newOrders: number
    pendingApplications: number
    overdueApplications: number
    notTransferred: number
    failedNotifications: number
    /** K-79: aktif ve fiyatı girilmemiş ürün sayısı. */
    priceMissing?: number
    featuredOutOfStock: number
    inactiveDealers60d: number
  }
  recentOrders: {
    id: string
    orderNo: number
    dealer: { id: string; companyTitle: string }
    status: OrderStatusValue
    grandTotal: string
    submittedAt: string
  }[]
  topDealersMonth: { dealerId: string; companyTitle: string; orderCount: number; netTotal: string }[]
  /** K-85: bugünkü trafik; eski sunucuda olmayabilir. */
  traffic?: { todayVisitors: number; todayPageViews: number; activeNow: number; yesterdayVisitors: number }
  recentActivity: {
    id: string
    createdAt: string
    actorName: string | null
    actionLabel: string
    entityLabel: string | null
    entityType: string
    entityId: string | null
  }[]
}

export function fetchDashboard(signal?: AbortSignal): Promise<Dashboard> {
  return getJson('/admin/dashboard', signal)
}

export interface FeedItem {
  id: string
  type: 'order_submitted' | 'application_verified' | 'notification_failed' | 'order_status_changed'
  title: string
  body: string
  link: string
  createdAt: string
}

export function fetchNotificationFeed(signal?: AbortSignal): Promise<{ items: FeedItem[]; unread: number }> {
  return getJson('/admin/notifications/feed', signal)
}

export async function markFeedRead(until: string): Promise<void> {
  await post('/admin/notifications/feed/read', { until })
}

export interface OrderNote {
  id: string
  body: string
  createdAt: string
  createdBy: { id: string; fullName: string }
}

export function fetchOrderNotes(orderId: string, signal?: AbortSignal): Promise<OrderNote[]> {
  return getJson(`/admin/orders/${encodeURIComponent(orderId)}/notes`, signal)
}

export async function addOrderNote(orderId: string, body: string): Promise<void> {
  await post(`/admin/orders/${encodeURIComponent(orderId)}/notes`, { body })
}

export async function deleteOrderNote(orderId: string, noteId: string): Promise<void> {
  await del(`/admin/orders/${encodeURIComponent(orderId)}/notes/${encodeURIComponent(noteId)}`)
}

export async function duplicateProduct(
  id: string,
  input: { barcode: string; code?: string },
): Promise<AdminProduct> {
  return (await (
    await post(`/admin/products/${encodeURIComponent(id)}/duplicate`, input)
  ).json()) as AdminProduct
}

/** Ürün listesi Excel'i (aynı süzgeçler). */
export function downloadProductsExcel(params: {
  q?: string
  groupId?: string
  stock?: string
  active?: string
  featured?: string
}): Promise<{ blob: Blob; filename: string | null }> {
  return downloadFile(`/admin/products/export.xlsx${qsOf(params)}`)
}

/** Bayi listesi Excel'i (aynı süzgeçler). */
export function downloadDealersExcel(params: {
  status?: string
  q?: string
}): Promise<{ blob: Blob; filename: string | null }> {
  return downloadFile(`/admin/dealers/export.xlsx${qsOf(params)}`)
}

// ---------- Analitik (K-84, K-85; docs/api/analitik-vitrin-api.md) ----------

/** Karşılaştırmalı metrik: önceki eşit uzunlukta dönemle. */
export interface Compared {
  current: number
  previous: number
  percent: number | null
}

export interface AnalyticsOverview {
  period: { from: string; to: string }
  previous: { from: string; to: string }
  totals: {
    visitors: Compared
    sessions: Compared
    pageViews: Compared
    dealerVisitors: Compared
    productViews: Compared
    searches: Compared
    addToCarts: Compared
    orders: Compared
    conversionRate: Compared
  }
  daily: {
    date: string
    visitors: number
    sessions: number
    pageViews: number
    dealerVisitors: number
    orders: number
  }[]
  funnel: { step: 'sessions' | 'productView' | 'addToCart' | 'order'; sessions: number }[]
  devices: { device: string; sessions: number; share: number }[]
  referrers: { host: string; sessions: number }[]
  topPages: { path: string; pageViews: number; visitors: number }[]
  hours: { hour: number; pageViews: number }[]
}

export type LiveEventType =
  | 'page_view'
  | 'product_view'
  | 'search'
  | 'add_to_cart'
  | 'login'
  | 'order_submitted'

export interface AnalyticsLive {
  activeVisitors: number
  activeDealers: { dealerId: string; companyTitle: string; path: string; lastSeenAt: string }[]
  recent: {
    type: LiveEventType
    path: string
    productName?: string | null
    query?: string | null
    dealerName?: string | null
    at: string
  }[]
}

export interface AnalyticsProductRow {
  productId: string
  name: string
  barcode: string
  thumbUrl: string | null
  views: number
  uniqueViewers: number
  addToCarts: number
  orderedQuantity: number
  orderCount: number
  viewToCartRate: number
}

export interface AnalyticsSearches {
  top: { query: string; count: number; avgResults: number }[]
  zeroResults: { query: string; count: number; lastAt: string }[]
}

export interface AnalyticsDealerRow {
  dealerId: string
  companyTitle: string
  city: string | null
  sessions: number
  lastSeenAt: string | null
  productViews: number
  addToCarts: number
  orders: number
  netTotal: string
}

export interface AnalyticsDealers {
  items: AnalyticsDealerRow[]
  interestedNoOrder: AnalyticsDealerRow[]
}

export interface DealerActivityItem {
  id: number | string
  at: string
  type: LiveEventType
  path: string | null
  productId: string | null
  productName: string | null
  query: string | null
  resultCount: number | null
  quantity: number | null
  orderId: string | null
  orderNo: number | null
}

const range = (r: { from: string; to: string }) => ({ from: r.from, to: r.to })

export function fetchAnalyticsOverview(
  r: { from: string; to: string },
  signal?: AbortSignal,
): Promise<AnalyticsOverview> {
  return getJson(`/admin/analytics/overview${qsOf(range(r))}`, signal)
}

export function fetchAnalyticsLive(signal?: AbortSignal): Promise<AnalyticsLive> {
  return getJson('/admin/analytics/live', signal)
}

export function fetchAnalyticsProducts(
  r: { from: string; to: string },
  sort: 'views' | 'addToCart' | 'ordered',
  signal?: AbortSignal,
): Promise<{ items: AnalyticsProductRow[] }> {
  return getJson(`/admin/analytics/products${qsOf({ ...range(r), sort, limit: 50 })}`, signal)
}

export function fetchAnalyticsSearches(
  r: { from: string; to: string },
  signal?: AbortSignal,
): Promise<AnalyticsSearches> {
  return getJson(`/admin/analytics/searches${qsOf(range(r))}`, signal)
}

export function fetchAnalyticsDealers(
  r: { from: string; to: string },
  signal?: AbortSignal,
): Promise<AnalyticsDealers> {
  return getJson(`/admin/analytics/dealers${qsOf(range(r))}`, signal)
}

export function fetchDealerActivity(
  dealerId: string,
  before: number | string | null,
  signal?: AbortSignal,
): Promise<{ items: DealerActivityItem[]; nextBefore: number | string | null }> {
  return getJson(
    `/admin/dealers/${encodeURIComponent(dealerId)}/activity${qsOf({ before: before ?? undefined, limit: 50 })}`,
    signal,
  )
}

// ---------- Yönetilebilir vitrin (K-87) ----------

export type HomeSectionType =
  | 'hero'
  | 'categoryStrip'
  | 'trustStrip'
  | 'howItWorks'
  | 'campaignStrip'
  | 'collections'
  | 'productShelf'
  | 'promoPanel'
  | 'iconTiles'

export type ShelfSource = 'bestSellers' | 'mostViewed' | 'trending' | 'new' | 'featured' | 'group' | 'manual'
export type Audience = 'all' | 'guest' | 'dealer'

/** Bölüm ayarı; hangi alanların anlamlı olduğu `type`a bağlıdır. */
export interface HomeSectionConfig {
  audience?: Audience
  title?: string
  text?: string
  buttonLabel?: string
  buttonLink?: string
  groupIds?: string[]
  source?: ShelfSource
  groupId?: string
  productIds?: string[]
  limit?: number
  layout?: 'grid' | 'carousel'
  panelTitle?: string
  panelText?: string
}

export interface HomeSection {
  id: string
  type: HomeSectionType
  enabled: boolean
  title?: string
  subtitle?: string
  config: HomeSectionConfig
  /** `GET /site/home` yanıtında: sunucunun çözdüğü ürün kimlikleri (raf ve vitrin paneli). */
  productIds?: string[]
}

export interface HomeLayout {
  sections: HomeSection[]
}

export type NavItemType = 'group' | 'featured' | 'new' | 'bestSellers' | 'link'

export interface NavigationItem {
  type: NavItemType
  groupId?: string
  label?: string
  href?: string
}

export interface NavigationSettings {
  items: NavigationItem[]
}

export interface AnnouncementItem {
  text: string
  link?: string
}

export interface AnnouncementSettings {
  items: AnnouncementItem[]
}

export function fetchSiteHome(signal?: AbortSignal): Promise<HomeLayout> {
  return getJson('/site/home', signal)
}

export function fetchAdminHome(signal?: AbortSignal): Promise<HomeLayout> {
  return getJson('/admin/site/home', signal)
}
export async function saveAdminHome(input: HomeLayout): Promise<HomeLayout> {
  return (await (await put('/admin/site/home', input)).json()) as HomeLayout
}

export function fetchAdminNavigation(signal?: AbortSignal): Promise<NavigationSettings> {
  return getJson('/admin/site/navigation', signal)
}
export async function saveAdminNavigation(input: NavigationSettings): Promise<NavigationSettings> {
  return (await (await put('/admin/site/navigation', input)).json()) as NavigationSettings
}

export function fetchAdminAnnouncements(signal?: AbortSignal): Promise<AnnouncementSettings> {
  return getJson('/admin/site/announcements', signal)
}
export async function saveAdminAnnouncements(input: AnnouncementSettings): Promise<AnnouncementSettings> {
  return (await (await put('/admin/site/announcements', input)).json()) as AnnouncementSettings
}
