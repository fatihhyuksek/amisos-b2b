// Doğrulama hatası gövdesi: { statusCode, message, code: 'VALIDATION', fields } (API sözleşmesi).
import {
  BadRequestException,
  StandardSchemaValidationPipe,
} from '@nestjs/common';

interface Issue {
  message: string;
  path?: ReadonlyArray<PropertyKey | { key: PropertyKey }>;
}

export function createValidationPipe(): StandardSchemaValidationPipe {
  return new StandardSchemaValidationPipe({
    exceptionFactory: (issues: readonly Issue[]) => {
      const fields: Record<string, string> = {};
      for (const issue of issues) {
        const key = (issue.path ?? [])
          .map((s) => String(typeof s === 'object' ? s.key : s))
          .join('.');
        fields[key || '_'] ??= issue.message;
      }
      return new BadRequestException({
        statusCode: 400,
        code: 'VALIDATION',
        message: 'Girilen bilgiler geçersiz.',
        fields,
      });
    },
  });
}
