// Bayi hesabı. K-67 (bilgiler), K-68 (vergi), K-69 (kayıtlı adresler); GR-KVK-001 (pazarlama onayı).
// Her yazma işlemi audit_log'a yazılır (GR-YON-001).
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service.js';
import type { Tx } from '../common/advisory-lock.js';
import { BUSINESS_TIME_ZONE } from '../common/business-days.js';
import { CLOCK, type Clock } from '../common/clock.js';
import { CONSENT_DOCUMENT_VERSION } from '../common/consents.js';
import { DB, type Database } from '../database/database.module.js';
import { consents, dealerAddresses, dealers, orders } from '../database/schema.js';
import {
  MAX_ADDRESSES,
  type CreateAddressInput,
  type UpdateAccountInput,
  type UpdateAddressInput,
} from './account.schemas.js';

type AddressRow = typeof dealerAddresses.$inferSelect;
const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

const addressDto = (a: AddressRow) => ({
  id: a.id,
  label: a.label,
  carrierName: a.carrierName,
  carrierBranch: a.carrierBranch,
  address: a.address,
  city: a.city,
  district: a.district,
  isDefault: a.isDefault,
  createdAt: a.createdAt.toISOString(),
});

@Injectable()
export class AccountService {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  // --- Hesap (K-67) ---------------------------------------------------------

  async get(dealerId: string) {
    const [d] = await this.db.select().from(dealers).where(eq(dealers.id, dealerId));
    if (!d) throw new NotFoundException('Hesap bulunamadı.');
    const [marketing] = await this.db
      .select({ granted: consents.granted })
      .from(consents)
      .where(and(eq(consents.dealerId, dealerId), eq(consents.type, 'marketing')))
      .orderBy(desc(consents.createdAt));
    return {
      companyTitle: d.companyTitle,
      taxOffice: d.taxOffice,
      taxNumber: d.taxNumber,
      contactName: d.contactName,
      email: d.email,
      phone: d.phone,
      city: d.city,
      district: d.district,
      address: d.address,
      generalDiscountPercent: d.generalDiscountPercent,
      memberSince: (d.reviewedAt ?? d.createdAt).toISOString(),
      lastLoginAt: iso(d.lastLoginAt),
      marketingConsent: marketing?.granted ?? false,
      stats: await this.stats(dealerId),
    };
  }

