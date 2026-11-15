// Rapor Excel çıktıları. K-46: her rapor aynı parametrelerle Excel'e aktarılır; toplamlar ekrandakiyle aynıdır.
// Barkod/kod metin hücresi, para `#,##0.00` (sayı), tarih gerçek tarih hücresi (Europe/Istanbul yerel saati).
import ExcelJS from 'exceljs';
import { ISTANBUL_OFFSET_MS } from '../common/business-days.js';
import type { Comparative } from './reports.service.js';

type Kind = 'text' | 'money' | 'int' | 'percent' | 'date';
interface Column<R> {
  header: string;
  width?: number;
  kind?: Kind;
  value: (row: R) => string | number | Date | null | undefined;
}

const FORMATS: Record<Kind, string | undefined> = {
  text: '@',
  money: '#,##0.00',
  int: '0',
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
  extra?: { title?: string[]; footer?: (string | number | null)[][] },
): Promise<ExcelFile> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(sheetName);
  for (const t of extra?.title ?? []) sheet.addRow([t]).font = { bold: true };
  if (extra?.title?.length) sheet.addRow([]);
  const header = sheet.addRow(columns.map((c) => c.header));
  header.font = { bold: true };
  for (const r of rows) {
    const row = sheet.addRow(
      columns.map((c) => {
        const v = c.value(r);
        if (v === null || v === undefined) return null;
        if (c.kind === 'date') return wall(v as Date | string);
        if (c.kind === 'money' || c.kind === 'percent' || c.kind === 'int') return Number(v);
        return v;
      }),
    );
    columns.forEach((c, i) => {
      const fmt = FORMATS[c.kind ?? 'text'];
      if (c.kind === 'text' || fmt) row.getCell(i + 1).numFmt = fmt ?? '@';
    });
  }
  for (const f of extra?.footer ?? []) {
    const row = sheet.addRow(f);
    row.font = { bold: true };
  }
  columns.forEach((c, i) => {
    sheet.getColumn(i + 1).width = c.width ?? Math.max(12, c.header.length + 4);
  });
  return { filename, data: Buffer.from(await wb.xlsx.writeBuffer()) };
}

/** Karşılaştırmalı tutar için 5 sütun: dönem, önceki, geçen yıl, değişim % (önceki), değişim % (geçen yıl). */
export function comparisonColumns<R>(label: string, get: (row: R) => Comparative<string>): Column<R>[] {
  return [
    { header: label, kind: 'money', value: (r) => get(r).current },
    { header: `${label} (önceki dönem)`, kind: 'money', width: 22, value: (r) => get(r).previous },
    { header: `${label} (geçen yıl)`, kind: 'money', width: 22, value: (r) => get(r).lastYear },
    { header: 'Değişim % (önceki)', kind: 'percent', width: 18, value: (r) => get(r).changePrev.percent },
    { header: 'Değişim % (geçen yıl)', kind: 'percent', width: 20, value: (r) => get(r).changeYear.percent },
  ];
}
