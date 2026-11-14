import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

// .env dosyasını açıkça yükle (drizzle-kit'in otomatik yüklemesine güvenme).
if (!process.env.DATABASE_URL && existsSync('.env')) {
  process.loadEnvFile('.env');
}
if (!process.env.DATABASE_URL) {
  throw new Error(
    'DATABASE_URL bulunamadı. backend klasöründe .env.example dosyasını .env adıyla kopyalayın.',
  );
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema.ts',
  out: './drizzle',
  casing: 'snake_case',
  dbCredentials: { url: process.env.DATABASE_URL },
});
