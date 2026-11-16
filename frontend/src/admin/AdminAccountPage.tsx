// K-75: Admin hesabım: görünen ad, şifre değiştirme (K-53 kuralı). Şifre değişince diğer oturumlar kapanır.
import { useState, type FormEvent } from 'react'
import { changeAdminPassword, fetchAdminAccount, patchAdminAccount, type AdminAccount } from '../api'
import { useAuth } from '../auth/useAuth'
import { Alert, Button, Field } from '../ui/components'
import { ErrorAlert, LoadingCard } from '../ui/catalog'
import { formatDateTime } from '../ui/format'
import { networkMessage } from '../ui/networkMessage'
import { PasswordChangeForm } from '../ui/PasswordChangeForm'
import { AdminLayout } from './AdminLayout'
import { useLoad } from './useLoad'

function NameForm({ account, onSaved }: { account: AdminAccount; onSaved: () => void }) {
  const { refresh } = useAuth()
  const [name, setName] = useState(account.fullName)
  const [error, setError] = useState<string | undefined>()
  const [notice, setNotice] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const v = name.trim()
    if (v.length < 2 || v.length > 100) {
      setError('Ad soyad 2–100 karakter olmalıdır.')
      return
    }
    setError(undefined)
    setNotice(null)
    setBusy(true)
    try {
      await patchAdminAccount(v)
      setNotice({ tone: 'info', text: 'Adınız güncellendi.' })
      void refresh()
      onSaved()
    } catch (err) {
      setNotice({ tone: 'danger', text: networkMessage(err, 'Ad kaydedilemedi. Lütfen tekrar deneyin.') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="ui-stack ui-formnarrow" onSubmit={submit} noValidate>
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      <Field label="Ad soyad" htmlFor="adm-name" error={error}>
        <input
          id="adm-name"
          className="ui-input"
          autoComplete="name"
          value={name}
          aria-invalid={error ? true : undefined}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <div>
        <Button type="submit" disabled={busy || name.trim() === account.fullName}>
          {busy ? 'Kaydediliyor…' : 'Kaydet'}
        </Button>
      </div>
    </form>
  )
}

export function AdminAccountPage() {
  const { state, reload } = useLoad<AdminAccount>((s) => fetchAdminAccount(s), 'admin-account')
  return (
    <AdminLayout title="Hesabım">
      {state.status === 'loading' && <LoadingCard rows={3} />}
      {state.status === 'error' && <ErrorAlert onRetry={reload}>Hesap bilgileri alınamadı.</ErrorAlert>}
      {state.status === 'ready' && (
        <>
          <section className="ui-card ui-card__body ui-section" aria-labelledby="adm-info">
            <h2 id="adm-info">Profil</h2>
            <dl className="ui-dl">
              <div>
                <dt>E-posta (giriş adresi)</dt>
                <dd>{state.data.email}</dd>
              </div>
              <div>
                <dt>Son giriş</dt>
                <dd>{state.data.lastLoginAt ? formatDateTime(state.data.lastLoginAt) : '—'}</dd>
              </div>
            </dl>
            <NameForm account={state.data} onSaved={reload} />
          </section>
          <section className="ui-card ui-card__body ui-section" aria-labelledby="adm-pw">
            <h2 id="adm-pw">Şifre değiştir</h2>
            <PasswordChangeForm
              idPrefix="adm-pw"
              onSubmit={changeAdminPassword}
              successText="Şifreniz değiştirildi. Diğer cihazlardaki oturumlar kapatıldı."
            />
          </section>
        </>
      )}
    </AdminLayout>
  )
}
