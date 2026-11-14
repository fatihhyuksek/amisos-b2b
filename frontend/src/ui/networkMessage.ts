/** İstek hatasını kullanıcıya gösterilecek genel Türkçe metne çevirir (sunucu message'ı gösterilmez). */
export function networkMessage(err: unknown, fallback: string): string {
  return err instanceof TypeError ? 'Sunucuya ulaşılamadı. Lütfen biraz sonra tekrar deneyin.' : fallback
}
