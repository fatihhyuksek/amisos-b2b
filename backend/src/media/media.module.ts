import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AdminMediaController, MediaServeController } from './media.controller.js';
import { MediaService } from './media.service.js';

@Module({
  imports: [AuthModule],
  controllers: [AdminMediaController, MediaServeController],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
