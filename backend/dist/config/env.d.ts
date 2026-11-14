export interface Env {
    NODE_ENV: 'development' | 'test' | 'production';
    PORT: number;
    DATABASE_URL: string;
    CORS_ORIGIN: string;
}
export declare function validateEnv(raw: Record<string, unknown>): Env;
