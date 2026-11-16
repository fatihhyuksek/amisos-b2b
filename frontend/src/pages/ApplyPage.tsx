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
import { PageTextModal } from '../shop/PageTextModal'
import { Alert, AuthCard, Button, Checkbox, Field } from '../ui/components'

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
  const [taxOffice, setTaxOffice] = useState('')
  const [taxNumber, setTaxNumber] = useState('')
  const [taxErrors, setTaxErrors] = useState<{ taxOffice?: string; taxNumber?: string }>({})
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
    const tax: { taxOffice?: string; taxNumber?: string } = {}
    // K-68: vergi bilgisi isteğe bağlı; yazıldıysa VKN (10) veya TCKN (11) hane olmalı.
    if (taxNumber.trim() && !/^(\d{10}|\d{11})$/.test(taxNumber.trim()))
      tax.taxNumber = 'Vergi numarası 10 (VKN) veya 11 (TCKN) haneli olmalıdır.'
    if (taxOffice.trim().length > 100) tax.taxOffice = 'Vergi dairesi en fazla 100 karakter olabilir.'
    setErrors(next)
    setTaxErrors(tax)
    setFormError(null)
    setDuplicate(false)
    if (Object.keys(next).length > 0 || Object.keys(tax).length > 0) {
      focusFirstError()
      return
    }
    setBusy(true)
    try {
      await submitApplication({
        ...trimmed(values),
        ...(taxOffice.trim() ? { taxOffice: taxOffice.trim() } : {}),
        ...(taxNumber.trim() ? { taxNumber: taxNumber.trim() } : {}),
        consents: { kvkk, terms, marketing },
      })
      setDone(true)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === 'DUPLICATE_APPLICATION') {
        setDuplicate(true)
      } else if (err instanceof ApiError && err.status === 400 && err.code === 'VALIDATION') {
        const dealerFields = Object.fromEntries(
          Object.entries(err.fields ?? {}).filter(([k]) => k !== 'taxOffice' && k !== 'taxNumber'),
        )
        const { errors: serverErrors, unknown } = mapServerFields(dealerFields)
        setErrors(serverErrors)
        const serverTax: { taxOffice?: string; taxNumber?: string } = {}
        if (err.fields?.taxOffice) serverTax.taxOffice = err.fields.taxOffice
        if (err.fields?.taxNumber) serverTax.taxNumber = err.fields.taxNumber
        setTaxErrors(serverTax)
        const hasFieldError = Object.keys(serverErrors).length + Object.keys(serverTax).length > 0
        if (unknown || !hasFieldError) setFormError('Formdaki bilgileri kontrol edin.')
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
            <p className="muted">
              Vergi bilgileri dışındaki tüm alanlar zorunludur. Başvurunuz Amisos onayından sonra hesaba
              dönüşür.
            </p>
          </div>
          <form ref={formRef} className="ui-auth__form" onSubmit={onSubmit} noValidate>
            {duplicate && <Alert tone="danger">{DUPLICATE}</Alert>}
            {formError && <Alert tone="danger">{formError}</Alert>}
            <DealerFields idPrefix="apply" values={values} errors={errors} onChange={setField} />
            <fieldset className="ui-fieldset">
              <legend>Vergi bilgileri (isteğe bağlı)</legend>
              <div className="ui-form-grid ui-form-grid--2">
                <Field label="Vergi dairesi" htmlFor="apply-taxOffice" error={taxErrors.taxOffice}>
                  <input
                    id="apply-taxOffice"
                    className="ui-input"
                    autoComplete="off"
                    value={taxOffice}
                    onChange={(e) => setTaxOffice(e.target.value)}
                    aria-invalid={taxErrors.taxOffice ? true : undefined}
                  />
                </Field>
                <Field
                  label="Vergi no / TC kimlik no"
                  htmlFor="apply-taxNumber"
                  help="10 haneli VKN veya 11 haneli TCKN"
                  error={taxErrors.taxNumber}
                >
                  <input
                    id="apply-taxNumber"
                    className="ui-input"
                    inputMode="numeric"
                    autoComplete="off"
                    value={taxNumber}
                    onChange={(e) => setTaxNumber(e.target.value.replace(/\D/g, '').slice(0, 11))}
                    aria-invalid={taxErrors.taxNumber ? true : undefined}
                  />
                </Field>
              </div>
            </fieldset>
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
        <PageTextModal
          slug={textModal === 'KVKK aydınlatma metni' ? 'kvkk' : 'kullanim-kosullari'}
          title={textModal}
          onClose={() => setTextModal(null)}
        />
      )}
    </main>
  )
}
