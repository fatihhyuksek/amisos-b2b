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
  constructor(status: number) {
    super(`HTTP ${status}`)
    this.status = status
  }
}

async function post(path: string, body?: unknown): Promise<Response> {
  const res = await fetch(`/api${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw new ApiError(res.status)
  return res
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
