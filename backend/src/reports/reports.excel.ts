// Rapor Excel çıktıları. K-46: her rapor aynı parametrelerle Excel'e aktarılır; toplamlar ekrandakiyle aynıdır.
// Barkod/kod metin hücresi, para `#,##0.00` (sayı), tarih gerçek tarih hücresi (Europe/Istanbul yerel saati).
import ExcelJS from 'exceljs';
import { ISTANBUL_OFFSET_MS } from '../common/business-days.js';
import type { Comparative } from './reports.service.js';

type Kind = 'text' | 'money' | 'int' | 'count' | 'percent' | 'date';
interface Column<R> {
  header: string;
  width?: number;
  kind?: Kind | ((row: R) => Kind);
  value: (row: R) => string | number | Date | null | undefined;
}

const FORMATS: Record<Kind, string | undefined> = {
  text: '@',
  money: '#,##0.00',
  int: '0',
  count: '#,##0',
  percent: '0.0',
  date: 'dd.mm.yyyy hh:mm',
};

export interface ExcelFile {
  filename: string;
  data: Buffer;
}

/** Excel saat dilimi tutmaz: Türkiye kalıcı UTC+3 olduğundan duvar saati UTC bileşenlerine yazılır. */
const wall = (value: Date | string): Date => new Date(new Date(value).getTime() + ISTANBUL_OFFSET_MS);

export async function buildTable<R>(
  sheetName: string,
  filename: string,
  columns: Column<R>[],
  rows: R[],
  extra?: { title?: string[]; footer?: { value: string | number | null; kind?: Kind }[][] },
): Promise<ExcelFile> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(sheetName);
  for (const t of extra?.title ?? []) sheet.addRow([t]).font = { bold: true };
  if (extra?.title?.length) sheet.addRow([]);
  const header = sheet.addRow(columns.map((c) => c.header));
  header.font = { bold: true };
  const kindOf = (c: Column<R>, r: R): Kind => (typeof c.kind === 'function' ? c.kind(r) : (c.kind ?? 'text'));
  for (const r of rows) {
    const row = sheet.addRow(
      columns.map((c) => {
        const v = c.value(r);
        if (v === null || v === undefined) return null;
        const kind = kindOf(c, r);
        if (kind === 'date') return wall(v as Date | string);
        if (kind === 'money' || kind === 'percent' || kind === 'int' || kind === 'count') return Number(v);
        return v;
      }),
    );
    columns.forEach((c, i) => {
      const kind = kindOf(c, r);
      const fmt = FORMATS[kind];
      if (kind === 'text' || fmt) row.getCell(i + 1).numFmt = fmt ?? '@';
    });
  }
  for (const f of extra?.footer ?? []) {
    const row = sheet.addRow(f.map((c) => (c.kind && c.value !== null && c.kind !== 'text' ? Number(c.value) : c.value)));
    row.font = { bold: true };
    f.forEach((c, i) => {
      if (c.kind) row.getCell(i + 1).numFmt = FORMATS[c.kind] ?? '@';
    });
  }
  columns.forEach((c, i) => {
    sheet.getColumn(i + 1).width = c.width ?? Math.max(12, c.header.length + 4);
  });
  return { filename, data: Buffer.from(await wb.xlsx.writeBuffer()) };
}

/**
 * Karşılaştırmalı tutar için 7 sütun: dönem, önceki dönem, geçen yıl, fark (önceki), değişim % (önceki),
 * fark (geçen yıl), değişim % (geçen yıl).
 */
export function comparisonColumns<R>(label: string, get: (row: R) => Comparative<string>): Column<R>[] {
  return [
    { header: label, kind: 'money', value: (r) => get(r).current },
    { header: `${label} (önceki dönem)`, kind: 'money', width: 22, value: (r) => get(r).previous },
    { header: `${label} (geçen yıl)`, kind: 'money', width: 22, value: (r) => get(r).lastYear },
    { header: 'Fark (önceki dönem)', kind: 'money', width: 20, value: (r) => get(r).changePrev.amount },
    { header: 'Değişim % (önceki)', kind: 'percent', width: 18, value: (r) => get(r).changePrev.percent },
    { header: 'Fark (geçen yıl)', kind: 'money', width: 18, value: (r) => get(r).changeYear.amount },
    { header: 'Değişim % (geçen yıl)', kind: 'percent', width: 20, value: (r) => get(r).changeYear.percent },
  ];
}
