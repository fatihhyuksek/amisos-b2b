// Bayi fiyat listesi Excel'i. K-72, GR-FIY-001. Fiyat bayinin iskontosuyla sunucuda hesaplanır;
// yetki DealerGuard'da. Para hesabı pricing.service (Decimal) ile; hücreye yazılırken sayıya çevrilir.
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { CLOCK, type Clock } from '../common/clock.js';
import { BUSINESS_TIME_ZONE } from '../common/business-days.js';
import { DB, type Database } from '../database/database.module.js';
import { dealers, productGroups, products } from '../database/schema.js';
import { loadDealerRates } from '../pricing/dealer-rates.js';
import { calculateDealerPrice } from '../pricing/pricing.service.js';
import { isPriceOnRequest } from './catalog.service.js';

@Injectable()
export class PriceListService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async build(dealerId: string): Promise<{ filename: string; data: Buffer }> {
    const [dealer] = await this.db
      .select({ companyTitle: dealers.companyTitle })
      .from(dealers)
      .where(eq(dealers.id, dealerId));
    if (!dealer) throw new NotFoundException('Bayi bulunamadı.');
    const rates = await loadDealerRates(this.db, dealerId);
    const rows = await this.db
      .select({ product: products, groupName: productGroups.name })
      .from(products)
      .innerJoin(productGroups, eq(productGroups.id, products.groupId))
      .where(and(eq(products.isActive, true), eq(productGroups.isActive, true)))
      .orderBy(
        asc(productGroups.sortOrder),
        asc(productGroups.name),
        asc(sql`lower(${products.name})`),
        asc(products.id),
      );

    const now = this.clock.now();
    const dayIso = new Intl.DateTimeFormat('sv-SE', { timeZone: BUSINESS_TIME_ZONE }).format(now);
    const dayTr = new Intl.DateTimeFormat('tr-TR', {
      timeZone: BUSINESS_TIME_ZONE,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(now);

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Fiyat listesi');
    sheet.addRow(['AMİSOS B2B Fiyat Listesi']).font = { bold: true, size: 14 };
    sheet.addRow([dealer.companyTitle]).font = { bold: true };
    sheet.addRow([`Tarih: ${dayTr}`]);
    sheet.addRow(['Fiyatlar KDV hariçtir']);
    sheet.addRow([]);
    sheet.addRow([
      'Barkod',
      'Ürün kodu',
      'Ürün adı',
      'Grup',
      'Koli içi',
      'Liste fiyatı',
      'İskonto %',
      'Size özel birim fiyat (KDV hariç)',
      'KDV %',
      'Stok',
    ]).font = { bold: true };
    const money = '#,##0.00';
    for (const { product, groupName } of rows) {
      const { price, discountPercent } = calculateDealerPrice(
        product.listPrice,
        rates.general,
        rates.byGroup.get(product.groupId),
      );
      // K-79: fiyatı girilmemiş üründe fiyat hücreleri boş, Stok yerinde "Fiyat sorunuz".
      const onRequest = isPriceOnRequest(product.listPrice);
      const row = sheet.addRow([
        product.barcode,
        product.code ?? '',
        product.name,
        groupName,
        product.caseQuantity,
        onRequest ? null : Number(product.listPrice),
        onRequest ? null : discountPercent === null ? 0 : Number(discountPercent),
        onRequest ? null : Number(price),
        Number(product.vatRate),
        onRequest ? 'Fiyat sorunuz' : product.stockStatus === 'in_stock' ? 'Var' : 'Yok',
      ]);
      row.getCell(1).numFmt = '@';
      row.getCell(2).numFmt = '@';
      row.getCell(6).numFmt = money;
      row.getCell(8).numFmt = money;
      row.getCell(7).numFmt = '0.00';
      row.getCell(9).numFmt = '0.00';
    }
    sheet.columns = [
      { width: 18 },
      { width: 14 },
      { width: 40 },
      { width: 22 },
      { width: 9 },
      { width: 13 },
      { width: 10 },
      { width: 30 },
      { width: 8 },
      { width: 14 },
    ];
    return { filename: `fiyat-listesi-${dayIso}.xlsx`, data: Buffer.from(await wb.xlsx.writeBuffer()) };
  }
}
