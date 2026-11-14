import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    fileParallelism: false,
    // Çalışan bir PostgreSQL gerektirir: kökte `docker compose up -d db`.
    env: {
      // Testlerde hız sınırı devre dışı denecek kadar yüksek; hız sınırı testi kendi değerini koyar.
      AUTH_RATE_LIMIT_PER_MINUTE: '1000',
      DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgres://amisos:amisos@localhost:5432/amisos_b2b',
    },
  },
});
