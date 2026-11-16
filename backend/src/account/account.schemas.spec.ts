// K-67, K-68: bayi hesap ve vergi alanı doğrulamaları.
import { applicationSchema } from '../dealers/dealers.schemas.js';
import { createAddressSchema, updateAccountSchema } from './account.schemas.js';

describe('updateAccountSchema', () => {
  it('firma unvanı ve e-posta gönderilirse reddeder (K-67)', () => {
    expect(updateAccountSchema.safeParse({ companyTitle: 'X' }).success).toBe(false);
    expect(updateAccountSchema.safeParse({ email: 'a@b.co' }).success).toBe(false);
    expect(updateAccountSchema.safeParse({ contactName: 'Ali Veli' }).success).toBe(true);
  });

  it('vergi numarası 10 veya 11 hane, null ve boş metin null olur (K-68)', () => {
    const ok = (v: unknown) => updateAccountSchema.safeParse({ taxNumber: v });
    expect(ok('1234567890').success).toBe(true);
    expect(ok('12345678901').success).toBe(true);
    expect(ok('123456789').success).toBe(false);
    expect(ok('12345678a0').success).toBe(false);
    expect(ok(null).data?.taxNumber).toBeNull();
    expect(ok('').data?.taxNumber).toBeNull();
  });

  it('telefon normalize edilir', () => {
    expect(updateAccountSchema.parse({ phone: '+90 532 111 22 33' }).phone).toBe('05321112233');
  });
});

describe('createAddressSchema', () => {
  it('etiket ve adres zorunlu, ambar alanları isteğe bağlı', () => {
    expect(createAddressSchema.safeParse({ label: 'Depo', address: 'x' }).success).toBe(true);
    expect(createAddressSchema.safeParse({ label: ' ', address: 'x' }).success).toBe(false);
    expect(createAddressSchema.safeParse({ label: 'a'.repeat(61), address: 'x' }).success).toBe(false);
  });
});

describe('başvuru vergi alanları (K-68)', () => {
  const base = {
    companyTitle: 'Test Züccaciye',
    contactName: 'Ali',
    email: 'ali@test.example',
    phone: '05321112233',
    city: 'Kayseri',
    district: 'Melikgazi',
    address: 'Adres',
    consents: { kvkk: true, terms: true },
  };
  it('isteğe bağlıdır; verilirse doğrulanır', () => {
    expect(applicationSchema.safeParse(base).success).toBe(true);
    expect(applicationSchema.safeParse({ ...base, taxOffice: 'Kayseri VD', taxNumber: '1234567890' }).success).toBe(true);
    expect(applicationSchema.safeParse({ ...base, taxNumber: '12' }).success).toBe(false);
  });
});
