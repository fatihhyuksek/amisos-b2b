// Girdi doğrulaması sunucuda (Zod). Şifre uzunluğu varsayım (açık soru).
import { z } from 'zod';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from './auth.constants.js';
import { normalizeEmail } from './email.js';

const email = z.string().max(254).transform(normalizeEmail).pipe(z.email());
const token = z.string().min(20).max(200);
const newPassword = z
  .string()
  .min(
    PASSWORD_MIN_LENGTH,
    `Şifre en az ${PASSWORD_MIN_LENGTH} karakter olmalı.`,
  )
  .max(PASSWORD_MAX_LENGTH);

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
