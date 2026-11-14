// Girdi doğrulaması sunucuda (Zod). Şifre kuralı: K-53.
import { z } from 'zod';
import { PASSWORD_MAX_LENGTH, passwordPolicyError } from './auth.constants.js';
import { normalizeEmail } from './email.js';

const email = z.string().max(254).transform(normalizeEmail).pipe(z.email());
const token = z.string().min(20).max(200);
const newPassword = z
  .string()
  .max(PASSWORD_MAX_LENGTH)
  .superRefine((value, ctx) => {
    const error = passwordPolicyError(value);
    if (error) ctx.addIssue({ code: 'custom', message: error });
  });

export const loginSchema = z.object({
  email,
  // Giriş şifresinde uzunluk kuralı uygulanmaz; yalnızca boş ve aşırı uzun değerler elenir.
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export const passwordResetRequestSchema = z.object({
  email,
  type: z.enum(['admin', 'dealer']),
});
export const passwordResetConfirmSchema = z.object({
  token,
  password: newPassword,
});
export const emailVerifySchema = z.object({ token });

export const passwordSchema = newPassword;
// K-57: davet kabulünde KVKK ve koşul onayı zorunlu (GR-KVK-001).
export const invitationAcceptSchema = z.object({
  token,
  password: newPassword,
  consents: z.object({
    kvkk: z.literal(true, { error: 'KVKK onayı zorunludur.' }),
    terms: z.literal(true, { error: 'Kullanım koşulları onayı zorunludur.' }),
    marketing: z.boolean().optional().default(false),
  }),
});
