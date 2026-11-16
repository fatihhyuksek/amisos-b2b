// Sipariş Excel'i: Admin ve bayi aynı düzeni kullanır (K-72). İç alanlar (BizimHesap aktarımı) yer almaz.
import ExcelJS from 'exceljs';
import { ISTANBUL_OFFSET_MS } from '../common/business-days.js';
import { Money } from '../common/money.js';
import { ORDER_STATUS_LABELS } from './order-status.js';

const DELIVERY_LABELS = {
  carrier: 'Ambar ile',
  pickup: 'Bayi kendisi alır',
  truck: 'Tır yüklemesi',
} as const;
const DATE_FORMAT = 'dd.mm.yyyy hh:mm';

/** Dışa aktarma için gereken sipariş görünümü (Admin ve bayi detayının ortak alt kümesi). */
export interface ExportableOrder {
  orderNo: number | null;
  submittedAt: Date;
  status: keyof typeof ORDER_STATUS_LABELS;
  deliveryMethod: keyof typeof DELIVERY_LABELS;
  deliveryAddress: string | null;
  carrierName: string | null;
  carrierBranch: string | null;
  note: string | null;
  /** En az companyTitle, contactName, phone içerir. */
  dealer: Record<string, string>;
  lines: {
    barcode: string;
    code: string | null;
    name: string;
    quantity: number;
    caseQuantity: number;
    listPrice: string;
    discountPercent: string | null;
    unitPrice: string;
    lineNet: string;
    vatRate: string;
    lineVat: string;
    outOfStock: boolean;
  }[];
  summary: { grossTotal: string; discountTotal: string; netTotal: string; vatTotal: string; grandTotal: string };
}

/**
 * Gerçek tarih hücresi, Europe/Istanbul yerel saatiyle. Excel saat dilimi tutmaz; Türkiye kalıcı
 * UTC+3 olduğundan (business-days.ts) duvar saati UTC bileşenlerine yazılır.
 */
export function excelDate(value: Date): Date {
  return new Date(value.getTime() + ISTANBUL_OFFSET_MS);
}

/** Tek sipariş: üstte başlık bilgisi, satır tablosu, altta toplamlar. Barkod/kod metin hücresidir. */
export async function buildOrderExport(order: ExportableOrder): Promise<{ filename: string; data: Buffer }> {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Sipariş');
    const delivery =
      order.deliveryMethod === 'carrier'
        ? `${DELIVERY_LABELS.carrier}: ${order.deliveryAddress ?? ''} (${order.carrierName ?? ''} / ${order.carrierBranch ?? ''})`
        : `${DELIVERY_LABELS[order.deliveryMethod]}: adres görüşmede belirlenecek`;
    const info: [string, string | number | Date][] = [
      ['Sipariş no', order.orderNo ?? ''],
      ['Tarih', excelDate(order.submittedAt)],
      ['Durum', ORDER_STATUS_LABELS[order.status]],
      ['Bayi', order.dealer.companyTitle],
      ['Yetkili', order.dealer.contactName],
      ['Telefon', order.dealer.phone],
      ['Teslimat', delivery],
      ...(order.note
        ? ([['Bayi notu', order.note]] as [string, string][])
        : []),
    ];
    for (const [label, value] of info) {
      const row = sheet.addRow([label, value]);
      row.getCell(1).font = { bold: true };
      row.getCell(2).alignment = { horizontal: 'left' };
      if (label === 'Telefon') row.getCell(2).numFmt = '@';
      if (label === 'Tarih') row.getCell(2).numFmt = DATE_FORMAT;
    }
    sheet.addRow([]);
    const headers = [
      'Barkod',
      'Ürün kodu',
      'Ürün adı',
      'Adet',
      'Koli içi',
      'Liste fiyatı',
      'İskonto %',
      'Birim fiyat (KDV hariç)',
      'Net tutar',
      'KDV %',
      'KDV',
      'Toplam',
      'Stokta yoktu',
    ];
    const headerRow = sheet.addRow(headers);
    headerRow.font = { bold: true };
    const money = '#,##0.00';
    for (const l of order.lines) {
      // Toplam = net + KDV (Decimal ile); hücreye yazarken sayıya çevrilir.
      const total = new Money(l.lineNet).plus(l.lineVat).toNumber();
      const row = sheet.addRow([
        l.barcode,
        l.code ?? '',
        l.name,
        l.quantity,
        l.caseQuantity,
        Number(l.listPrice),
        l.discountPercent === null ? 0 : Number(l.discountPercent),
        Number(l.unitPrice),
        Number(l.lineNet),
        Number(l.vatRate),
        Number(l.lineVat),
        total,
        l.outOfStock ? 'Evet' : '',
      ]);
      row.getCell(1).numFmt = '@';
      row.getCell(2).numFmt = '@';
      for (const c of [6, 8, 9, 11, 12]) row.getCell(c).numFmt = money;
      for (const c of [7, 10]) row.getCell(c).numFmt = '0.00';
    }
    sheet.addRow([]);
    const s = order.summary;
    for (const [label, value] of [
      ['Brüt toplam', s.grossTotal],
      ['İskonto', s.discountTotal],
      ['KDV hariç toplam', s.netTotal],
      ['KDV', s.vatTotal],
      ['Genel toplam', s.grandTotal],
    ] as const) {
      const row = sheet.addRow([
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        label,
        Number(value),
      ]);
      row.getCell(8).font = { bold: true };
      row.getCell(9).numFmt = money;
    }
    sheet.columns = [
      { width: 18 },
      { width: 14 },
      { width: 36 },
      { width: 8 },
      { width: 9 },
      { width: 13 },
      { width: 10 },
      { width: 22 },
      { width: 14 },
      { width: 8 },
      { width: 12 },
      { width: 14 },
      { width: 13 },
    ];
  return {
    filename: `siparis-${order.orderNo}.xlsx`,
    data: Buffer.from(await wb.xlsx.writeBuffer()),
  };
}
