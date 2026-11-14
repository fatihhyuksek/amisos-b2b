export function validateEnv(raw) {
    const databaseUrl = raw.DATABASE_URL;
    if (typeof databaseUrl !== 'string' || databaseUrl.length === 0) {
        throw new Error('DATABASE_URL tanımlı değil. backend/.env.example dosyasına bakın.');
    }
    const nodeEnv = (raw.NODE_ENV ?? 'development');
    if (!['development', 'test', 'production'].includes(nodeEnv)) {
        throw new Error(`Geçersiz NODE_ENV: ${String(nodeEnv)}`);
    }
    const port = Number(raw.PORT ?? 3000);
    if (!Number.isInteger(port) || port <= 0) {
        throw new Error(`Geçersiz PORT: ${String(raw.PORT)}`);
    }
    return {
        NODE_ENV: nodeEnv,
        PORT: port,
        DATABASE_URL: databaseUrl,
        CORS_ORIGIN: typeof raw.CORS_ORIGIN === 'string' ? raw.CORS_ORIGIN : 'http://localhost:5173',
    };
}
//# sourceMappingURL=env.js.map