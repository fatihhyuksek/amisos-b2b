// Admin kendi hesabı (K-75): bilgi, ad güncelleme, şifre değiştirme. Yetki sunucuda (AdminGuard).
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Patch,
  Post,
  Req,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service.js';
import { createValidationPipe } from '../common/validation.js';
import { DB, type Database } from '../database/database.module.js';
import { adminUsers } from '../database/schema.js';
import {
  adminProfileSchema,
  changePasswordSchema,
  type AdminProfileInput,
  type ChangePasswordInput,
} from './account.schemas.js';
import { AdminGuard, CurrentUser, readSessionToken } from './auth.guards.js';
import { AuthService } from './auth.service.js';
import { JsonOnlyGuard } from './json-only.guard.js';
import type { AuthIdentity } from './sessions.service.js';

@Controller('admin/account')
@UseGuards(JsonOnlyGuard, AdminGuard)
@UsePipes(createValidationPipe())
export class AdminAccountController {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  @Get()
  get(@CurrentUser() admin: AuthIdentity) {
    return this.load(admin.id);
  }

  @Patch()
  async update(@Body({ schema: adminProfileSchema }) body: AdminProfileInput, @CurrentUser() admin: AuthIdentity) {
    await this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({ fullName: adminUsers.fullName })
        .from(adminUsers)
        .where(eq(adminUsers.id, admin.id))
        .for('update');
      if (!current) throw new NotFoundException('Hesap bulunamadı.');
      if (current.fullName === body.fullName) return;
      await tx.update(adminUsers).set({ fullName: body.fullName }).where(eq(adminUsers.id, admin.id));
      await this.audit.record(
        {
          actorType: 'admin',
          actorId: admin.id,
          action: 'admin.profile_updated',
          entityType: 'admin_users',
          entityId: admin.id,
          data: { changes: { fullName: { previous: current.fullName, next: body.fullName } } },
        },
        tx,
      );
    });
    return this.load(admin.id);
  }

  @Post('password')
  @HttpCode(204)
  @UseGuards(ThrottlerGuard)
  async password(
    @Body({ schema: changePasswordSchema }) body: ChangePasswordInput,
    @CurrentUser() admin: AuthIdentity,
    @Req() req: Request,
  ): Promise<void> {
    await this.auth.changePassword('admin', admin.id, readSessionToken(req), body.currentPassword, body.newPassword);
  }

  private async load(id: string) {
    const [row] = await this.db
      .select({
        id: adminUsers.id,
        email: adminUsers.email,
        fullName: adminUsers.fullName,
        lastLoginAt: adminUsers.lastLoginAt,
      })
      .from(adminUsers)
      .where(eq(adminUsers.id, id));
    if (!row) throw new NotFoundException('Hesap bulunamadı.');
    return row;
  }
}
