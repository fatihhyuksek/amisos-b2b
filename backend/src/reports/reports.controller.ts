// Rapor uçları. Yetki sunucuda: yalnızca Admin (GR-YON-001); anonim 401, bayi 403.
import { Controller, Get, Inject, Param, ParseUUIDPipe, Query, Res, UseGuards, UsePipes } from '@nestjs/common';
import type { Response } from 'express';
import { AdminGuard } from '../auth/auth.guards.js';
import { JsonOnlyGuard } from '../auth/json-only.guard.js';
import { createValidationPipe } from '../common/validation.js';
import { ORDER_STATUS_LABELS } from '../orders/order-status.js';
import { buildTable, comparisonColumns, type ExcelFile } from './reports.excel.js';
import {
  dealerProductsSchema,
  inactiveSchema,
  periodSchema,
  productsReportSchema,
  reportOrdersSchema,
  trendSchema,
  type DealerProductsQuery,
  type InactiveQuery,
  type PeriodQuery,
  type ProductsReportQuery,
  type ReportOrdersQuery,
  type TrendQuery,
} from './reports.schemas.js';
import { ReportsService } from './reports.service.js';

function send(res: Response, file: ExcelFile): void {
  res
    .status(200)
    .set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Content-Length': String(file.data.length),
      'Cache-Control': 'no-store',
    })
    .end(file.data);
}

const name = (report: string, p: { from: string; to: string }) => `rapor-${report}-${p.from}-${p.to}.xlsx`;

