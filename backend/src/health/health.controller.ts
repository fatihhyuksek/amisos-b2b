import { Controller, Get, HttpStatus, Inject, Logger, Res } from '@nestjs/common';
import type { Response } from 'express';
import pg from 'pg';
import { PG_POOL } from '../database/database.module.js';

export interface HealthStatus {
  status: 'ok' | 'error';
  database: 'up' | 'down';
}

@Controller('health')
export class HealthController {
  private readonly logger = new Logger('Health');

  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool) {}

  @Get()
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthStatus> {
    try {
      await this.pool.query('SELECT 1');
      return { status: 'ok', database: 'up' };
    } catch (error) {
      // Sebep yalnızca sunucu log'una yazılır; yanıtta ayrıntı verilmez.
      this.logger.warn(
        `Veritabanına bağlanılamadı: ${error instanceof Error ? error.message : String(error)}`,
      );
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return { status: 'error', database: 'down' };
    }
  }
}
