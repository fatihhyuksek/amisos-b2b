// Geçici karşılama sayfaları: bayi (/) ve Admin (/yonetim). Gerçek ekranlar sonraki adımlarda.
import { useAuth } from '../auth/useAuth'
import { replace } from '../router'
import { AuthCard, Button } from '../ui/components'

export function WelcomePage({ area }: { area: 'dealer' | 'admin' }) {
  const { state, logout } = useAuth()
  if (state.status !== 'authenticated') return null
  return (
    <AuthCard
      title={`Hoş geldiniz, ${state.user.name}`}
      intro={area === 'admin' ? 'Yönetim paneli (yakında).' : 'Bayi portalı (yakında).'}
    >
      <Button
        variant="secondary"
        block
        onClick={async () => {
          await logout()
          replace(area === 'admin' ? '/yonetim/giris' : '/giris')
        }}
      >
        Çıkış yap
      </Button>
    </AuthCard>
  )
}
