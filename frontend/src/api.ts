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
  groupsCreated: string[]
  errors: { row: number; column: string; message: string }[]
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
          groupsCreated: body.groupsCreated ?? [],
          errors: body.errors,
        }
      }
    } catch {
      /* gövde okunamadı */
    }
    throw new ApiError(422)
  }
  if (!res.ok) throw await toError(res)
  return (await res.json()) as ImportReport
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
}

export function fetchCatalogGroups(signal?: AbortSignal): Promise<CatalogGroup[]> {
  return getJson('/catalog/groups', signal)
}

export function fetchCatalogProducts(
  params: { q?: string; groupId?: string; page: number; pageSize: number },
  signal?: AbortSignal,
): Promise<Paged<CatalogProduct>> {
  return getJson(`/catalog/products${qsOf(params)}`, signal)
}

export function fetchCatalogProduct(id: string, signal?: AbortSignal): Promise<CatalogProduct> {
  return getJson(`/catalog/products/${encodeURIComponent(id)}`, signal)
}
