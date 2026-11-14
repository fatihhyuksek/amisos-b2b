import {
  loginSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
} from './auth.schemas.js';

describe('auth şemaları (GR-BAYI-007)', () => {
  it('e-postayı normalleştirir', () => {
    const r = loginSchema.parse({ email: ' Bayi@Firma.COM ', password: 'x' });
    expect(r.email).toBe('bayi@firma.com');
  });

  it('geçersiz e-posta ve boş şifreyi reddeder', () => {
    expect(loginSchema.safeParse({ email: 'yok', password: 'x' }).success).toBe(
      false,
    );
    expect(
      loginSchema.safeParse({ email: 'a@b.co', password: '' }).success,
    ).toBe(false);
  });

  it('K-53: yeni şifre en az 8 karakter, büyük harf, küçük harf ve rakam içermeli', () => {
    const token = 't'.repeat(43);
    const ok = (password: string) =>
      passwordResetConfirmSchema.safeParse({ token, password }).success;
    expect(ok('Abcdef1')).toBe(false); // 7 karakter
    expect(ok('Abcdefg1')).toBe(true); // 8 karakter, hepsi var
    expect(ok('abcdefg1')).toBe(false); // büyük harf yok
    expect(ok('ABCDEFG1')).toBe(false); // küçük harf yok
    expect(ok('Abcdefgh')).toBe(false); // rakam yok
    expect(ok('Çiçekli1')).toBe(true); // Türkçe harfler sayılır
    expect(ok('ışıklıĞ5')).toBe(true);
  });

  it('şifre sıfırlama isteğinde type admin|dealer olmalı', () => {
    expect(
      passwordResetRequestSchema.safeParse({ email: 'a@b.co', type: 'x' })
        .success,
    ).toBe(false);
  });
});
