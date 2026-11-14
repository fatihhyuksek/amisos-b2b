// Görsel kütüphanesi uçları. K-61, K-62. Yükleme multipart olduğundan JsonOnlyGuard uygulanmaz.
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import multer from 'multer';
import { AdminGuard, CurrentUser } from '../auth/auth.guards.js';
import type { AuthIdentity } from '../auth/sessions.service.js';
import { createValidationPipe } from '../common/validation.js';
import { MAX_FILE_BYTES, MAX_FILES_PER_REQUEST } from './image-processing.js';
import { mediaListQuerySchema, type MediaListQuery } from './media.schemas.js';
import { MediaService } from './media.service.js';

@Controller('admin/media')
@UseGuards(AdminGuard)
@UsePipes(createValidationPipe())
export class AdminMediaController {
  constructor(@Inject(MediaService) private readonly media: MediaService) {}

  @Post()
  @UseInterceptors(
    FilesInterceptor('files', MAX_FILES_PER_REQUEST, {
      storage: multer.memoryStorage(),
      limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES_PER_REQUEST },
    }),
  )
  upload(
    @UploadedFiles() files: Express.Multer.File[] | undefined,
    @CurrentUser() admin: AuthIdentity,
  ) {
    return this.media.upload(files ?? [], admin.id);
  }

  @Get()
  list(@Query({ schema: mediaListQuerySchema }) query: MediaListQuery) {
    return this.media.list(query);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() admin: AuthIdentity,
  ): Promise<void> {
    await this.media.remove(id, admin.id);
  }
}

/** Herkese açık sunum (görseller gizli değil); içerik uuid ile değiştirilemez, bu yüzden immutable. */
@Controller('media')
export class MediaServeController {
  constructor(@Inject(MediaService) private readonly media: MediaService) {}

  @Get(':id/thumb.webp')
  thumb(@Param('id') id: string, @Res() res: Response) {
    return this.serve(id, 'thumb', res);
  }

  @Get(':id/large.webp')
  large(@Param('id') id: string, @Res() res: Response) {
    return this.serve(id, 'large', res);
  }

  private async serve(id: string, variant: 'thumb' | 'large', res: Response) {
    const data = await this.media.readVariant(id, variant);
    res
      .status(200)
      .set({
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff',
        'Content-Length': String(data.length),
      })
      .end(data);
  }
}
