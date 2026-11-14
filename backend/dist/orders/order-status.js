const FORWARD = {
    submitted: 'negotiating',
    negotiating: 'approved',
    approved: 'shipped',
    shipped: 'delivered',
    delivered: null,
    cancelled: null,
};
export const ORDER_STATUS_LABELS = {
    submitted: 'Gönderildi',
    negotiating: 'Görüşülüyor',
    approved: 'Onaylandı',
    shipped: 'Sevk edildi',
    delivered: 'Teslim edildi',
    cancelled: 'İptal',
};
export function allowedNextStatuses(from) {
    if (from === 'delivered' || from === 'cancelled')
        return [];
    const next = FORWARD[from];
    return next ? [next, 'cancelled'] : ['cancelled'];
}
export function canTransition(from, to) {
    return allowedNextStatuses(from).includes(to);
}
//# sourceMappingURL=order-status.js.map