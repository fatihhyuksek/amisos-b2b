import { PasswordService } from './password.service.js';

describe('PasswordService (K-29)', () => {
  const service = new PasswordService();

  it('argon2id özeti üretir ve doğru şifreyi doğrular', async () => {
    const hash = await service.hash('dogru-sifre-123');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await service.verify(hash, 'dogru-sifre-123')).toBe(true);
  });

  it('yanlış şifreyi ve özeti olmayan hesabı reddeder', async () => {
    const hash = await service.hash('dogru-sifre-123');
    expect(await service.verify(hash, 'yanlis-sifre-123')).toBe(false);
    expect(await service.verify(null, 'dogru-sifre-123')).toBe(false);
    expect(await service.verify('bozuk-ozet', 'x')).toBe(false);
  });
});
