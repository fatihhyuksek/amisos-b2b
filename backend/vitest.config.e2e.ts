import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Çalışan bir PostgreSQL gerektirir: kökte `docker compose up -d db`.
    env: {
      DATABASE_URL:
        process.env.DATABASE_URL ?? 'postgres://amisos:amisos@localhost:5432/amisos_b2b',
    },
  },
});
