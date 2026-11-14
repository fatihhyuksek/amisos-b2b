export interface Env {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  DATABASE_URL: string;
  CORS_ORIGIN: string;
  /** Arayüzün kök adresi; e-postalardaki bağlantılar bununla kurulur. */
  APP_URL: string;
  /** Gönderen adres (K-56). */
  MAIL_FROM: string;
  /** Giriş ve şifre sıfırlama uçlarında IP başına dakikadaki istek sınırı (GR-BAYI-007). */
  AUTH_RATE_LIMIT_PER_MINUTE: number;
  /**
   * Express `trust proxy` ayarı. Varsayılan kapalı: X-Forwarded-For dikkate alınmaz, hız sınırı
   * gerçek bağlantı IP'sine göre çalışır. Ters vekil arkasında: atlama sayısı (ör. 1) veya
   * virgülle ayrılmış IP/CIDR listesi.
   */
  TRUST_PROXY: boolean | number | string;
}

/** Çerez `Secure` ve token'lı bağlantı log'u: yalnızca açıkça development/test dışında güvenli mod. */
export const isProductionLike = (nodeEnv: Env['NODE_ENV']): boolean =>
  nodeEnv !== 'development' && nodeEnv !== 'test';

export function parseTrustProxy(raw: unknown): boolean | number | string {
  if (raw === undefined || raw === null) return false;
  const value = (typeof raw === 'string' ? raw : JSON.stringify(raw)).trim();
  if (value === '' || value === 'false') return false;
  if (value === 'true') {
    throw new Error(
      'TRUST_PROXY=true güvenli değil (herkesin X-Forwarded-For değerine güvenir). Atlama sayısı veya IP/CIDR listesi verin.',
    );
  }
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

export function validateEnv(raw: Record<string, unknown>): Env {
  const databaseUrl = raw.DATABASE_URL;
  if (typeof databaseUrl !== 'string' || databaseUrl.length === 0) {
    throw new Error(
      'DATABASE_URL tanımlı değil. backend/.env.example dosyasına bakın.',
    );
  }

  // NODE_ENV verilmemişse güvenli tarafta kalınır: production gibi davranılır.
  const nodeEnv = (raw.NODE_ENV ?? 'production') as Env['NODE_ENV'];
  if (!['development', 'test', 'production'].includes(nodeEnv)) {
    throw new Error(`Geçersiz NODE_ENV: ${String(nodeEnv)}`);
  }

  const port = Number(raw.PORT ?? 3000);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Geçersiz PORT: ${String(raw.PORT)}`);
  }

  const rateLimit = Number(raw.AUTH_RATE_LIMIT_PER_MINUTE ?? 5);
  if (!Number.isInteger(rateLimit) || rateLimit <= 0) {
    throw new Error(
      `Geçersiz AUTH_RATE_LIMIT_PER_MINUTE: ${String(raw.AUTH_RATE_LIMIT_PER_MINUTE)}`,
    );
  }

  if (
    isProductionLike(nodeEnv) &&
    !(typeof raw.APP_URL === 'string' && raw.APP_URL)
  ) {
    throw new Error(
      "APP_URL tanımlı değil. Production'da e-posta bağlantıları için zorunludur.",
    );
  }
  const appUrl =
    typeof raw.APP_URL === 'string' && raw.APP_URL
      ? raw.APP_URL
      : 'http://localhost:5173';

  return {
    NODE_ENV: nodeEnv,
    PORT: port,
    DATABASE_URL: databaseUrl,
    CORS_ORIGIN:
      typeof raw.CORS_ORIGIN === 'string'
        ? raw.CORS_ORIGIN
        : 'http://localhost:5173',
    APP_URL: appUrl.replace(/\/+$/, ''),
    MAIL_FROM:
      typeof raw.MAIL_FROM === 'string' && raw.MAIL_FROM
        ? raw.MAIL_FROM
        : 'Amisos B2B <onay@amisosb2b.com>',
    AUTH_RATE_LIMIT_PER_MINUTE: rateLimit,
    TRUST_PROXY: parseTrustProxy(raw.TRUST_PROXY),
  };
}
