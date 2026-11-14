var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import pg from 'pg';
import { PG_POOL } from '../database/database.module.js';
let HealthController = class HealthController {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    async check(res) {
        try {
            await this.pool.query('SELECT 1');
            return { status: 'ok', database: 'up' };
        }
        catch {
            res.status(HttpStatus.SERVICE_UNAVAILABLE);
            return { status: 'error', database: 'down' };
        }
    }
};
__decorate([
    Get(),
    __param(0, Res({ passthrough: true })),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], HealthController.prototype, "check", null);
HealthController = __decorate([
    Controller('health'),
    __param(0, Inject(PG_POOL)),
    __metadata("design:paramtypes", [Object])
], HealthController);
export { HealthController };
//# sourceMappingURL=health.controller.js.map