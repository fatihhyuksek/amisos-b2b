import { calculateDealerPrice } from './pricing.service.js';

describe('calculateDealerPrice (GR-FIY-002, K-13, K-10, K-39)', () => {
  it('K-13: genel 10 + mutfak grubu 15 -> mutfakta 15, diğer grupta 10', () => {
    expect(calculateDealerPrice('100.00', '10.00', '15.00')).toEqual({
      price: '85.00',
      discountPercent: '15.00',
    });
    expect(calculateDealerPrice('100.00', '10.00', null)).toEqual({
      price: '90.00',
      discountPercent: '10.00',
    });
  });

  it('K-13: grup oranı genelden düşükse genel oran uygulanır', () => {
    expect(calculateDealerPrice('100.00', '20.00', '5.00').discountPercent).toBe('20.00');
  });

  it('K-39: 48.90 x 0.85 = 41.565 -> 41.57', () => {
    expect(calculateDealerPrice('48.90', null, '15.00')).toEqual({
      price: '41.57',
      discountPercent: '15.00',
    });
  });

  it('K-10: iskonto yoksa liste fiyatı ve discountPercent null', () => {
    expect(calculateDealerPrice('48.90', null, null)).toEqual({
      price: '48.90',
      discountPercent: null,
    });
    expect(calculateDealerPrice('48.9', undefined, undefined).price).toBe('48.90');
  });

  it('GR-FIY-002: kayan nokta hatası yok (19.99 x 0.9)', () => {
    expect(calculateDealerPrice('19.99', '10', null).price).toBe('17.99');
  });
});
