import { BadRequestException } from '@nestjs/common';
import { foldTr } from '../common/like.js';
import { parseDecimalText } from './decimal.js';
import { headerKey } from './import-format.js';

describe('parseDecimalText (K-59: "19,99" ve sayı)', () => {
  it('virgül, nokta, Türkçe binlik ve simgeleri kabul eder', () => {
    expect(parseDecimalText('19,99')).toBe('19.99');
    expect(parseDecimalText('19.99')).toBe('19.99');
    expect(parseDecimalText('1.234,56')).toBe('1234.56');
    expect(parseDecimalText('₺ 48,9')).toBe('48.90');
    expect(parseDecimalText('%18')).toBe('18.00');
    expect(parseDecimalText('7')).toBe('7.00');
  });

  it('geçersiz veya 2 basamaktan fazla ondalığı reddeder', () => {
    for (const v of ['', 'abc', '1,999', '-5', '1,2,3', '1,234.56', '12.']) {
      expect(parseDecimalText(v)).toBeNull();
    }
  });
});

describe('başlık ve arama normalizasyonu (K-59, K-40)', () => {
  it('headerKey Türkçe harf, boşluk, noktalama ve büyük/küçük harf duyarsızdır', () => {
    expect(headerKey('  LİSTE   Fiyatı (KDV hariç) ')).toBe(headerKey('liste fiyati kdv haric'));
    expect(headerKey('Koli içi adet')).toBe(headerKey('KOLI ICI ADET'));
  });

  it('foldTr Türkçe harfleri ASCII\'ye indirger', () => {
    expect(foldTr('ÇAY Bardağı İŞ')).toBe('cay bardagi is');
    expect(foldTr('Işık')).toBe('isik');
  });
});

describe('mapProductConflict FK ihlali (23503) -> 400 VALIDATION', () => {
  it('grup ve görsel FK ihlalleri fields ile döner', async () => {
    const { mapProductConflict } = await import('./products.service.js');
    const fk = (constraint: string) => ({ cause: { code: '23503', constraint } });
    try {
      mapProductConflict(fk('products_group_id_product_groups_id_fk'));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(BadRequestException);
      expect((e as BadRequestException).getResponse()).toMatchObject({ code: 'VALIDATION', fields: { groupId: expect.any(String) } });
    }
    try {
      mapProductConflict(fk('product_images_media_id_media_id_fk'));
      expect.unreachable();
    } catch (e) {
      expect((e as BadRequestException).getResponse()).toMatchObject({ fields: { mediaIds: expect.any(String) } });
    }
  });
});
