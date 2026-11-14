// Şifre özeti: argon2id (K-29). Kütüphane varsayılanları OWASP önerisidir (19 MiB, t=2, p=1).
import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

// Kayıt olmayan e-postada da özet doğrulaması yapılır, yanıt süresi hesabın varlığını sızdırmaz.
const dummyHash = hash('amisos-dummy-password');

@Injectable()
export class PasswordService {
  hash(password: string): Promise<string> {
    return hash(password);
  }

  async verify(
    passwordHash: string | null | undefined,
    password: string,
  ): Promise<boolean> {
    if (!passwordHash) {
      await verify(await dummyHash, password);
      return false;
    }
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }
}
