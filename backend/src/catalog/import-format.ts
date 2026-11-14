// Excel toplu ürün yükleme biçimi ve satır ayrıştırma (saf kısım). K-59, K-60.
import ExcelJS from 'exceljs';
import { foldTr } from '../common/like.js';
import { normalizeCompanyTitle } from '../dealers/company-title.js';
import { parseDecimalText } from './decimal.js';

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;
export const DEFAULT_VAT = '20.00';

export type ColumnKey =
  | 'barcode'
  | 'code'
  | 'name'
  | 'group'
  | 'caseQuantity'
  | 'listPrice'
  | 'vatRate'
  | 'description'
  | 'stock'
  | 'active';

interface ColumnDef {
  key: ColumnKey;
  header: string;
  required: boolean;
  /** Başlık eşleştirmede kabul edilen ek yazımlar (normalize edilmeden önce). */
  aliases?: string[];
}

export const COLUMNS: ColumnDef[] = [
  { key: 'barcode', header: 'Barkod', required: true },
  { key: 'code', header: 'Ürün kodu', required: false },
  { key: 'name', header: 'Ürün adı', required: true },
  { key: 'group', header: 'Ürün grubu', required: true },
  { key: 'caseQuantity', header: 'Koli içi adet', required: true },
  { key: 'listPrice', header: 'Liste fiyatı (KDV hariç)', required: true, aliases: ['Liste fiyatı'] },
  { key: 'vatRate', header: 'KDV oranı', required: false },
  { key: 'description', header: 'Açıklama', required: false },
  { key: 'stock', header: 'Stok', required: false },
  { key: 'active', header: 'Aktif', required: false },
];

/** Başlık eşleştirme anahtarı: Türkçe harf, büyük/küçük harf, boşluk ve noktalama duyarsız. */
export function headerKey(value: string): string {
  return foldTr(value).replace(/[^a-z0-9]/g, '');
}

const HEADER_LOOKUP = new Map<string, ColumnDef>(
  COLUMNS.flatMap((c) => [c.header, ...(c.aliases ?? [])].map((h) => [headerKey(h), c] as const)),
);

export interface ImportRow {
  row: number;
  barcode: string;
  code: string | null;
  name: string;
  groupName: string;
  caseQuantity: number;
  listPrice: string;
  /** Boşsa null: yeni üründe %20 (K-60), mevcut üründe değişmez. */
  vatRate: string | null;
  description: string | null;
  stock: 'in_stock' | 'out_of_stock' | null;
  active: boolean | null;
}

export interface ImportError {
  row: number;
  column: string;
  message: string;
}

export interface ParsedSheet {
  /** Boş olmayan veri satırı sayısı (hatalı olanlar dahil). */
  total: number;
  rows: ImportRow[];
  errors: ImportError[];
}

const columnTitle = (key: ColumnKey) => COLUMNS.find((c) => c.key === key)!.header;

/** Hücre değerini düz metne çevirir (zengin metin, formül sonucu, bağlantı, sayı). */
export function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return Number.isInteger(value) ? value.toFixed(0) : String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date) return value.toISOString();
  if ('richText' in value) return value.richText.map((p) => p.text).join('').trim();
  if ('result' in value) return cellText(value.result as ExcelJS.CellValue);
  if ('text' in value) return cellText(value.text as ExcelJS.CellValue);
  return '';
}

const yesNo = (raw: string, yes: string, no: string): boolean | undefined => {
  const v = foldTr(raw).trim();
  if (v === yes) return true;
  if (v === no) return false;
  return undefined;
};

