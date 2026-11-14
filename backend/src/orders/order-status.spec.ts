import { allowedNextStatuses, canTransition, type OrderStatus } from './order-status.js';

describe('GR-SIP-006: sipariş durum geçişleri', () => {
  it('durumlar yalnızca tanımlı sırayla ilerler', () => {
    expect(canTransition('submitted', 'negotiating')).toBe(true);
    expect(canTransition('negotiating', 'approved')).toBe(true);
    expect(canTransition('approved', 'shipped')).toBe(true);
    expect(canTransition('shipped', 'delivered')).toBe(true);
  });

  it('adım atlanamaz ve geri gidilemez', () => {
    expect(canTransition('submitted', 'approved')).toBe(false);
    expect(canTransition('submitted', 'delivered')).toBe(false);
    expect(canTransition('approved', 'negotiating')).toBe(false);
    expect(canTransition('submitted', 'submitted')).toBe(false);
  });

  it('İptal, Teslim edildi dışındaki her adımdan seçilebilir', () => {
    const open: OrderStatus[] = ['submitted', 'negotiating', 'approved', 'shipped'];
    for (const s of open) expect(canTransition(s, 'cancelled')).toBe(true);
    expect(canTransition('delivered', 'cancelled')).toBe(false);
  });

  it('Teslim edildi ve İptal son durumlardır', () => {
    expect(allowedNextStatuses('delivered')).toEqual([]);
    expect(allowedNextStatuses('cancelled')).toEqual([]);
  });
});
