export const CLIENT_EVENT_TYPES = ['page_view', 'product_view', 'search', 'add_to_cart'] as const;
export type ClientEventType = (typeof CLIENT_EVENT_TYPES)[number];
export type EventType = ClientEventType | 'login' | 'order_submitted';
export const MAX_EVENTS_PER_REQUEST = 20;
export const MAX_BODY_BYTES = 16 * 1024;
/** Olay saklama süresi (gün). */
export const RETENTION_DAYS = 400;
/** "Şu an aktif" penceresi (dakika). */
export const ACTIVE_WINDOW_MINUTES = 5;
export const SESSION_KEY_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