/** Çalışma sayfasını ayrıştırır; her hata Excel satır numarasıyla (başlık = 1) döner. */
export function parseSheet(sheet: ExcelJS.Worksheet): ParsedSheet {
  const errors: ImportError[] = [];
  const columnIndex = new Map<ColumnKey, number>();
  const header = sheet.getRow(1);
  header.eachCell({ includeEmpty: false }, (cell, col) => {
    const def = HEADER_LOOKUP.get(headerKey(cellText(cell.value)));
    if (!def) return;
    if (columnIndex.has(def.key)) {
      errors.push({ row: 1, column: def.header, message: 'Bu sütun başlığı birden çok kez var.' });
      return;
    }
    columnIndex.set(def.key, col);
  });
  for (const c of COLUMNS) {
    if (c.required && !columnIndex.has(c.key)) {
      errors.push({ row: 1, column: c.header, message: 'Zorunlu sütun bulunamadı.' });
    }
  }
  if (errors.length > 0) return { total: 0, rows: [], errors };

  const rows: ImportRow[] = [];
  let total = 0;
  const last = sheet.rowCount;
  for (let r = 2; r <= last; r++) {
    const excelRow = sheet.getRow(r);
    const raw = (key: ColumnKey): string => {
      const col = columnIndex.get(key);
      return col === undefined ? '' : cellText(excelRow.getCell(col).value);
    };
    if (COLUMNS.every((c) => raw(c.key) === '')) continue;
    total++;

    const before = errors.length;
    const fail = (key: ColumnKey, message: string) =>
      errors.push({ row: r, column: columnTitle(key), message });

    const barcode = raw('barcode');
    if (!barcode) fail('barcode', 'Barkod boş olamaz.');
    else if (barcode.length > 64) fail('barcode', 'Barkod en fazla 64 karakter olabilir.');
    else if (foldTr(barcode).startsWith('ornek')) fail('barcode', 'Şablondaki örnek satırı silin.');

    const code = raw('code');
    if (code.length > 64) fail('code', 'Ürün kodu en fazla 64 karakter olabilir.');

    const name = raw('name');
    if (!name) fail('name', 'Ürün adı boş olamaz.');
    else if (name.length > 300) fail('name', 'Ürün adı en fazla 300 karakter olabilir.');

    const groupName = normalizeCompanyTitle(raw('group'));
    if (!groupName) fail('group', 'Ürün grubu boş olamaz.');
    else if (groupName.length > 100) fail('group', 'Ürün grubu en fazla 100 karakter olabilir.');

    const caseRaw = raw('caseQuantity');
    let caseQuantity = 0;
    if (!/^\d+$/.test(caseRaw) || Number(caseRaw) < 1 || Number(caseRaw) > 1_000_000) {
      fail('caseQuantity', 'Koli içi adet 1 veya daha büyük bir tam sayı olmalı.');
    } else {
      caseQuantity = Number(caseRaw);
    }

    const priceRaw = raw('listPrice');
    const listPrice = priceRaw ? parseDecimalText(priceRaw) : null;
    if (listPrice === null || listPrice.length > 15) {
      fail('listPrice', 'Liste fiyatı geçerli bir tutar olmalı (örn. 19,99).');
    }

    const vatRaw = raw('vatRate');
    let vatRate: string | null = null;
    if (vatRaw) {
      const parsed = parseDecimalText(vatRaw);
      if (parsed === null || parsed.length > 5) {
        fail('vatRate', 'KDV oranı 0 ile 99,99 arasında olmalı.');
      } else {
        vatRate = parsed;
      }
    }

    const description = raw('description');
    if (description.length > 4000) fail('description', 'Açıklama en fazla 4000 karakter olabilir.');

    let stock: ImportRow['stock'] = null;
    const stockRaw = raw('stock');
    if (stockRaw) {
      const v = yesNo(stockRaw, 'var', 'yok');
      if (v === undefined) fail('stock', 'Stok "Var" veya "Yok" olmalı.');
      else stock = v ? 'in_stock' : 'out_of_stock';
    }

    let active: boolean | null = null;
    const activeRaw = raw('active');
    if (activeRaw) {
      const v = yesNo(activeRaw, 'evet', 'hayir');
      if (v === undefined) fail('active', 'Aktif "Evet" veya "Hayır" olmalı.');
      else active = v;
    }

    if (errors.length === before) {
      rows.push({
        row: r,
        barcode,
        code: code || null,
        name,
        groupName,
        caseQuantity,
        listPrice: listPrice!,
        vatRate,
        description: description || null,
        stock,
        active,
      });
    }
  }
  return { total, rows, errors };
}
