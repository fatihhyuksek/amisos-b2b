export interface Env {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  DATABASE_URL: string;
  CORS_ORIGIN: string;
  /** Arayüzün kök adresi; e-postalardaki bağlantılar bununla kurulur. */
  APP_URL: string;
  /** Giriş ve şifre sıfırlama uçlarında IP başına dakikadaki istek sınırı (GR-BAYI-007). */
  AUTH_RATE_LIMIT_PER_MINUTE: number;
}

export function validateEnv(raw: Record<string, unknown>): Env {
  const databaseUrl = raw.DATABASE_URL;
  if (typeof databaseUrl !== 'string' || databaseUrl.length === 0) {
    throw new Error('DATABASE_URL tanımlı değil. backend/.env.example dosyasına bakın.');
  }

  const nodeEnv = (raw.NODE_ENV ?? 'development') as Env['NODE_ENV'];
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error(`Geçersiz NODE_ENV: ${String(nodeEnv)}`);
  }

  const port = Number(raw.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Geçersiz PORT: ${String(raw.PORT)}`);
  }

  const rateLimit = Number(raw.AUTH_RATE_LIMIT_PER_MINUTE ?? 5);
  if (!Number.isInteger(rateLimit) || rateLimit <= 0) {
    throw new Error(`Geçersiz AUTH_RATE_LIMIT_PER_MINUTE: ${String(raw.AUTH_RATE_LIMIT_PER_MINUTE)}`);
  }

  const appUrl = typeof raw.APP_URL === 'string' && raw.APP_URL ? raw.APP_URL : 'http://localhost:5173';

  return {
    NODE_ENV: nodeEnv,
    PORT: port,
    DATABASE_URL: databaseUrl,
    CORS_ORIGIN: typeof raw.CORS_ORIGIN === 'string' ? raw.CORS_ORIGIN : 'http://localhost:5173',
    APP_URL: appUrl.replace(/\/+$/, ''),
    AUTH_RATE_LIMIT_PER_MINUTE: rateLimit,
  };
}
