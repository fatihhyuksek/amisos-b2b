import { Logger } from '@nestjs/common';
import { DevMailService, formatOrderForTeam, oneLine, type OrderMail } from './mail.service.js';

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

describe('oneLine (log enjeksiyonu)', () => {
  it('satır sonları ve kontrol karakterleri boşluğa çevrilir, boşluklar sadeleşir', () => {
    expect(oneLine('Firma\r\nSahte satır\u001b[31m Son\tkısım  x ')).toBe('Firma Sahte satır [31m Son kısım x');
    expect(oneLine('düz metin')).toBe('düz metin');
  });

  it('bayi girdisi (not, adres, ad) ekip e-postasında tek satırda kalır', () => {
    const text = formatOrderForTeam({
      orderNo: 1, submittedAt: new Date(), dealerCompany: 'Firma\nÖn sipariş #999 - Sahte', dealerContact: 'A\r\nB',
      dealerEmail: 'a@b.co', dealerPhone: '0532', deliveryMethod: 'carrier',
      deliveryAddress: 'Adres\nSahte: satır', carrierName: 'Ambar\n', carrierBranch: 'Şube\r',
      note: 'Not\n\nSahte not',
      lines: [{ barcode: '1', code: null, name: 'Ürün\nAdı', quantity: 1, unitPrice: '1.00', outOfStock: false }],
      netTotal: '1.00', vatTotal: '0.20', grandTotal: '1.20',
    });
    // Beklenen satırlar: başlık, teslimat, not, 1 ürün, toplam.
    expect(text.split('\n')).toHaveLength(5);
    expect(text).toContain('Firma Ön sipariş #999 - Sahte');
    expect(text).toContain('Ürün Adı');
  });
});
