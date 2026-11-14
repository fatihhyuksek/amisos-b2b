import { Logger } from '@nestjs/common';
import { DevMailService, formatOrderForTeam, type OrderMail } from './mail.service.js';

const configFor = (env: string) => ({ get: () => env }) as never;

describe('DevMailService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('K-39: token lu bağlantı yalnızca development/test te log a yazılır', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    await new DevMailService(configFor('development')).sendPasswordReset(
      'a@b.co',
      'http://x/#/t?token=gizli',
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining('token=gizli'));
    log.mockClear();
    await new DevMailService(configFor('production')).sendPasswordReset(
      'a@b.co',
      'http://x/#/t?token=gizli',
    );
    expect(log).not.toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain('gizli');
  });
});

describe('formatOrderForTeam', () => {
  const base: OrderMail = {
    orderNo: 1001, submittedAt: new Date(), dealerCompany: 'Örnek Ltd', dealerContact: 'Ayşe',
    dealerEmail: 'a@b.co', dealerPhone: '0532', deliveryMethod: 'truck', deliveryAddress: null,
    carrierName: null, carrierBranch: null, note: null,
    lines: [
      { barcode: '869001', code: null, name: 'Bardak', quantity: 12, unitPrice: '41.57', outOfStock: true },
    ],
    netTotal: '498.84', vatTotal: '99.77', grandTotal: '598.61',
  };

  it('K-17, GR-SIP-003: barkod, ad, adet, birim fiyat, stokta yok işareti ve teslimat bilgisi', () => {
    const text = formatOrderForTeam(base);
    expect(text).toContain('869001 | Bardak | 12 adet | 41.57 TL | STOKTA YOK');
    expect(text).toContain('adres görüşmede belirlenecek');
    expect(text).toContain('#1001');
  });
});
