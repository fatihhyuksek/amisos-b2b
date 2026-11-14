// PostgreSQL hata kodları (drizzle hatayı `cause` içine sarar).
function hasCode(error: unknown, code: string): boolean {
  let current: unknown = error;
  for (let i = 0; i < 4 && current; i++) {
    if ((current as { code?: unknown }).code === code) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export const isUniqueViolation = (error: unknown): boolean => hasCode(error, '23505');
export const isForeignKeyViolation = (error: unknown): boolean => hasCode(error, '23503');

/** Hangi kısıtın ihlal edildiği (örn. `products_barcode_uq`). */
export function violatedConstraint(error: unknown): string | undefined {
  let current: unknown = error;
  for (let i = 0; i < 4 && current; i++) {
    const c = (current as { constraint?: unknown }).constraint;
    if (typeof c === 'string') return c;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}
