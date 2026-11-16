// K-73: Site ayarları (Admin): duyuru şeridi, iletişim bilgileri, bilgi sayfaları (düzenleyici, önizleme, yayımla anahtarı).
// PUT /api/admin/site tüm bölümü birlikte kaydeder.
import { useState, type FormEvent } from 'react'
import {
  ApiError,
  fetchAdminSite,
  saveAdminSite,
  type AdminSite,
  type AdminSiteInput,
  type SiteContact,
} from '../api'
import { invalidateSite } from '../shop/site'
import { Alert, Button, Field } from '../ui/components'
import { ErrorAlert, LoadingCard } from '../ui/catalog'
import { Faq } from '../ui/Faq'
import { networkMessage } from '../ui/networkMessage'
import { RichText } from '../ui/RichText'
import { AdminLayout } from './AdminLayout'
import { useLoad } from './useLoad'

const ANNOUNCEMENT_MAX = 160
const TITLE_MAX = 80
const BODY_MAX = 20000

interface FormState {
  announcement: string
  contact: Omit<SiteContact, 'mapUrl' | 'phoneE164' | 'whatsappE164'> & {
    mapUrl: string
    phoneE164: string
    whatsappE164: string
    whatsappOn: boolean
  }
  pages: AdminSite['pages']
}

function toForm(s: AdminSite): FormState {
  return {
    announcement: s.announcement ?? '',
    contact: {
      ...s.contact,
      mapUrl: s.contact.mapUrl ?? '',
      phoneE164: s.contact.phoneE164 ?? '',
      whatsappE164: s.contact.whatsappE164 ?? '',
      whatsappOn: s.contact.whatsappE164 !== null,
    },
    pages: s.pages.map((p) => ({ ...p })),
  }
}

function toPayload(f: FormState): AdminSiteInput {
  const { phoneE164, whatsappE164, whatsappOn, ...rest } = f.contact
  return {
    announcement: f.announcement.trim() || null,
    contact: {
      ...rest,
      phone: f.contact.phone.trim(),
      email: f.contact.email.trim(),
      address: f.contact.address.trim(),
      city: f.contact.city.trim(),
      workingHours: f.contact.workingHours.trim(),
      mapUrl: f.contact.mapUrl.trim() || null,
      // Boş bırakılırsa sunucu telefondan türetir.
      ...(phoneE164.trim() ? { phoneE164: phoneE164.trim() } : {}),
      // Kapalıysa null: WhatsApp butonu ve bağlantıları vitrinde gizlenir.
      ...(!whatsappOn
        ? { whatsappE164: null }
        : whatsappE164.trim()
          ? { whatsappE164: whatsappE164.trim() }
          : {}),
    },
    pages: f.pages.map((p) => ({
      slug: p.slug,
      title: p.title.trim(),
      body: p.body,
      published: p.published,
    })),
  }
}

type Errors = Record<string, string>

function validate(f: FormState): Errors {
  const e: Errors = {}
  if (f.announcement.length > ANNOUNCEMENT_MAX) e.announcement = `En fazla ${ANNOUNCEMENT_MAX} karakter.`
  if (!f.contact.phone.trim()) e.phone = 'Telefon zorunludur.'
  if (!f.contact.email.trim()) e.email = 'E-posta zorunludur.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.contact.email.trim())) e.email = 'Geçerli bir e-posta girin.'
  if (f.contact.mapUrl.trim() && !f.contact.mapUrl.trim().startsWith('https://'))
    e.mapUrl = 'Harita bağlantısı https:// ile başlamalıdır.'
  f.pages.forEach((p, i) => {
    if (!p.title.trim() || p.title.trim().length > TITLE_MAX)
      e[`title-${i}`] = `Başlık 1–${TITLE_MAX} karakter olmalıdır.`
    if (p.body.length > BODY_MAX) e[`body-${i}`] = `Metin en fazla ${BODY_MAX} karakter olabilir.`
  })
  return e
}

const FORMAT_HELP =
  'Boş satır yeni paragraf başlatır. "## " ile başlayan satır alt başlık, "- " ile başlayan satır madde olur. HTML kullanılamaz.'

