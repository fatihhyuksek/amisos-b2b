// E2E testleri ASLA geliştirme veritabanına yazmaz: veritabanı adı `_test` içermiyorsa hata verilir.
const DEFAULT_URL = 'postgres://amisos:amisos@localhost:5433/amisos_b2b';

function assertTestName(url: URL): void {
  const name = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!/^[A-Za-z0-9_]+$/.test(name) || !name.includes('_test')) {
    throw new Error(
      `E2E testleri yalnızca adında "_test" geçen bir veritabanında çalışır (verilen: "${name}"). ` +
        'TEST_DATABASE_URL belirleyin veya DATABASE_URL\'in veritabanı adını bırakın; "_test" eki otomatik eklenir.',
    );
  }
}

/** TEST_DATABASE_URL varsa o; yoksa DATABASE_URL'in veritabanı adına `_test` eklenir (ör. amisos_b2b -> amisos_b2b_test). */
export function resolveTestDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (env.TEST_DATABASE_URL) {
    const explicit = new URL(env.TEST_DATABASE_URL);
    assertTestName(explicit);
    return explicit.toString();
  }
  const url = new URL(env.DATABASE_URL ?? DEFAULT_URL);
  const name = url.pathname.replace(/^\//, '');
  if (!name.includes('_test')) url.pathname = `/${name}_test`;
  assertTestName(url);
  return url.toString();
}

/** Aynı sunucudaki bakım veritabanı (CREATE DATABASE için). */
export function adminDatabaseUrl(testUrl: string): string {
  const url = new URL(testUrl);
  url.pathname = '/postgres';
  return url.toString();
}

export function databaseName(testUrl: string): string {
  return decodeURIComponent(new URL(testUrl).pathname.replace(/^\//, ''));
}
