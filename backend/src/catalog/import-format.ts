// Excel toplu ürün yükleme biçimi ve satır ayrıştırma (saf kısım). K-59, K-60.
import ExcelJS from 'exceljs';
import { Money } from '../common/money.js';
import { foldTr } from '../common/like.js';
import { normalizeCompanyTitle } from '../dealers/company-title.js';
import { parseDecimalText } from './decimal.js';

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;
export const DEFAULT_VAT = '20.00';

export type ColumnKey =
  | 'barcode'
  | 'code'
  | 'bizimhesapId'
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
  { key: 'code', header: 'Ürün kodu', required: false, aliases: ['Kod'] },
  { key: 'bizimhesapId', header: 'BizimHesap ID', required: false, aliases: ['BizimHesap Ürün ID'] },
  { key: 'name', header: 'Ürün adı', required: true, aliases: ['Ad'] },
  { key: 'group', header: 'Ürün grubu', required: true, aliases: ['Grup'] },
  { key: 'caseQuantity', header: 'Koli içi adet', required: true, aliases: ['Koli içi'] },
  { key: 'listPrice', header: 'Liste fiyatı (KDV hariç)', required: true, aliases: ['Liste fiyatı'] },
  { key: 'vatRate', header: 'KDV oranı', required: false, aliases: ['KDV', 'KDV %'] },
  { key: 'description', header: 'Açıklama', required: false },
  { key: 'stock', header: 'Stok', required: false },
  { key: 'active', header: 'Aktif', required: false, aliases: ['Durum'] },
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
  /** K-80: boşsa null (mevcut üründe değişmez). */
  bizimhesapId: string | null;
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

const NUMERIC_BARCODE_MESSAGE =
  'Barkod hücresi sayı olarak kaydedilmiş; baştaki sıfırlar kaybolmuş olabilir. Sütunu Metin biçimine çevirip barkodu yeniden yazın.';

/** Hücre sayı (veya sayı sonuçlu formül) ise değeri, değilse null. */
function numericValue(value: ExcelJS.CellValue | undefined): number | null {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'result' in value && typeof value.result === 'number') {
    return value.result;
  }
  return null;
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
  let overLimit = false;
  // Yalnızca gerçekten var olan satırlar gezilir (biçimli boş satırlar milyonlarca olabilir).
  sheet.eachRow({ includeEmpty: false }, (excelRow, r) => {
    if (r < 2 || overLimit) return;
    const raw = (key: ColumnKey): string => {
      const col = columnIndex.get(key);
      return col === undefined ? '' : cellText(excelRow.getCell(col).value);
    };
    const cellOf = (key: ColumnKey) => {
      const col = columnIndex.get(key);
      return col === undefined ? undefined : excelRow.getCell(col);
    };
    if (COLUMNS.every((c) => raw(c.key) === '')) return;
    total++;
    if (total > MAX_IMPORT_ROWS) {
      overLimit = true;
      return;
    }

    const before = errors.length;
    const fail = (key: ColumnKey, message: string) =>
      errors.push({ row: r, column: columnTitle(key), message });

    let barcode = raw('barcode');
    const barcodeNumber = numericValue(cellOf('barcode')?.value);
    if (barcodeNumber !== null) {
      // Sayı hücresinde baştaki sıfırlar kaybolmuş olabilir: yalnızca EAN-8/EAN-13 uzunluğu güvenli sayılır.
      const digits = Number.isSafeInteger(barcodeNumber) && barcodeNumber > 0 ? String(barcodeNumber) : '';
      if (digits.length === 8 || digits.length === 13) {
        barcode = digits;
      } else {
        barcode = '';
        fail('barcode', NUMERIC_BARCODE_MESSAGE);
      }
    }
    if (barcodeNumber !== null && !barcode) {
      // hata yukarıda eklendi
    } else if (!barcode) fail('barcode', 'Barkod boş olamaz.');
    else if (barcode.length > 64) fail('barcode', 'Barkod en fazla 64 karakter olabilir.');
    else if (foldTr(barcode).startsWith('ornek')) fail('barcode', 'Şablondaki örnek satırı silin.');

    let code = raw('code');
    const codeNumber = numericValue(cellOf('code')?.value);
    if (codeNumber !== null) {
      if (Number.isSafeInteger(codeNumber) && codeNumber >= 0) code = String(codeNumber);
      else {
        code = '';
        fail('code', 'Ürün kodu sayı olarak geçersiz; sütunu Metin biçimine çevirip yeniden yazın.');
      }
    }
    if (code.length > 64) fail('code', 'Ürün kodu en fazla 64 karakter olabilir.');

    let bizimhesapId = raw('bizimhesapId');
    const bhNumber = numericValue(cellOf('bizimhesapId')?.value);
    if (bhNumber !== null) {
      if (Number.isSafeInteger(bhNumber) && bhNumber >= 0) bizimhesapId = String(bhNumber);
      else {
        bizimhesapId = '';
        fail('bizimhesapId', 'BizimHesap ID sayı olarak geçersiz; sütunu Metin biçimine çevirip yeniden yazın.');
      }
    }
    if (bizimhesapId.length > 100) fail('bizimhesapId', 'BizimHesap ID en fazla 100 karakter olabilir.');

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
      const vatCell = cellOf('vatRate');
      const vatNumber = numericValue(vatCell?.value);
      const percentFormat = typeof vatCell?.numFmt === 'string' && vatCell.numFmt.includes('%');
      // Yüzde biçimli hücrede 0,2 gerçekte %20'dir (değer × 100).
      const parsed = parseDecimalText(
        vatNumber !== null && percentFormat ? new Money(vatNumber).times(100).toString() : vatRaw,
      );
      if (parsed === null || parsed.length > 5) {
        fail('vatRate', 'KDV oranı 0 ile 99,99 arasında olmalı.');
      } else if (!percentFormat && new Money(parsed).gt(0) && new Money(parsed).lt(1)) {
        fail('vatRate', 'KDV oranını yüzde olarak yazın, ör. 20.');
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
      // Dışa aktarılan dosyada "Durum" sütunu Aktif/Pasif yazar (K-78: düzenlenip yeniden içe aktarılabilir).
      const v = yesNo(activeRaw, 'evet', 'hayir') ?? yesNo(activeRaw, 'aktif', 'pasif');
      if (v === undefined) fail('active', 'Aktif "Evet" veya "Hayır" olmalı.');
      else active = v;
    }

    if (errors.length === before) {
      rows.push({
        row: r,
        barcode,
        code: code || null,
        bizimhesapId: bizimhesapId || null,
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
  });
  if (overLimit) {
    return {
      total,
      rows: [],
      errors: [{ row: 1, column: 'Dosya', message: `En fazla ${MAX_IMPORT_ROWS} satır yüklenebilir.` }],
    };
  }
  return { total, rows, errors };
}