function Editor({ initial, onSaved }: { initial: AdminSite; onSaved: (s: AdminSite) => void }) {
  const [form, setForm] = useState<FormState>(() => toForm(initial))
  const [baseline, setBaseline] = useState(() => JSON.stringify(toForm(initial)))
  const [errors, setErrors] = useState<Errors>({})
  const [serverMsgs, setServerMsgs] = useState<string[]>([])
  const [notice, setNotice] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null)
  const [preview, setPreview] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState(false)
  const dirty = JSON.stringify(form) !== baseline

  const setContact = (k: Exclude<keyof FormState['contact'], 'whatsappOn'>, v: string) =>
    setForm((f) => ({ ...f, contact: { ...f.contact, [k]: v } }))
  const setPage = (i: number, patch: Partial<AdminSite['pages'][number]>) =>
    setForm((f) => ({ ...f, pages: f.pages.map((p, j) => (j === i ? { ...p, ...patch } : p)) }))

  async function submit(e: FormEvent) {
    e.preventDefault()
    setNotice(null)
    setServerMsgs([])
    const found = validate(form)
    setErrors(found)
    if (Object.keys(found).length > 0) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    setBusy(true)
    try {
      const saved = await saveAdminSite(toPayload(form))
      invalidateSite()
      const next = toForm(saved)
      setForm(next)
      setBaseline(JSON.stringify(next))
      setNotice({ tone: 'info', text: 'Site ayarları kaydedildi. Değişiklikler vitrinde hemen görünür.' })
      onSaved(saved)
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setServerMsgs(Object.values(err.fields ?? {}))
        setNotice({ tone: 'danger', text: 'Kayıt yapılamadı. Alanları kontrol edin.' })
      } else
        setNotice({ tone: 'danger', text: networkMessage(err, 'Kayıt yapılamadı. Lütfen tekrar deneyin.') })
    } finally {
      setBusy(false)
    }
  }

  const c = form.contact
  const contactInput = (
    k: Exclude<keyof FormState['contact'], 'whatsappOn'>,
    errKey: string | null,
    extra?: { type?: string },
  ) => (
    <input
      id={`site-${k}`}
      className="ui-input"
      type={extra?.type ?? 'text'}
      autoComplete="off"
      value={c[k]}
      aria-invalid={errKey && errors[errKey] ? true : undefined}
      onChange={(e) => setContact(k, e.target.value)}
    />
  )

  return (
    <form className="ui-stack" onSubmit={submit} noValidate>
      {notice && (
        <Alert tone={notice.tone}>
          {notice.text}
          {serverMsgs.length > 0 && (
            <ul className="ui-list-plain">
              {serverMsgs.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}

      <section className="ui-card ui-card__body ui-section" aria-labelledby="site-ann">
        <h2 id="site-ann">Duyuru şeridi</h2>
        <Field
          label="Duyuru metni"
          htmlFor="site-announcement"
          help={`${form.announcement.length} / ${ANNOUNCEMENT_MAX}. Boş bırakırsanız şerit gizlenir.`}
          error={errors.announcement}
        >
          <input
            id="site-announcement"
            className="ui-input"
            value={form.announcement}
            aria-invalid={errors.announcement ? true : undefined}
            onChange={(e) => setForm((f) => ({ ...f, announcement: e.target.value }))}
          />
        </Field>
        {form.announcement.trim() && (
          <div className="ui-strip ui-strip--preview" aria-label="Önizleme">
            <p>
              {form.announcement.trim()} <span aria-hidden="true">·</span> {c.phone}
            </p>
          </div>
        )}
      </section>

      <section className="ui-card ui-card__body ui-section" aria-labelledby="site-contact">
        <h2 id="site-contact">İletişim bilgileri</h2>
        <p className="muted">Alt bilgi, İletişim sayfası, WhatsApp butonu ve Hesabım ekranında kullanılır.</p>
        <div className="ui-form-grid ui-form-grid--2">
          <Field label="Telefon (görünen)" htmlFor="site-phone" error={errors.phone}>
            {contactInput('phone', 'phone')}
          </Field>
          <Field label="E-posta" htmlFor="site-email" error={errors.email}>
            {contactInput('email', 'email', { type: 'email' })}
          </Field>
          <Field
            label="Telefon (uluslararası)"
            htmlFor="site-phoneE164"
            help="Arama bağlantısı için (boşsa telefondan türetilir). Örn. +905524925058"
          >
            {contactInput('phoneE164', null)}
          </Field>
          <div className="ui-field">
            <label className="ui-check ui-switch" htmlFor="site-whatsappOn">
              <input
                id="site-whatsappOn"
                type="checkbox"
                role="switch"
                checked={c.whatsappOn}
                onChange={(e) =>
                  setForm((f) => ({ ...f, contact: { ...f.contact, whatsappOn: e.target.checked } }))
                }
              />
              <span>WhatsApp butonunu göster</span>
            </label>
          </div>
          {c.whatsappOn && (
            <Field
              label="WhatsApp numarası (uluslararası)"
              htmlFor="site-whatsappE164"
              help="Boşsa telefondan türetilir. Örn. +905524925058"
            >
              {contactInput('whatsappE164', null)}
            </Field>
          )}
          <Field label="Adres" htmlFor="site-address">
            {contactInput('address', null)}
          </Field>
          <Field label="Şehir" htmlFor="site-city">
            {contactInput('city', null)}
          </Field>
          <Field label="Çalışma saatleri" htmlFor="site-workingHours">
            {contactInput('workingHours', null)}
          </Field>
          <Field
            label="Harita bağlantısı"
            htmlFor="site-mapUrl"
            help="https:// ile başlamalı; boşsa harita bağlantısı gösterilmez."
            error={errors.mapUrl}
          >
            {contactInput('mapUrl', 'mapUrl', { type: 'url' })}
          </Field>
        </div>
      </section>

      <section className="ui-card ui-card__body ui-section" aria-labelledby="site-pages">
        <h2 id="site-pages">Bilgi sayfaları</h2>
        <p className="muted">{FORMAT_HELP} Yayımlanmamış sayfalar vitrinde görünmez.</p>
        <ul className="ui-pageedit">
          {form.pages.map((p, i) => (
            <li key={p.slug} className="ui-pageedit__item">
              <div className="ui-pageedit__head">
                <h3>{p.slug === 'sss' ? 'Sık sorulan sorular' : p.title || p.slug}</h3>
                <label className="ui-check ui-switch" htmlFor={`pub-${i}`}>
                  <input
                    id={`pub-${i}`}
                    type="checkbox"
                    role="switch"
                    checked={p.published}
                    onChange={(e) => setPage(i, { published: e.target.checked })}
                  />
                  <span>{p.published ? 'Yayında' : 'Taslak (gizli)'}</span>
                </label>
              </div>
              <Field label="Başlık" htmlFor={`title-${i}`} error={errors[`title-${i}`]}>
                <input
                  id={`title-${i}`}
                  className="ui-input"
                  value={p.title}
                  aria-invalid={errors[`title-${i}`] ? true : undefined}
                  onChange={(e) => setPage(i, { title: e.target.value })}
                />
              </Field>
              <Field
                label="Metin"
                htmlFor={`body-${i}`}
                help={`${p.body.length} / ${BODY_MAX}${p.slug === 'sss' ? ' · Her "## " başlığı bir soru olur.' : ''}`}
                error={errors[`body-${i}`]}
              >
                <textarea
                  id={`body-${i}`}
                  className="ui-textarea ui-textarea--lg"
                  rows={12}
                  value={p.body}
                  spellCheck
                  aria-invalid={errors[`body-${i}`] ? true : undefined}
                  onChange={(e) => setPage(i, { body: e.target.value })}
                />
              </Field>
              <div>
                <Button
                  variant="secondary"
                  size="sm"
                  icon="eye"
                  onClick={() => setPreview((cur) => ({ ...cur, [p.slug]: !cur[p.slug] }))}
                >
                  {preview[p.slug] ? 'Önizlemeyi gizle' : 'Önizleme'}
                </Button>
              </div>
              {preview[p.slug] && (
                <div className="ui-pageedit__preview" aria-label={`${p.title} önizlemesi`}>
                  <h2>{p.title}</h2>
                  {p.slug === 'sss' ? <Faq body={p.body} /> : <RichText body={p.body} />}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <div className="ui-savebar">
        <span className="muted" aria-live="polite">
          {dirty ? 'Kaydedilmemiş değişiklikler var.' : 'Tüm değişiklikler kaydedildi.'}
        </span>
        <Button type="submit" disabled={busy || !dirty}>
          {busy ? 'Kaydediliyor…' : 'Kaydet'}
        </Button>
      </div>
    </form>
  )
}

export function SiteSettingsPage() {
  const { state, reload } = useLoad<AdminSite>((s) => fetchAdminSite(s), 'admin-site')
  return (
    <AdminLayout title="Site ayarları">
      {state.status === 'loading' && <LoadingCard rows={4} />}
      {state.status === 'error' && <ErrorAlert onRetry={reload}>Site ayarları alınamadı.</ErrorAlert>}
      {state.status === 'ready' && <Editor initial={state.data} onSaved={() => undefined} />}
    </AdminLayout>
  )
}
