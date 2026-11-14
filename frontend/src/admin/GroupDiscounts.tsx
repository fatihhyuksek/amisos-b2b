// K-12, K-13: Bayiye ürün grubu bazında iskonto oranı. Boş = grup için iskonto yok.
import { useState, type FormEvent } from 'react'
import {
  ApiError,
  fetchGroupDiscounts,
  fetchProductGroups,
  saveGroupDiscounts,
  type GroupDiscount,
  type ProductGroup,
} from '../api'
import { Link } from '../Link'
import { Alert, Button, Field } from '../ui/components'
import { ErrorAlert, LoadingCard } from '../ui/catalog'
import { networkMessage } from '../ui/networkMessage'
import { useLoad } from './useLoad'

interface Data {
  groups: ProductGroup[]
  discounts: GroupDiscount[]
}

const show = (v: string | null | undefined) => (v ? String(Number(v)).replace('.', ',') : '')

function Form({ data, dealerId, onSaved }: { data: Data; dealerId: string; onSaved: () => void }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      data.groups.map((g) => [g.id, show(data.discounts.find((d) => d.groupId === g.id)?.discountPercent)]),
    ),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'info' | 'danger'; text: string } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setNotice(null)
    const errs: Record<string, string> = {}
    const items: { groupId: string; discountPercent: string }[] = []
    for (const g of data.groups) {
      const raw = (values[g.id] ?? '').trim().replace(',', '.')
      if (raw === '') continue
      if (!/^\d+(\.\d{1,2})?$/.test(raw) || !(Number(raw) > 0 && Number(raw) < 100))
        errs[g.id] = '0 ile 100 arasında, en fazla 2 ondalıklı.'
      else items.push({ groupId: g.id, discountPercent: raw })
    }
    setErrors(errs)
    if (Object.keys(errs).length > 0) return
    setBusy(true)
    try {
      await saveGroupDiscounts(dealerId, items)
      setNotice({ tone: 'info', text: 'Grup iskontoları kaydedildi.' })
      onSaved()
    } catch (err) {
      setNotice({
        tone: 'danger',
        text:
          err instanceof ApiError && err.status === 409
            ? 'Bu işlem bayinin şu anki durumunda yapılamaz, sayfayı yenileyin.'
            : err instanceof ApiError && err.status === 400
              ? 'Girilen oranlar geçersiz.'
              : networkMessage(err, 'İskontolar kaydedilemedi. Lütfen daha sonra tekrar deneyin.'),
      })
    } finally {
      setBusy(false)
    }
  }

  if (data.groups.length === 0)
    return (
      <p className="muted">
        Henüz ürün grubu yok. <Link to="/yonetim/urun-gruplari">Ürün gruplarını yönetin</Link>.
      </p>
    )

  return (
    <form className="ui-stack" onSubmit={submit} noValidate>
      {notice && <Alert tone={notice.tone}>{notice.text}</Alert>}
      <div className="ui-discount-list">
        {data.groups.map((g) => (
          <Field
            key={g.id}
            label={`${g.name}${g.isActive ? '' : ' (pasif)'} (%)`}
            htmlFor={`gd-${g.id}`}
            error={errors[g.id]}
          >
            <input
              id={`gd-${g.id}`}
              className="ui-input"
              inputMode="decimal"
              placeholder="Yok"
              value={values[g.id] ?? ''}
              onChange={(e) => setValues((s) => ({ ...s, [g.id]: e.target.value }))}
              aria-invalid={errors[g.id] ? true : undefined}
            />
          </Field>
        ))}
      </div>
      <div>
        <Button type="submit" disabled={busy}>
          {busy ? 'Kaydediliyor…' : 'Grup iskontolarını kaydet'}
        </Button>
      </div>
    </form>
  )
}

export function GroupDiscounts({ dealerId }: { dealerId: string }) {
  const { state, reload } = useLoad<Data>(async (signal) => {
    const [groups, discounts] = await Promise.all([
      fetchProductGroups(signal),
      fetchGroupDiscounts(dealerId, signal),
    ])
    return { groups, discounts }
  }, dealerId)
  return (
    <section className="ui-card ui-card__body ui-section" aria-labelledby="sec-group-discounts">
      <h2 id="sec-group-discounts">Ürün grubu iskontoları</h2>
      <p className="muted">
        Boş bıraktığınız grupta grup iskontosu yoktur. Genel ve grup iskontosundan yüksek olan uygulanır.
      </p>
      {state.status === 'loading' && <LoadingCard rows={2} />}
      {state.status === 'error' && <ErrorAlert onRetry={reload}>Grup iskontoları alınamadı.</ErrorAlert>}
      {state.status === 'ready' && <Form data={state.data} dealerId={dealerId} onSaved={reload} />}
    </section>
  )
}
