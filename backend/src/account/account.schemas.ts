// Bayi hesap girdileri (K-67 – K-69). Firma unvanı ve e-posta bayi tarafından değiştirilemez:
// strictObject bilinmeyen alanı (companyTitle, email ...) 400 ile reddeder.
import { z } from 'zod';
import { phoneField, taxNumberField, taxOfficeField } from '../dealers/dealers.schemas.js';

export const MAX_ADDRESSES = 20;

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

export const updateAccountSchema = z.strictObject({
  contactName: text(2, 100).optional(),
  phone: phoneField.optional(),
  city: text(1, 100).optional(),
  district: text(1, 100).optional(),
  address: text(1, 500).optional(),
  taxOffice: taxOfficeField.optional(),
  taxNumber: taxNumberField.optional(),
});
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

export const marketingConsentSchema = z.object({ granted: z.boolean() });

export const createAddressSchema = z.object({
  label: text(1, 60),
  carrierName: text(0, 100).default(''),
  carrierBranch: text(0, 100).default(''),
  address: text(1, 500),
  city: text(0, 100).default(''),
  district: text(0, 100).default(''),
  isDefault: z.boolean().optional(),
});
export type CreateAddressInput = z.infer<typeof createAddressSchema>;

export const updateAddressSchema = z.object({
  label: text(1, 60).optional(),
  carrierName: text(0, 100).optional(),
  carrierBranch: text(0, 100).optional(),
  address: text(1, 500).optional(),
  city: text(0, 100).optional(),
  district: text(0, 100).optional(),
  isDefault: z.boolean().optional(),
});
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
