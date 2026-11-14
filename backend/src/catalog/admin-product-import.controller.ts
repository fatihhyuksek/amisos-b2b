// Excel şablonu ve toplu yükleme (K-59, K-60). Multipart olduğu için JsonOnlyGuard uygulanmaz;
// yalnızca AdminGuard. Bu controller, `admin/products/:id` rotasından önce kayıtlı olmalıdır.
import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import multer from 'multer';
import { AdminGuard, CurrentUser } from '../auth/auth.guards.js';
import type { AuthIdentity } from '../auth/sessions.service.js';
import { createValidationPipe } from '../common/validation.js';
import { fixFilename } from '../media/media.service.js';
import { importQuerySchema } from './catalog.schemas.js';
import { MAX_IMPORT_BYTES } from './import-format.js';
import { ProductImportService } from './product-import.service.js';

@Controller('admin/products')
@UseGuards(AdminGuard)
@UsePipes(createValidationPipe())
export class AdminProductImportController {
  constructor(@Inject(ProductImportService) private readonly imports: ProductImportService) {}

  @Get('import-template')
  async template(@Res() res: Response): Promise<void> {
    const data = await this.imports.template();
    res
      .status(200)
      .set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="urun-sablonu.xlsx"',
        'Content-Length': String(data.length),
        'Cache-Control': 'no-store',
      })
      .end(data);
  }

  @Post('import')
  @HttpCode(200)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
      limits: { fileSize: MAX_IMPORT_BYTES, files: 1 },
    }),
  )
  import(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query({ schema: importQuerySchema }) query: { dryRun: boolean },
    @CurrentUser() admin: AuthIdentity,
  ) {
    if (!file) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'VALIDATION',
        message: 'Girilen bilgiler geçersiz.',
        fields: { file: 'Bir .xlsx dosyası seçin.' },
      });
    }
    return this.imports.import(file.buffer, fixFilename(file.originalname), query.dryRun, admin.id);
  }
}
