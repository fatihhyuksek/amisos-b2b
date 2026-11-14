// Herkese açık bayi başvurusu. GR-BAYI-001…005, GR-KVK-001; K-02, K-35, K-51.
import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  UseGuards,
  UsePipes,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { JsonOnlyGuard } from '../auth/json-only.guard.js';
import { createValidationPipe } from '../common/validation.js';
import { applicationSchema, type ApplicationInput } from './dealers.schemas.js';
import { DealersService } from './dealers.service.js';

@Controller('applications')
@UseGuards(JsonOnlyGuard)
@UsePipes(createValidationPipe())
export class ApplicationsController {
  constructor(
    @Inject(DealersService) private readonly dealers: DealersService,
  ) {}

  @Post()
  @HttpCode(202)
  @UseGuards(ThrottlerGuard)
  async apply(
    @Body({ schema: applicationSchema }) body: ApplicationInput,
  ): Promise<Record<string, never>> {
    await this.dealers.apply(body);
    return {};
  }
}
