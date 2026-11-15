// GR-BAYI-001, GR-BAYI-008 (K-35), GR-KVK-001 (K-45), K-02, K-03: herkese açık bayi başvuru formu.
import { useRef, useState, type FormEvent } from 'react'
import { BrandLogo } from '../shop/brand'
import { ApiError, submitApplication, type DealerInput } from '../api'
import { DealerFields } from '../dealers/DealerFields'
import {
  EMPTY_DEALER,
  mapServerFields,
  trimmed,
  validateDealer,
  type DealerErrors,
  type DealerFieldName,
} from '../dealers/form'
import { Link } from '../Link'
import { Alert, AuthCard, Button, Checkbox, Modal } from '../ui/components'

const DUPLICATE =
  'Bu e-posta veya firma unvanıyla bekleyen ya da aktif bir kayıt var. E-postanızdaki doğrulama bağlantısını kullanın; bağlantının süresi dolduysa 24 saat sonra yeniden başvurabilirsiniz. Hesabınız aktifse giriş yapın veya şifre sıfırlamayı kullanın.'

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return 'Çok fazla deneme yaptınız. Bir dakika sonra tekrar deneyin.'
    if (err.status >= 500) return 'Sunucuda bir sorun oluştu. Lütfen biraz sonra tekrar deneyin.'
  }
  if (err instanceof TypeError) return 'Sunucuya ulaşılamadı. Lütfen biraz sonra tekrar deneyin.'
  return 'Başvuru gönderilemedi. Lütfen daha sonra tekrar deneyin.'
}

export function ApplyPage() {
  const [values, setValues] = useState<DealerInput>(EMPTY_DEALER)
  const [kvkk, setKvkk] = useState(false)
  const [terms, setTerms] = useState(false)
  const [marketing, setMarketing] = useState(false) // GR-KVK-001: varsayılan işaretsiz
  const [errors, setErrors] = useState<DealerErrors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [duplicate, setDuplicate] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [textModal, setTextModal] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  function focusFirstError() {
    // Hatalar çizildikten sonra ilk geçersiz alana odaklan.
    requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const next: DealerErrors = validateDealer(values)
    if (!kvkk) next.kvkk = 'KVKK aydınlatma metnini onaylamanız gerekir.'
    if (!terms) next.terms = 'Kullanım koşullarını onaylamanız gerekir.'
    setErrors(next)
    setFormError(null)
    setDuplicate(false)
    if (Object.keys(next).length > 0) {
      focusFirstError()
      return
    }
    setBusy(true)
    try {
      await submitApplication({ ...trimmed(values), consents: { kvkk, terms, marketing } })
      setDone(true)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === 'DUPLICATE_APPLICATION') {
        setDuplicate(true)
      } else if (err instanceof ApiError && err.status === 400 && err.code === 'VALIDATION') {
        const { errors: serverErrors, unknown } = mapServerFields(err.fields)
        setErrors(serverErrors)
        if (unknown || Object.keys(serverErrors).length === 0)
          setFormError('Formdaki bilgileri kontrol edin.')
        focusFirstError()
      } else {
        setFormError(errorMessage(err))
      }
    } finally {
      setBusy(false)
    }
  }

  function setField(field: DealerFieldName, value: string) {
    setValues((v) => ({ ...v, [field]: value }))
  }

  if (done) {
    return (
      <AuthCard title="Başvurunuz alındı" footer={<Link to="/giris">Girişe dön</Link>}>
        <Alert tone="info">
          <strong>E-postanızı doğrulayın.</strong> {values.email.trim()} adresine bir doğrulama bağlantısı
          gönderdik. Bağlantı 24 saat geçerlidir.
        </Alert>
        <p className="muted">
          E-postanızı doğruladıktan sonra başvurunuz Admin onayına gönderilir. Onay en geç 2 iş günü içinde
          sonuçlanır; sonuç e-posta ile bildirilir.
        </p>
      </AuthCard>
    )
  }

  const textLink = (label: string, key: string) => (
    <button type="button" className="ui-linklike ui-linklike--touch" onClick={() => setTextModal(key)}>
      {label}
    </button>
  )

  return (
    <main className="ui-page">
      <div className="ui-auth__brand">
        <BrandLogo size="lg" />
      </div>
      <section className="ui-card ui-page__card" aria-labelledby="apply-title">
        <div className="ui-card__body ui-auth__body">
          <div className="ui-auth__head">
            <h1 id="apply-title">Bayi başvurusu</h1>
            <p className="muted">Tüm alanlar zorunludur. Başvurunuz Amisos onayından sonra hesaba dönüşür.</p>
          </div>
          <form ref={formRef} className="ui-auth__form" onSubmit={onSubmit} noValidate>
            {duplicate && <Alert tone="danger">{DUPLICATE}</Alert>}
            {formError && <Alert tone="danger">{formError}</Alert>}
            <DealerFields idPrefix="apply" values={values} errors={errors} onChange={setField} />
            <Checkbox id="apply-kvkk" checked={kvkk} onChange={setKvkk} error={errors.kvkk}>
              KVKK aydınlatma metnini okudum, anladım. ({textLink('Metni oku', 'KVKK aydınlatma metni')})
            </Checkbox>
            <Checkbox id="apply-terms" checked={terms} onChange={setTerms} error={errors.terms}>
              Kullanım koşullarını kabul ediyorum. ({textLink('Metni oku', 'Kullanım koşulları')})
            </Checkbox>
            <Checkbox id="apply-marketing" checked={marketing} onChange={setMarketing}>
              Kampanya ve duyuru e-postaları almak istiyorum. (İsteğe bağlı)
            </Checkbox>
            <Button type="submit" block disabled={busy}>
              {busy ? 'Gönderiliyor…' : 'Başvuruyu gönder'}
            </Button>
          </form>
        </div>
      </section>
      <div className="ui-auth__footer">
        <p className="muted">
          Zaten bayi misiniz? <Link to="/giris">Giriş yapın</Link>
        </p>
      </div>
      {textModal && (
        <Modal title={textModal} onClose={() => setTextModal(null)}>
          <p>Metin hazırlanıyor. Yayınlandığında burada okuyabileceksiniz.</p>
          <div className="ui-modal__actions">
            <Button onClick={() => setTextModal(null)}>Kapat</Button>
          </div>
        </Modal>
      )}
    </main>
  )
}
