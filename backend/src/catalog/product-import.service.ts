// Excel ile toplu ürün yükleme (K-59, K-60); API: docs/api/katalog-api.md.
// Barkod eşleşme anahtarıdır: varsa güncellenir, yoksa eklenir. Hata varsa hiçbir şey yazılmaz (hep-ya-hiç).
import {
  BadRequestException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { eq, inArray, sql } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { AuditService } from '../audit/audit.service.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { LOCK_PRODUCT_IMPORT, type Tx } from '../common/advisory-lock.js';
import { pickFreeSlug, slugify } from '../common/slug.js';
import { zipUncompressedSize } from '../common/zip-size.js';
import { allocateGroupSlug, loadTakenProductSlugs } from './slugs.js';
import { mapProductConflict } from './products.service.js';
import { DB, type Database } from '../database/database.module.js';
import { auditLog, productGroups, products } from '../database/schema.js';
import { companyTitleKey } from '../dealers/company-title.js';
import {
  COLUMNS,
  DEFAULT_VAT,
  MAX_IMPORT_ROWS,
  parseSheet,
  type ImportError,
  type ImportRow,
} from './import-format.js';

const MAX_REPORTED_ERRORS = 1000;
const CHUNK = 500;
const MAX_UNZIPPED_BYTES = 50 * 1024 * 1024;

export interface ImportReport {
  total: number;
  created: number;
  /** Yalnızca gerçekten değişen mevcut ürünler. */
  updated: number;
  /** Barkodu eşleşen ama hiçbir alanı değişmeyen ürünler. */
  unchanged: number;
  groupsCreated: string[];
  errors: ImportError[];
  /** Hata olmayan uyarılar (ör. pasif gruba düşen ürün). */
  warnings: { row: number; message: string }[];
  /** Hata listesi uzunsa ilk 1000 hata döner. */
  truncated?: boolean;
}

type ProductRow = typeof products.$inferSelect;

const invalidFile = (message: string) =>
  new BadRequestException({
    statusCode: 400,
    code: 'VALIDATION',
    message: 'Girilen bilgiler geçersiz.',
    fields: { file: message },
  });

@Injectable()
export class ProductImportService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** Başlık satırı, 2 örnek satır ve açıklama sayfası olan şablon. */
  async template(): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Ürünler');
    sheet.columns = COLUMNS.map((c) => ({
      header: c.header,
      key: c.key,
      width: Math.max(16, c.header.length + 4),
    }));
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    // Barkod ve kod metin olarak saklanır (baştaki sıfırlar korunur).
    sheet.getColumn('barcode').numFmt = '@';
    sheet.getColumn('code').numFmt = '@';
    sheet.getColumn('bizimhesapId').numFmt = '@';
    sheet.addRow({
      barcode: 'ORNEK0000001',
      code: 'ZC-ORNEK-1',
      name: "Çay Bardağı 6'lı",
      group: 'Bardak',
      caseQuantity: 12,
      listPrice: '48,90',
      vatRate: 20,
      description: 'Örnek satır; silip kendi ürünlerinizi yazın.',
      stock: 'Var',
      active: 'Evet',
    });
    sheet.addRow({
      barcode: 'ORNEK0000002',
      code: '',
      name: 'Meyve Tabağı',
      group: 'Tabak',
      caseQuantity: 6,
      listPrice: '19,99',
    });

    const info = wb.addWorksheet('Açıklama');
    info.getColumn(1).width = 28;
    info.getColumn(2).width = 100;
    info.addRow(['Sütun', 'Açıklama']).font = { bold: true };
    const notes: Record<string, string> = {
      barcode: 'Zorunlu. Eşleşme anahtarı: barkod sistemde varsa ürün güncellenir, yoksa eklenir.',
      code: 'İsteğe bağlı. BizimHesap ürün kodu. Boşsa mevcut üründe değişmez.',
      bizimhesapId: 'İsteğe bağlı (K-80). BizimHesap ürün ID\'si; yalnızca yazılır/güncellenir, eşleşme yine barkodladır. Boşsa mevcut üründe değişmez.',
      name: 'Zorunlu.',
      group: 'Zorunlu. Grup yoksa otomatik oluşturulur.',
      caseQuantity: 'Zorunlu. 1 veya daha büyük tam sayı.',
      listPrice: 'Zorunlu. KDV hariç. "19,99" veya 19.99 yazılabilir.',
      vatRate: 'İsteğe bağlı. Boşsa yeni üründe %20, mevcut üründe değişmez.',
      description: 'İsteğe bağlı. Boşsa mevcut üründe değişmez.',
      stock: '"Var" veya "Yok". Boşsa yeni üründe Var, mevcut üründe değişmez.',
      active: '"Evet" veya "Hayır". Boşsa yeni üründe Evet, mevcut üründe değişmez.',
    };
    for (const c of COLUMNS) info.addRow([c.header, notes[c.key]]);
    info.addRow([]);
    info.addRow([
      'Not',
      `Başlık adları sabittir, sütun sırası serbesttir. En fazla ${MAX_IMPORT_ROWS} satır. Barkodu ORNEK ile başlayan örnek satırlar kabul edilmez; silin.`,
    ]);

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /**
   * dryRun=true: yalnızca rapor. dryRun=false: hata yoksa tek transaction'da yazar; hata varsa 422
   * (aynı gövde) ve hiçbir şey yazılmaz.
   */
  async import(
    buffer: Buffer,
    filename: string,
    dryRun: boolean,
    adminId: string,
  ): Promise<ImportReport> {
    const unzipped = zipUncompressedSize(buffer);
    if (unzipped === null) throw invalidFile('Geçerli bir .xlsx dosyası yükleyin.');
    if (unzipped > MAX_UNZIPPED_BYTES) throw invalidFile('Dosya açıldığında çok büyük (en fazla 50 MB).');
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    } catch {
      throw invalidFile('Geçerli bir .xlsx dosyası yükleyin.');
    }
    const sheet = wb.getWorksheet('Ürünler') ?? wb.worksheets[0];
    if (!sheet) throw invalidFile('Dosyada çalışma sayfası yok.');
    const parsed = parseSheet(sheet);
    if (parsed.total > MAX_IMPORT_ROWS) {
      return this.finish(
        { total: parsed.total, created: 0, updated: 0, unchanged: 0, groupsCreated: [], errors: parsed.errors, warnings: [] },
        dryRun,
      );
    }
    const errors = [...parsed.errors];
    const rows = parsed.rows;

    // Dosya içi tekrarlar (barkod; kod).
    const seenBarcode = new Map<string, number>();
    const seenCode = new Map<string, ImportRow>();
    const seenBizimhesap = new Map<string, number>();
    const unique: ImportRow[] = [];
    for (const row of rows) {
      const firstRow = seenBarcode.get(row.barcode);
      if (firstRow !== undefined) {
        errors.push({ row: row.row, column: 'Barkod', message: `Bu barkod dosyada ${firstRow}. satırda da var.` });
        continue;
      }
      seenBarcode.set(row.barcode, row.row);
      if (row.code) {
        const other = seenCode.get(row.code);
        if (other) {
          errors.push({ row: row.row, column: 'Ürün kodu', message: `Bu ürün kodu dosyada ${other.row}. satırda başka bir barkodla var.` });
          continue;
        }
        seenCode.set(row.code, row);
      }
      if (row.bizimhesapId) {
        const other = seenBizimhesap.get(row.bizimhesapId);
        if (other !== undefined) {
          errors.push({ row: row.row, column: 'BizimHesap ID', message: `Bu BizimHesap ID dosyada ${other}. satırda başka bir barkodla var.` });
          continue;
        }
        seenBizimhesap.set(row.bizimhesapId, row.row);
      }
      unique.push(row);
    }

    const report = await this.db.transaction(async (tx) => {
      if (!dryRun) await tx.execute(sql`select pg_advisory_xact_lock(${LOCK_PRODUCT_IMPORT})`);
      const plan = await this.plan(tx, unique);
      errors.push(...plan.errors);
      const result: ImportReport = {
        total: parsed.total,
        created: plan.toCreate.length,
        updated: plan.toUpdate.length,
        unchanged: plan.unchanged,
        groupsCreated: plan.groupsToCreate.map((g) => g.name),
        errors: [],
        warnings: plan.warnings,
      };
      errors.sort((a, b) => a.row - b.row);
      result.errors = errors;
      if (dryRun || errors.length > 0) return result;

      try {
        await this.apply(tx, plan, adminId);
        await this.audit.record(
          {
            actorType: 'admin',
            actorId: adminId,
            action: 'product.imported',
            entityType: 'products',
            entityId: 'import',
            data: {
              filename,
              total: result.total,
              created: result.created,
              updated: result.updated,
              unchanged: result.unchanged,
              groupsCreated: result.groupsCreated,
            },
          },
          tx,
        );
      } catch (error) {
        return mapProductConflict(error);
      }
      return result;
    });
    return this.finish(report, dryRun);
  }

  private finish(report: ImportReport, dryRun: boolean): ImportReport {
    const out = { ...report };
    if (out.errors.length > MAX_REPORTED_ERRORS) {
      out.errors = out.errors.slice(0, MAX_REPORTED_ERRORS);
      out.truncated = true;
    }
    if (!dryRun && out.errors.length > 0) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        code: 'IMPORT_INVALID',
        message: 'Dosyada hatalar var; hiçbir satır kaydedilmedi.',
        ...out,
      });
    }
    return out;
  }

  /** Veritabanıyla karşılaştırır: tek sorguda mevcut barkodlar/kodlar ve tüm gruplar. */
  private async plan(tx: Tx, rows: ImportRow[]) {
    const errors: ImportError[] = [];
    const barcodes = rows.map((r) => r.barcode);
    const codes = rows.flatMap((r) => (r.code ? [r.code] : []));
    const existing: ProductRow[] = [];
    for (let i = 0; i < barcodes.length; i += 2000) {
      existing.push(
        ...(await tx.select().from(products).where(inArray(products.barcode, barcodes.slice(i, i + 2000)))),
      );
    }
    const byBarcode = new Map(existing.map((p) => [p.barcode, p]));
    const codeOwner = new Map<string, string>();
    for (let i = 0; i < codes.length; i += 2000) {
      const owners = await tx
        .select({ code: products.code, barcode: products.barcode })
        .from(products)
        .where(inArray(products.code, codes.slice(i, i + 2000)));
      for (const o of owners) if (o.code) codeOwner.set(o.code, o.barcode);
    }
    const bhIds = rows.flatMap((r) => (r.bizimhesapId ? [r.bizimhesapId] : []));
    const bhOwner = new Map<string, string>();
    for (let i = 0; i < bhIds.length; i += 2000) {
      const owners = await tx
        .select({ id: products.bizimhesapId, barcode: products.barcode })
        .from(products)
        .where(inArray(products.bizimhesapId, bhIds.slice(i, i + 2000)));
      for (const o of owners) if (o.id) bhOwner.set(o.id, o.barcode);
    }
    const groups = await tx.select().from(productGroups);
    const groupByKey = new Map(groups.map((g) => [g.nameKey, g]));

    const groupsToCreate = new Map<string, { name: string; key: string }>();
    const toCreate: { row: ImportRow; groupKey: string }[] = [];
    const toUpdate: {
      row: ImportRow;
      groupKey: string;
      current: ProductRow;
      next: Partial<typeof products.$inferInsert>;
      changes: Record<string, { previous: unknown; next: unknown }>;
    }[] = [];
    const warnings: { row: number; message: string }[] = [];
    let unchanged = 0;
    for (const row of rows) {
      if (row.code) {
        const owner = codeOwner.get(row.code);
        if (owner !== undefined && owner !== row.barcode) {
          errors.push({
            row: row.row,
            column: 'Ürün kodu',
            message: `Bu ürün kodu başka bir üründe (barkod ${owner}) kullanılıyor.`,
          });
          continue;
        }
      }
      if (row.bizimhesapId) {
        const owner = bhOwner.get(row.bizimhesapId);
        if (owner !== undefined && owner !== row.barcode) {
          errors.push({
            row: row.row,
            column: 'BizimHesap ID',
            message: `Bu BizimHesap ID başka bir üründe (barkod ${owner}) kullanılıyor.`,
          });
          continue;
        }
      }
      const groupKey = companyTitleKey(row.groupName);
      const group = groupByKey.get(groupKey);
      if (!group && !groupsToCreate.has(groupKey)) {
        groupsToCreate.set(groupKey, { name: row.groupName, key: groupKey });
      }
      if (group && !group.isActive) {
        warnings.push({ row: row.row, message: 'Ürün grubu pasif; ürün katalogda görünmez.' });
      }
      const current = byBarcode.get(row.barcode);
      if (!current) {
        toCreate.push({ row, groupKey });
        continue;
      }
      const next: Partial<typeof products.$inferInsert> = {
        name: row.name,
        caseQuantity: row.caseQuantity,
        listPrice: row.listPrice,
      };
      // Boş Ürün kodu / Açıklama / KDV / Stok / Aktif mevcut üründe değişmez.
      if (row.vatRate !== null) next.vatRate = row.vatRate;
      if (row.code !== null) next.code = row.code;
      if (row.bizimhesapId !== null) next.bizimhesapId = row.bizimhesapId;
      if (row.description !== null) next.description = row.description;
      if (row.stock !== null) next.stockStatus = row.stock;
      if (row.active !== null) next.isActive = row.active;
      const changes: Record<string, { previous: unknown; next: unknown }> = {};
      for (const [key, value] of Object.entries(next)) {
        const previous = current[key as keyof ProductRow];
        // numeric sütunlar "48.90" biçiminde gelir; aynı biçimde karşılaştırılır.
        if (previous !== value) changes[key] = { previous, next: value };
      }
      if (!group || group.id !== current.groupId) {
        changes.groupId = { previous: current.groupId, next: group?.id ?? null };
      }
      if (Object.keys(changes).length === 0) unchanged++;
      else toUpdate.push({ row, groupKey, current, next, changes });
    }
    return {
      errors,
      warnings,
      unchanged,
      toCreate,
      toUpdate,
      groupsToCreate: [...groupsToCreate.values()],
      groupByKey,
    };
  }

  private async apply(tx: Tx, plan: Awaited<ReturnType<ProductImportService['plan']>>, adminId: string) {
    const now = this.clock.now();
    const groupIds = new Map([...plan.groupByKey].map(([k, g]) => [k, g.id]));
    for (const g of plan.groupsToCreate) {
      const [created] = await tx
        .insert(productGroups)
        .values({ name: g.name, nameKey: g.key, slug: await allocateGroupSlug(tx, g.name) })
        .returning({ id: productGroups.id });
      groupIds.set(g.key, created.id);
      await this.audit.record(
        {
          actorType: 'admin',
          actorId: adminId,
          action: 'product_group.created',
          entityType: 'product_groups',
          entityId: created.id,
          data: { name: g.name, source: 'import' },
        },
        tx,
      );
    }

    // K-82: yeni ürünlerin slug'ı addan üretilir; tahsis bellekte (ürün başına sorgu yok).
    const takenSlugs = await loadTakenProductSlugs(tx);
    const slugFor = (name: string) => {
      const slug = pickFreeSlug(slugify(name, 'urun'), takenSlugs);
      takenSlugs.add(slug);
      return slug;
    };
    for (let i = 0; i < plan.toCreate.length; i += CHUNK) {
      await tx.insert(products).values(
        plan.toCreate.slice(i, i + CHUNK).map(({ row, groupKey }) => ({
          bizimhesapId: row.bizimhesapId,
          slug: slugFor(row.name),
          groupId: groupIds.get(groupKey)!,
          barcode: row.barcode,
          code: row.code,
          name: row.name,
          description: row.description,
          caseQuantity: row.caseQuantity,
          listPrice: row.listPrice,
          vatRate: row.vatRate ?? DEFAULT_VAT, // K-60
          stockStatus: row.stock ?? ('in_stock' as const),
          stockSource: 'manual' as const,
          stockUpdatedAt: now,
          isActive: row.active ?? true,
        })),
      );
    }

    const audits: (typeof auditLog.$inferInsert)[] = [];
    for (const { groupKey, current, next, changes } of plan.toUpdate) {
      const set = { ...next, groupId: groupIds.get(groupKey)! };
      if (changes.groupId) changes.groupId.next = set.groupId;
      if (changes.stockStatus) {
        set.stockSource = 'manual';
        set.stockUpdatedAt = now;
      }
      await tx.update(products).set(set).where(eq(products.id, current.id));
      audits.push({
        actorType: 'admin',
        actorId: adminId,
        action: 'product.updated',
        entityType: 'products',
        entityId: current.id,
        data: { changes, source: 'import' },
      });
    }
    for (let i = 0; i < audits.length; i += CHUNK) {
      await tx.insert(auditLog).values(audits.slice(i, i + CHUNK));
    }
  }
}
