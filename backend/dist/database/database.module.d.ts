import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';
export declare const PG_POOL: unique symbol;
export declare const DB: unique symbol;
export type Database = NodePgDatabase<typeof schema>;
export declare class DatabaseModule {
}
