// Görsel adresleri (API sözleşmesi: /api/media/<id>/{large,thumb}.webp).
export const mediaUrl = (id: string): string => `/api/media/${id}/large.webp`;
export const mediaThumbUrl = (id: string): string => `/api/media/${id}/thumb.webp`;
