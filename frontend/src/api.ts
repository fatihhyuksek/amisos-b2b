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

export async function acceptInvitation(token: string, password: string): Promise<void> {
  await post('/auth/invitation/accept', { token, password })
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