  /**
   * openOrderCount: submitted/negotiating/approved/shipped. yearNetTotal: bu takvim yılı (Europe/Istanbul),
   * iptal hariç, KDV hariç net toplam (numeric toplam veritabanında; para hesabı JS number ile yapılmaz).
   */
  private async stats(dealerId: string) {
    const year = Number(
      new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIME_ZONE, year: 'numeric' }).format(this.clock.now()),
    );
    const [row] = await this.db
      .select({
        orderCount: sql<number>`count(*)::int`,
        openOrderCount: sql<number>`(count(*) filter (where ${orders.status} in ('submitted','negotiating','approved','shipped')))::int`,
        yearNetTotal: sql<string>`coalesce(sum(${orders.netTotal}) filter (where ${orders.status} <> 'cancelled' and ${orders.submittedAt} >= (make_timestamp(${year}, 1, 1, 0, 0, 0) at time zone ${BUSINESS_TIME_ZONE}) and ${orders.submittedAt} < (make_timestamp(${year + 1}, 1, 1, 0, 0, 0) at time zone ${BUSINESS_TIME_ZONE})), 0)::numeric(14,2)::text`,
        lastOrderAt: sql<Date | null>`max(${orders.submittedAt})`,
      })
      .from(orders)
      .where(eq(orders.dealerId, dealerId));
    return {
      orderCount: row.orderCount,
      openOrderCount: row.openOrderCount,
      yearNetTotal: row.yearNetTotal,
      lastOrderAt: row.lastOrderAt ? new Date(row.lastOrderAt).toISOString() : null,
    };
  }

  /** K-67: yalnızca değişen alanlar yazılır ve audit'e eski→yeni olarak girer. */
  async update(dealerId: string, input: UpdateAccountInput) {
    await this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(dealers).where(eq(dealers.id, dealerId)).for('update');
      if (!current) throw new NotFoundException('Hesap bulunamadı.');
      const set: Partial<typeof dealers.$inferInsert> = {};
      const changes: Record<string, { previous: unknown; next: unknown }> = {};
      for (const key of ['contactName', 'phone', 'city', 'district', 'address', 'taxOffice', 'taxNumber'] as const) {
        const next = input[key];
        if (next === undefined || next === current[key]) continue;
        (set as Record<string, unknown>)[key] = next;
        changes[key] = { previous: current[key], next };
      }
      if (Object.keys(changes).length === 0) return;
      await tx.update(dealers).set(set).where(eq(dealers.id, dealerId));
      await this.audit.record(
        {
          actorType: 'dealer',
          actorId: dealerId,
          action: 'dealer.profile_updated',
          entityType: 'dealers',
          entityId: dealerId,
          data: { changes },
        },
        tx,
      );
    });
    return this.get(dealerId);
  }

  /** GR-KVK-001: pazarlama onayı değişince yeni satır eklenir (geçmiş korunur). */
  async setMarketingConsent(dealerId: string, granted: boolean): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.insert(consents).values({
        dealerId,
        type: 'marketing',
        documentVersion: CONSENT_DOCUMENT_VERSION,
        granted,
      });
      await this.audit.record(
        {
          actorType: 'dealer',
          actorId: dealerId,
          action: 'dealer.marketing_consent_changed',
          entityType: 'dealers',
          entityId: dealerId,
          data: { granted },
        },
        tx,
      );
    });
  }

  // --- Kayıtlı adresler (K-69) ----------------------------------------------

  async listAddresses(dealerId: string) {
    const rows = await this.db
      .select()
      .from(dealerAddresses)
      .where(eq(dealerAddresses.dealerId, dealerId))
      .orderBy(desc(dealerAddresses.isDefault), desc(dealerAddresses.createdAt), desc(dealerAddresses.id));
    return rows.map(addressDto);
  }

  async createAddress(dealerId: string, input: CreateAddressInput) {
    return this.db.transaction(async (tx) => {
      await this.lockAddresses(tx, dealerId);
      const existing = await tx
        .select({ id: dealerAddresses.id })
        .from(dealerAddresses)
        .where(eq(dealerAddresses.dealerId, dealerId));
      if (existing.length >= MAX_ADDRESSES) {
        throw new ConflictException({
          statusCode: 409,
          code: 'ADDRESS_LIMIT',
          message: `En fazla ${MAX_ADDRESSES} kayıtlı adres ekleyebilirsiniz.`,
        });
      }
      // İlk adres otomatik varsayılan; yeni varsayılan eskisini kaldırır.
      const isDefault = existing.length === 0 || input.isDefault === true;
      if (isDefault) await this.clearDefault(tx, dealerId);
      const [row] = await tx
        .insert(dealerAddresses)
        .values({
          dealerId,
          label: input.label,
          carrierName: input.carrierName,
          carrierBranch: input.carrierBranch,
          address: input.address,
          city: input.city,
          district: input.district,
          isDefault,
        })
        .returning();
      await this.audit.record(
        {
          actorType: 'dealer',
          actorId: dealerId,
          action: 'dealer.address_added',
          entityType: 'dealers',
          entityId: dealerId,
          data: { addressId: row.id, label: row.label },
        },
        tx,
      );
      return addressDto(row);
    });
  }

  async updateAddress(dealerId: string, id: string, input: UpdateAddressInput) {
    return this.db.transaction(async (tx) => {
      await this.lockAddresses(tx, dealerId);
      const [current] = await tx
        .select()
        .from(dealerAddresses)
        .where(and(eq(dealerAddresses.id, id), eq(dealerAddresses.dealerId, dealerId)));
      if (!current) throw new NotFoundException('Adres bulunamadı.');
      const { isDefault, ...fields } = input;
      const set: Partial<typeof dealerAddresses.$inferInsert> = {};
      for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined) (set as Record<string, unknown>)[key] = value;
      }
      if (isDefault === true) await this.clearDefault(tx, dealerId, id);
      if (isDefault !== undefined) set.isDefault = isDefault;
      const [row] =
        Object.keys(set).length > 0
          ? await tx.update(dealerAddresses).set(set).where(eq(dealerAddresses.id, id)).returning()
          : [current];
      await this.audit.record(
        {
          actorType: 'dealer',
          actorId: dealerId,
          action: 'dealer.address_updated',
          entityType: 'dealers',
          entityId: dealerId,
          data: { addressId: id, fields: Object.keys(input) },
        },
        tx,
      );
      return addressDto(row);
    });
  }

  /** Varsayılan adres silinirse kalanların en yenisi varsayılan olur. */
  async deleteAddress(dealerId: string, id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await this.lockAddresses(tx, dealerId);
      const [row] = await tx
        .delete(dealerAddresses)
        .where(and(eq(dealerAddresses.id, id), eq(dealerAddresses.dealerId, dealerId)))
        .returning();
      if (!row) throw new NotFoundException('Adres bulunamadı.');
      if (row.isDefault) {
        const [next] = await tx
          .select({ id: dealerAddresses.id })
          .from(dealerAddresses)
          .where(eq(dealerAddresses.dealerId, dealerId))
          .orderBy(desc(dealerAddresses.createdAt), desc(dealerAddresses.id))
          .limit(1);
        if (next) await tx.update(dealerAddresses).set({ isDefault: true }).where(eq(dealerAddresses.id, next.id));
      }
      await this.audit.record(
        {
          actorType: 'dealer',
          actorId: dealerId,
          action: 'dealer.address_deleted',
          entityType: 'dealers',
          entityId: dealerId,
          data: { addressId: id, label: row.label },
        },
        tx,
      );
    });
  }

  /** Bayinin adres işlemlerini sıraya sokar (limit ve tek-varsayılan yarışlarını önler). */
  private async lockAddresses(tx: Tx, dealerId: string) {
    await tx.select({ id: dealers.id }).from(dealers).where(eq(dealers.id, dealerId)).for('update');
  }

  private async clearDefault(
    tx: Tx,
    dealerId: string,
    exceptId?: string,
  ) {
    await tx
      .update(dealerAddresses)
      .set({ isDefault: false })
      .where(
        and(
          eq(dealerAddresses.dealerId, dealerId),
          eq(dealerAddresses.isDefault, true),
          ...(exceptId ? [ne(dealerAddresses.id, exceptId)] : []),
        ),
      );
  }
}
