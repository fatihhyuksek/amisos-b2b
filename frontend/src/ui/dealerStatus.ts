import type { DealerStatus } from '../api'
import type { Tone } from './components'

export const DEALER_STATUS: Record<DealerStatus, { label: string; tone: Tone }> = {
  pending_email: { label: 'E-posta doğrulaması bekliyor', tone: 'info' },
  pending_approval: { label: 'Onay bekliyor', tone: 'warning' },
  active: { label: 'Aktif', tone: 'success' },
  rejected: { label: 'Reddedildi', tone: 'danger' },
  passive: { label: 'Pasif', tone: 'neutral' },
}

/** İşlem geçmişi (audit_log.action) için Türkçe etiketler. Bilinmeyen değer olduğu gibi gösterilir. */
const HISTORY_LABELS: Record<string, string> = {
  'dealer.applied': 'Başvuru yapıldı',
  'dealer.approved': 'Onaylandı',
  'dealer.rejected': 'Reddedildi',
  'dealer.deactivated': 'Pasife alındı',
  'dealer.activated': 'Aktif edildi',
  'dealer.created_by_invitation': 'Davetle oluşturuldu',
  'dealer.invitation_resent': 'Davet yeniden gönderildi',
  'dealer.invitation_accepted': 'Şifre belirlendi (davet kabul edildi)',
  'dealer.terms_changed': 'İskonto değiştirildi',
  'auth.password_reset_requested': 'Şifre sıfırlama istendi',
  'auth.password_reset_completed': 'Şifre sıfırlandı',
}

export function historyLabel(action: string): string {
  return HISTORY_LABELS[action] ?? action
}
