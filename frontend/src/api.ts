export interface HealthStatus {
  status: 'ok' | 'error'
  database: 'up' | 'down'
}

export async function fetchHealth(signal?: AbortSignal): Promise<HealthStatus> {
  const res = await fetch('/api/health', { signal })
  if (!res.ok && res.status !== 503) {
    throw new Error(`Beklenmeyen yanıt: ${res.status}`)
  }
  return (await res.json()) as HealthStatus
}
