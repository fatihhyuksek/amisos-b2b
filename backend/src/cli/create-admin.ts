// İlk Admin'i oluşturur (GR-YON-001, K-42).
// Kullanım: ADMIN_PASSWORD=... npm run admin:create -- --email a@b.com --name "Ad Soyad"
// Şifre komut satırı argümanından alınmaz: ADMIN_PASSWORD ortam değişkeni, yoksa stdin
// (boru ile veya terminalde gizli istem).
import { createInterface } from 'node:readline';
import { hash } from '@node-rs/argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { PASSWORD_MIN_LENGTH } from '../auth/auth.constants.js';
import { normalizeEmail } from '../auth/email.js';
import { z } from 'zod';
import * as schema from '../database/schema.js';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function readPassword(): Promise<string> {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  if (!process.stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks)
      .toString('utf8')
      .replace(/\r?\n$/, '');
  }
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
  // Yazılanı ekrana yansıtma.
  (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput =
    () => {};
  process.stdout.write('Şifre: ');
  return new Promise((resolve) =>
    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    }),
  );
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile('.env');
  } catch {
    // .env yoksa ortam değişkenleri kullanılır.
  }
  const rawEmail = arg('email');
  const fullName = arg('name')?.trim();
  if (!rawEmail || !fullName) {
    throw new Error(
      'Kullanım: npm run admin:create -- --email <e-posta> --name "<Ad Soyad>"',
    );
  }
  const email = normalizeEmail(rawEmail);
  if (!z.email().safeParse(email).success)
    throw new Error('Geçersiz e-posta adresi.');
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL tanımlı değil.');

  const password = await readPassword();
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Şifre en az ${PASSWORD_MIN_LENGTH} karakter olmalı.`);
  }

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const db = drizzle(pool, { schema, casing: 'snake_case' });
    const passwordHash = await hash(password);
    const [admin] = await db
      .insert(schema.adminUsers)
      .values({ email, fullName, passwordHash })
      .onConflictDoNothing()
      .returning({ id: schema.adminUsers.id });
    if (!admin) throw new Error('Bu e-posta ile bir Admin zaten var.');
    await db.insert(schema.auditLog).values({
      actorType: 'system',
      action: 'admin.created',
      entityType: 'admin_users',
      entityId: admin.id,
      data: { via: 'cli' },
    });
    console.log(`Admin oluşturuldu: ${email}`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
