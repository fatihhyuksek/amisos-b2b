import type { orderStatus } from '../database/schema.js';
export type OrderStatus = (typeof orderStatus.enumValues)[number];
export declare const ORDER_STATUS_LABELS: Record<OrderStatus, string>;
export declare function allowedNextStatuses(from: OrderStatus): OrderStatus[];
export declare function canTransition(from: OrderStatus, to: OrderStatus): boolean;
