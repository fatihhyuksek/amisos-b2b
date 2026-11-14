import { parseTrustProxy, validateEnv } from './env.js';

const base = { DATABASE_URL: 'postgres://x' };

describe('validateEnv güvenli varsayılanlar', () => {
  it('K-29: NODE_ENV verilmezse production gibi davranılır ve APP_URL zorunludur', () => {
    expect(() => validateEnv({ ...base })).toThrow(/APP_URL/);
    expect(
      validateEnv({ ...base, APP_URL: 'https://b2b.example.com/' }).APP_URL,
    ).toBe('https://b2b.example.com');
  });

  it('production da APP_URL yoksa hata verir; development/test de varsayılan kullanılır', () => {
    expect(() => validateEnv({ ...base, NODE_ENV: 'production' })).toThrow(
      /APP_URL/,
    );
    expect(validateEnv({ ...base, NODE_ENV: 'development' }).APP_URL).toBe(
      'http://localhost:5180',
    );
    expect(validateEnv({ ...base, NODE_ENV: 'test' }).APP_URL).toBe(
      'http://localhost:5180',
    );
  });

  it('TRUST_PROXY: varsayılan kapalı; sayı, liste kabul; true reddedilir', () => {
    expect(parseTrustProxy(undefined)).toBe(false);
    expect(parseTrustProxy('')).toBe(false);
    expect(parseTrustProxy('1')).toBe(1);
    expect(parseTrustProxy('10.0.0.0/8, 192.168.1.5')).toBe(
      '10.0.0.0/8, 192.168.1.5',
    );
    expect(() => parseTrustProxy('true')).toThrow();
  });
});
