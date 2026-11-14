import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';
import { resolveTestDatabaseUrl } from './test/test-database.js';

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
      // Görsel testleri geçici dizine yazar (depodaki storage/ klasörüne dokunmaz).
      MEDIA_DIR: join(tmpdir(), 'amisos-b2b-media-e2e'),
      // Her zaman ayrı test veritabanı (amisos_b2b_test); dev veritabanına asla yazılmaz.
      DATABASE_URL: resolveTestDatabaseUrl(),
    },
  },
});
