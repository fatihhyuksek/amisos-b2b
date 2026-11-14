// E-posta gönderimi. Gönderen: MAIL_FROM (K-56, onay@amisosb2b.com). SMTP henüz kurulmadı;
// şimdilik yalnızca log'a yazan geliştirme uygulaması.
import { Global, Inject, Injectable, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isProductionLike, type Env } from '../config/env.js';

export const MAIL_SERVICE = Symbol('MAIL_SERVICE');

/** Ön sipariş e-postalarının içeriği (GR-BLD-001, K-26, K-17 yedek yolu). Tutarlar KDV hariç, metin. */
export interface OrderMail {
  orderNo: number;
  submittedAt: Date;
  dealerCompany: string;
  dealerContact: string;
  dealerEmail: string;
  dealerPhone: string;
  deliveryMethod: 'carrier' | 'pickup' | 'truck';
  deliveryAddress: string | null;
  carrierName: string | null;
  carrierBranch: string | null;
  note: string | null;
  lines: {
    barcode: string;
    code: string | null;
    name: string;
    quantity: number;
    unitPrice: string;
    outOfStock: boolean;
  }[];
  netTotal: string;
  vatTotal: string;
  grandTotal: string;
}

const DELIVERY_LABELS = {
  carrier: 'Ambar ile',
  pickup: 'Bayi kendisi alır',
  truck: 'Tır yüklemesi',
} as const;

/** Teslimat bilgisi metni: ambar ise adres/ambar/şube, değilse "adres görüşmede belirlenecek" (K-37). */
export function formatDelivery(order: OrderMail): string {
  const label = DELIVERY_LABELS[order.deliveryMethod];
  if (order.deliveryMethod === 'carrier') {
    return `${label}; adres: ${order.deliveryAddress}; ambar: ${order.carrierName} / ${order.carrierBranch}`;
  }
  return `${label}; adres görüşmede belirlenecek`;
}

/**
 * Ekibe giden e-postanın gövdesi: BizimHesap'a elle giriş için satır özeti (barkod, ad, adet, birim fiyat,
 * stokta yok işareti) ve teslimat bilgisi (K-17 yedek yolu, GR-SIP-003).
 */
export function formatOrderForTeam(order: OrderMail): string {
  const rows = order.lines.map(
    (l) =>
      `${l.barcode}${l.code ? ` (${l.code})` : ''} | ${l.name} | ${l.quantity} adet | ${l.unitPrice} TL${
        l.outOfStock ? ' | STOKTA YOK' : ''
      }`,
  );
  return [
    `Ön sipariş #${order.orderNo} - ${order.dealerCompany} (${order.dealerContact}, ${order.dealerEmail}, ${order.dealerPhone})`,
    `Teslimat: ${formatDelivery(order)}`,
    ...(order.note ? [`Not: ${order.note}`] : []),
    ...rows,
    `KDV hariç ${order.netTotal} TL, KDV ${order.vatTotal} TL, genel toplam ${order.grandTotal} TL`,
  ].join('\n');
}

export interface MailService {
  /** K-39: bağlantı 1 saat geçerli. */
  sendPasswordReset(to: string, link: string): Promise<void>;
  sendEmailVerification(to: string, link: string): Promise<void>;
  /** K-04: onaylanan/davet edilen bayiye şifre belirleme bağlantısı (72 saat). */
  sendInvitation(to: string, link: string): Promise<void>;
  /**
   * K-04: onay bekleyen başvurular için Admin hatırlatması. `dueSoon`: 1 iş günü geçmiş, 2'yi
   * geçmemiş; `overdue`: 2 iş gününü aşmış.
   */
  sendApprovalReminder(
    to: string,
    counts: { dueSoon: number; overdue: number },
  ): Promise<void>;
  /** GR-BAYI-001, K-04: bayi e-postasını doğruladığında Admin'e yeni başvuru bildirimi. */
  sendNewApplication(to: string, companyTitle: string): Promise<void>;
  /**
   * K-51: reddedilen adaya bilgi. Ret gerekçesi (iç not) e-postaya YAZILMAZ; yeniden başvuru
   * mümkündür.
   */
  sendRejection(to: string): Promise<void>;
  /** GR-BLD-001, K-26: ön sipariş gönderilince bayiye onay. */
  sendOrderConfirmation(to: string, order: OrderMail): Promise<void>;
  /** GR-BLD-001, K-26, K-17: ekibe "Yeni ön sipariş #no"; BizimHesap'a elle giriş için satır özeti içerir. */
  sendNewOrderToTeam(to: string, order: OrderMail): Promise<void>;
}

@Injectable()
export class DevMailService implements MailService {
  private readonly logger = new Logger('DevMail');

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService<Env, true>,
  ) {}

  sendPasswordReset(to: string, link: string): Promise<void> {
    this.log('Şifre sıfırlama', to, link);
    return Promise.resolve();
  }

  sendEmailVerification(to: string, link: string): Promise<void> {
    this.log('E-posta doğrulama', to, link);
    return Promise.resolve();
  }

  sendInvitation(to: string, link: string): Promise<void> {
    this.log('Davet / şifre belirleme', to, link);
    return Promise.resolve();
  }

  sendApprovalReminder(
    to: string,
    counts: { dueSoon: number; overdue: number },
  ): Promise<void> {
    this.log(
      'Onay hatırlatması',
      to,
      `${counts.overdue} başvuru 2 iş gününü aştı, ${counts.dueSoon} başvuru süreye yaklaşıyor`,
    );
    return Promise.resolve();
  }

  sendNewApplication(to: string, companyTitle: string): Promise<void> {
    this.log('Yeni başvuru', to, companyTitle);
    return Promise.resolve();
  }

  sendRejection(to: string): Promise<void> {
    this.log(
      'Başvuru sonucu',
      to,
      'Başvurunuz onaylanmadı. Bilgi için bizimle iletişime geçebilir, yeniden başvurabilirsiniz.',
    );
    return Promise.resolve();
  }

  sendOrderConfirmation(to: string, order: OrderMail): Promise<void> {
    this.log(
      `Ön sipariş #${order.orderNo} alındı`,
      to,
      `${order.lines.length} kalem, KDV hariç ${order.netTotal} TL, genel toplam ${order.grandTotal} TL; ${formatDelivery(order)}`,
    );
    return Promise.resolve();
  }

  sendNewOrderToTeam(to: string, order: OrderMail): Promise<void> {
    this.log(`Yeni ön sipariş #${order.orderNo}`, to, formatOrderForTeam(order));
    return Promise.resolve();
  }

  private log(subject: string, to: string, link: string): void {
    // Token'lı bağlantı yalnızca development/test'te log'a yazılır.
    if (isProductionLike(this.config.get('NODE_ENV', { infer: true }))) {
      this.logger.warn(
        `${subject} e-postası gönderilemedi: e-posta sağlayıcısı yapılandırılmadı.`,
      );
      return;
    }
    const from = this.config.get('MAIL_FROM', { infer: true });
    this.logger.log(`${subject} (${from}) -> ${to}: ${link}`);
  }
}

@Global()
@Module({
  providers: [{ provide: MAIL_SERVICE, useClass: DevMailService }],
  exports: [MAIL_SERVICE],
})
export class MailModule {}
