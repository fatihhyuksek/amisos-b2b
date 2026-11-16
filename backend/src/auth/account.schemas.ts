// Oturum açmış kullanıcının şifre/hesap girdileri (K-67, K-75). Şifre kuralı K-53.
import { z } from 'zod';
import { PASSWORD_MAX_LENGTH } from './auth.constants.js';
import { passwordSchema } from './auth.schemas.js';

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const adminProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
});
export type AdminProfileInput = z.infer<typeof adminProfileSchema>;
