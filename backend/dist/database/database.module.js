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
import { Global, Inject, Injectable, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';
export const PG_POOL = Symbol('PG_POOL');
export const DB = Symbol('DB');
let PoolCloser = class PoolCloser {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    async onApplicationShutdown() {
        await this.pool.end();
    }
};
PoolCloser = __decorate([
    Injectable(),
    __param(0, Inject(PG_POOL)),
    __metadata("design:paramtypes", [Object])
], PoolCloser);
let DatabaseModule = class DatabaseModule {
};
DatabaseModule = __decorate([
    Global(),
    Module({
        providers: [
            {
                provide: PG_POOL,
                inject: [ConfigService],
                useFactory: (config) => new pg.Pool({ connectionString: config.get('DATABASE_URL', { infer: true }) }),
            },
            {
                provide: DB,
                inject: [PG_POOL],
                useFactory: (pool) => drizzle(pool, { schema, casing: 'snake_case' }),
            },
            PoolCloser,
        ],
        exports: [PG_POOL, DB],
    })
], DatabaseModule);
export { DatabaseModule };
//# sourceMappingURL=database.module.js.map