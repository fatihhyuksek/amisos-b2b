import type { Response } from 'express';
import pg from 'pg';
export interface HealthStatus {
    status: 'ok' | 'error';
    database: 'up' | 'down';
}
export declare class HealthController {
    private readonly pool;
    constructor(pool: pg.Pool);
    check(res: Response): Promise<HealthStatus>;
}
