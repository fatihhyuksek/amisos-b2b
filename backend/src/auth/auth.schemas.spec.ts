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

  it('yeni şifre en az 10 karakter olmalı', () => {
    const token = 't'.repeat(43);
    expect(
      passwordResetConfirmSchema.safeParse({ token, password: '123456789' })
        .success,
    ).toBe(false);
    expect(
      passwordResetConfirmSchema.safeParse({ token, password: '1234567890' })
        .success,
    ).toBe(true);
  });

  it('şifre sıfırlama isteğinde type admin|dealer olmalı', () => {
    expect(
      passwordResetRequestSchema.safeParse({ email: 'a@b.co', type: 'x' })
        .success,
    ).toBe(false);
  });
});