@Controller('admin/reports')
@UseGuards(JsonOnlyGuard, AdminGuard)
@UsePipes(createValidationPipe())
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}

  @Get('overview')
  overview(@Query({ schema: periodSchema }) q: PeriodQuery) {
    return this.reports.overview(q);
  }

  @Get('overview/export.xlsx')
  async overviewXlsx(@Query({ schema: periodSchema }) q: PeriodQuery, @Res() res: Response) {
    const d = await this.reports.overview(q);
    const rows = [
      { label: 'Sipariş sayısı', c: d.metrics.orderCount, money: false },
      { label: 'KDV hariç toplam', c: d.metrics.netTotal, money: true },
      { label: 'KDV', c: d.metrics.vatTotal, money: true },
      { label: 'Genel toplam', c: d.metrics.grandTotal, money: true },
      { label: 'Sipariş veren bayi sayısı', c: d.metrics.orderingDealerCount, money: false },
      { label: 'Ortalama sipariş (KDV hariç)', c: d.metrics.averageOrderNet, money: true },
    ];
    send(
      res,
      await buildTable(
        'Genel bakış',
        name('genel-bakis', d.period),
        [
          { header: 'Metrik', width: 30, value: (r: (typeof rows)[number]) => r.label },
          { header: `Dönem (${d.period.from} – ${d.period.to})`, kind: 'money', width: 26, value: (r) => r.c.current },
          { header: `Önceki dönem (${d.previous.from} – ${d.previous.to})`, kind: 'money', width: 34, value: (r) => r.c.previous },
          { header: `Geçen yıl (${d.lastYear.from} – ${d.lastYear.to})`, kind: 'money', width: 34, value: (r) => r.c.lastYear },
          { header: 'Değişim % (önceki)', kind: 'percent', width: 18, value: (r) => r.c.changePrev.percent },
          { header: 'Değişim % (geçen yıl)', kind: 'percent', width: 20, value: (r) => r.c.changeYear.percent },
        ],
        rows,
      ),
    );
  }

  @Get('trend')
  trend(@Query({ schema: trendSchema }) q: TrendQuery) {
    return this.reports.trend(q);
  }

  @Get('trend/export.xlsx')
  async trendXlsx(@Query({ schema: trendSchema }) q: TrendQuery, @Res() res: Response) {
    const items = await this.reports.trend(q);
    send(
      res,
      await buildTable(
        'Aylık trend',
        `rapor-trend-${items[0].month}-${items[items.length - 1].month}.xlsx`,
        [
          { header: 'Ay', value: (r: (typeof items)[number]) => r.month },
          { header: 'Sipariş sayısı', kind: 'int', value: (r) => r.orderCount },
          { header: 'KDV hariç toplam', kind: 'money', width: 18, value: (r) => r.netTotal },
          { header: 'Geçen yıl aynı ay', kind: 'money', width: 18, value: (r) => r.lastYearNetTotal },
        ],
        items,
      ),
    );
  }

  @Get('orders')
  orders(@Query({ schema: reportOrdersSchema }) q: ReportOrdersQuery) {
    return this.reports.orders(q);
  }

  @Get('orders/export.xlsx')
  async ordersXlsx(@Query({ schema: reportOrdersSchema }) q: ReportOrdersQuery, @Res() res: Response) {
    // Excel'de sayfalama yok: dönemin tüm siparişleri (en fazla 5000).
    const d = await this.reports.orders({ ...q, page: 1, pageSize: 100 });
    const items = [...d.items];
    for (let page = 2; items.length < d.total && page <= 50; page++) {
      items.push(...(await this.reports.orders({ ...q, page, pageSize: 100 })).items);
    }
    send(
      res,
      await buildTable(
        'Siparişler',
        name('siparisler', d.period),
        [
          { header: 'Sipariş no', kind: 'int', value: (r: (typeof items)[number]) => r.orderNo },
          { header: 'Tarih', kind: 'date', width: 18, value: (r) => r.submittedAt as unknown as Date },
          { header: 'Bayi', width: 36, value: (r) => r.dealer.companyTitle },
          { header: 'Durum', value: (r) => ORDER_STATUS_LABELS[r.status as keyof typeof ORDER_STATUS_LABELS] },
          { header: 'Kalem', kind: 'int', value: (r) => r.lineCount },
          { header: 'KDV hariç toplam', kind: 'money', width: 18, value: (r) => r.netTotal },
          { header: 'Genel toplam', kind: 'money', width: 16, value: (r) => r.grandTotal },
        ],
        items,
        {
          footer: [
            [],
            ['İptal hariç toplam', null, null, null, d.totals.orderCount, Number(d.totals.netTotal), Number(d.totals.grandTotal)],
          ],
        },
      ),
    );
  }

  @Get('dealers')
  dealers(@Query({ schema: periodSchema }) q: PeriodQuery) {
    return this.reports.dealerSales(q);
  }

  @Get('dealers/export.xlsx')
  async dealersXlsx(@Query({ schema: periodSchema }) q: PeriodQuery, @Res() res: Response) {
    const d = await this.reports.dealerSales(q);
    send(
      res,
      await buildTable(
        'Bayiler',
        name('bayiler', d.period),
        [
          { header: 'Bayi', width: 36, value: (r: (typeof d.items)[number]) => r.companyTitle },
          { header: 'İl', value: (r) => r.city },
          { header: 'Sipariş sayısı', kind: 'int', value: (r) => r.orderCount },
          ...comparisonColumns('KDV hariç toplam', (r: (typeof d.items)[number]) => r.netTotal),
          { header: 'Genel toplam', kind: 'money', width: 16, value: (r) => r.grandTotal },
          { header: 'Son sipariş', kind: 'date', width: 18, value: (r) => r.lastOrderAt as unknown as Date },
        ],
        d.items,
      ),
    );
  }

  @Get('dealers/:id/products')
  dealerProducts(@Param('id', new ParseUUIDPipe()) id: string, @Query({ schema: dealerProductsSchema }) q: DealerProductsQuery) {
    return this.reports.dealerProducts(id, q);
  }

  @Get('dealers/:id/products/export.xlsx')
  async dealerProductsXlsx(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query({ schema: dealerProductsSchema }) q: DealerProductsQuery,
    @Res() res: Response,
  ) {
    const d = await this.reports.dealerProducts(id, q);
    send(
      res,
      await buildTable(
        'Ürünler',
        name('bayi-urunleri', d.period),
        [
          { header: 'Barkod', width: 18, value: (r: (typeof d.items)[number]) => r.barcode as string },
          { header: 'Ürün adı', width: 36, value: (r) => r.name as string },
          { header: 'Ürün grubu', width: 18, value: (r) => r.groupName as string },
          { header: 'Adet', kind: 'int', value: (r) => r.quantity as number },
          { header: 'KDV hariç toplam', kind: 'money', width: 18, value: (r) => r.netTotal },
        ],
        d.items,
        { title: [`Bayi: ${d.dealer.companyTitle as string}`] },
      ),
    );
  }

  @Get('inactive-dealers')
  inactive(@Query({ schema: inactiveSchema }) q: InactiveQuery) {
    return this.reports.inactiveDealers(q);
  }

  @Get('inactive-dealers/export.xlsx')
  async inactiveXlsx(@Query({ schema: inactiveSchema }) q: InactiveQuery, @Res() res: Response) {
    const d = await this.reports.inactiveDealers(q);
    const today = new Date().toISOString().slice(0, 10);
    send(
      res,
      await buildTable(
        'Sipariş vermeyen bayiler',
        `rapor-pasif-bayiler-${today}.xlsx`,
        [
          { header: 'Bayi', width: 36, value: (r: (typeof d.items)[number]) => r.companyTitle },
          { header: 'Yetkili', width: 22, value: (r) => r.contactName },
          { header: 'Telefon', width: 16, kind: 'text', value: (r) => r.phone },
          { header: 'İl', value: (r) => r.city },
          { header: 'Son sipariş', kind: 'date', width: 18, value: (r) => r.lastOrderAt },
          { header: 'Gün', kind: 'int', value: (r) => r.daysSinceLastOrder },
        ],
        d.items,
      ),
    );
  }

  @Get('products')
  products(@Query({ schema: productsReportSchema }) q: ProductsReportQuery) {
    return this.reports.products(q);
  }

  @Get('products/export.xlsx')
  async productsXlsx(@Query({ schema: productsReportSchema }) q: ProductsReportQuery, @Res() res: Response) {
    const d = await this.reports.products(q);
    send(
      res,
      await buildTable(
        'Ürünler',
        name('urunler', d.period),
        [
          { header: 'Barkod', width: 18, value: (r: (typeof d.items)[number]) => r.barcode as string },
          { header: 'Ürün kodu', width: 14, value: (r) => r.code as string | null },
          { header: 'Ürün adı', width: 36, value: (r) => r.name as string },
          { header: 'Ürün grubu', width: 18, value: (r) => r.groupName as string },
          { header: 'Adet', kind: 'int', value: (r) => r.quantity as number },
          { header: 'Sipariş sayısı', kind: 'int', value: (r) => r.orderCount as number },
          { header: 'Bayi sayısı', kind: 'int', value: (r) => r.dealerCount as number },
          { header: 'KDV hariç toplam', kind: 'money', width: 18, value: (r) => r.netTotal },
        ],
        d.items,
      ),
    );
  }

  @Get('groups')
  groups(@Query({ schema: periodSchema }) q: PeriodQuery) {
    return this.reports.groups(q);
  }

  @Get('groups/export.xlsx')
  async groupsXlsx(@Query({ schema: periodSchema }) q: PeriodQuery, @Res() res: Response) {
    const d = await this.reports.groups(q);
    send(
      res,
      await buildTable(
        'Ürün grupları',
        name('gruplar', d.period),
        [
          { header: 'Ürün grubu', width: 28, value: (r: (typeof d.items)[number]) => r.name },
          { header: 'Adet', kind: 'int', value: (r) => r.quantity },
          ...comparisonColumns('KDV hariç toplam', (r: (typeof d.items)[number]) => r.netTotal),
          { header: 'Pay %', kind: 'percent', value: (r) => r.sharePercent },
        ],
        d.items,
      ),
    );
  }

  @Get('status')
  status(@Query({ schema: periodSchema }) q: PeriodQuery) {
    return this.reports.statusDistribution(q);
  }

  @Get('status/export.xlsx')
  async statusXlsx(@Query({ schema: periodSchema }) q: PeriodQuery, @Res() res: Response) {
    const d = await this.reports.statusDistribution(q);
    send(
      res,
      await buildTable(
        'Durumlar',
        name('durumlar', d.period),
        [
          { header: 'Durum', value: (r: (typeof d.items)[number]) => r.label },
          { header: 'Sipariş sayısı', kind: 'int', value: (r) => r.count },
          { header: 'Ortalama bekleme (saat)', kind: 'percent', width: 24, value: (r) => r.averageHoursInStatus },
        ],
        d.items,
      ),
    );
  }

  @Get('out-of-stock')
  outOfStock(@Query({ schema: periodSchema }) q: PeriodQuery) {
    return this.reports.outOfStock(q);
  }

  @Get('out-of-stock/export.xlsx')
  async outOfStockXlsx(@Query({ schema: periodSchema }) q: PeriodQuery, @Res() res: Response) {
    const d = await this.reports.outOfStock(q);
    send(
      res,
      await buildTable(
        'Stokta yokken sipariş',
        name('stokta-yok', d.period),
        [
          { header: 'Barkod', width: 18, value: (r: (typeof d.items)[number]) => r.barcode as string },
          { header: 'Ürün adı', width: 36, value: (r) => r.name as string },
          { header: 'Ürün grubu', width: 18, value: (r) => r.groupName as string },
          { header: 'Adet', kind: 'int', value: (r) => r.quantity as number },
          { header: 'Sipariş sayısı', kind: 'int', value: (r) => r.orderCount as number },
          { header: 'Bayi sayısı', kind: 'int', value: (r) => r.dealerCount as number },
          { header: 'Son sipariş', kind: 'date', width: 18, value: (r) => r.lastOrderedAt as unknown as Date },
        ],
        d.items,
      ),
    );
  }

  @Get('today')
  today() {
    return this.reports.today();
  }
}
