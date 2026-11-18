// K-87: Admin > Görünüm > Ana sayfa düzeni (/yonetim/gorunum/ana-sayfa). Vitrin ana sayfasının bölümleri:
// sıralama (yukarı/aşağı düğmeleri, Alt+ok tuşları, isteğe bağlı sürükleme), aç/kapa, bölüm ekleme/kaldırma ve
// tipine göre düzenleme paneli. Kaydedilmemiş değişiklikte çıkış uyarısı verilir.
import { useId, useState } from 'react'
import {
  fetchAdminHome,
  fetchAdminHomeDefault,
  saveAdminHome,
  type Audience,
  type CatalogGroup,
  type HomeSection,
  type HomeSectionConfig,
  type HomeSectionType,
  type ShelfSource,
} from '../../api'
import { Link } from '../../Link'
import {
  invalidateHome,
  AUDIENCE_LABELS,
  MAX_SECTIONS,
  SECTION_HELP,
  SECTION_LABELS,
  SHELF_TITLES,
  SOURCE_LABELS,
} from '../../shop/homeLayout'
import { invalidateSite } from '../../shop/site'
import { useCatalogGroups } from '../../shop/useCatalogGroups'
import { ErrorAlert } from '../../ui/catalog'
import { Alert, Button, Field } from '../../ui/components'
import { Icon } from '../../ui/Icon'
import { AdminLayout } from '../AdminLayout'
import { Panel, SkeletonRows } from '../kit'
import { useLoad } from '../useLoad'
import { useUnsavedGuard } from '../useUnsavedGuard'
import { ReorderButtons, SaveBar, SaveError, Switch } from './parts'
import { focusMoved, isAppPath, moveItem, reorderKey } from './lib'
import { ProductPicker } from './ProductPicker'

const ADDABLE: HomeSectionType[] = [
  'productShelf',
  'promoPanel',
  'campaignStrip',
  'collections',
  'howItWorks',
  'iconTiles',
  'categoryStrip',
  'trustStrip',
  'hero',
]

const SOURCES = Object.keys(SOURCE_LABELS) as ShelfSource[]

function newId(type: string): string {
  const rand =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `${type}-${rand}`
}

function defaultsFor(type: HomeSectionType): HomeSection {
  const base = { id: newId(type), type, enabled: true }
  switch (type) {
    case 'productShelf':
      return { ...base, title: 'Yeni raf', config: { source: 'bestSellers', limit: 5, layout: 'grid' } }
    case 'promoPanel':
      return {
        ...base,
        config: {
          source: 'featured',
          limit: 8,
          panelTitle: 'Öne çıkan ürünler',
          panelText: '',
          buttonLabel: 'Tümünü gör',
        },
      }
    case 'campaignStrip':
      return { ...base, config: { audience: 'all', title: '', text: '' } }
    case 'collections':
      return { ...base, config: { groupIds: [] } }
    case 'howItWorks':
      return { ...base, config: { audience: 'guest' } }
    default:
      return { ...base, config: {} }
  }
}

/** Kaydedilen/karşılaştırılan sade biçim. Sunucunun çözdüğü alanlar (productIds) dışarıda bırakılır. */
const clean = (s: HomeSection): HomeSection => ({
  id: s.id,
  type: s.type,
  enabled: s.enabled,
  ...(s.title !== undefined && s.title !== '' ? { title: s.title } : {}),
  ...(s.subtitle !== undefined && s.subtitle !== '' ? { subtitle: s.subtitle } : {}),
  config: s.config ?? {},
})
const sig = (list: HomeSection[]) => JSON.stringify(list.map(clean))

function summary(s: HomeSection, groups: CatalogGroup[]): string {
  const c = s.config
  switch (s.type) {
    case 'productShelf':
    case 'promoPanel': {
      const src = c.source ?? 'new'
      const grp =
        src === 'group' ? ` · ${groups.find((g) => g.id === c.groupId)?.name ?? 'grup seçilmedi'}` : ''
      const man = src === 'manual' ? ` · ${c.productIds?.length ?? 0} ürün` : ''
      return `${SOURCE_LABELS[src]}${grp}${man} · en çok ${c.limit ?? 5} ürün${s.type === 'productShelf' ? (c.layout === 'carousel' ? ' · kaydırmalı' : ' · ızgara') : ''}`
    }
    case 'campaignStrip':
      return c.title?.trim()
        ? `${c.title} · ${AUDIENCE_LABELS[c.audience ?? 'all']}`
        : 'Varsayılan “Bayimiz olun / Fiyat listenizi indirin” şeridi'
    case 'collections':
      return c.groupIds && c.groupIds.length > 0 ? `${c.groupIds.length} seçili grup` : 'En çok ürünlü 4 grup'
    case 'howItWorks':
      return AUDIENCE_LABELS[c.audience ?? 'guest']
    default:
      return SECTION_HELP[s.type]
  }
}

export function HomeLayoutPage() {
  const { state, reload } = useLoad(fetchAdminHome, 'admin-home')
  const groups = useCatalogGroups()
  return (
    <AdminLayout title="Ana sayfa düzeni">
      {state.status === 'loading' && <SkeletonRows rows={6} />}
      {state.status === 'error' && <ErrorAlert onRetry={reload}>Ana sayfa düzeni alınamadı.</ErrorAlert>}
      {state.status === 'ready' && (
        <Editor
          initial={state.data.sections}
          groups={groups.state.status === 'ready' ? groups.state.data : []}
        />
      )}
    </AdminLayout>
  )
}

function Editor({ initial, groups }: { initial: HomeSection[]; groups: CatalogGroup[] }) {
  const [sections, setSections] = useState(initial)
  const [base, setBase] = useState(initial)
  const [open, setOpen] = useState<string | null>(null)
  const [addType, setAddType] = useState<HomeSectionType>('productShelf')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [saved, setSaved] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [live, setLive] = useState('')
  const [drag, setDrag] = useState<number | null>(null)
  const dirty = sig(sections) !== sig(base)
  useUnsavedGuard(dirty)

  const patch = (id: string, p: Partial<HomeSection>) =>
    setSections((cur) => cur.map((s) => (s.id === id ? { ...s, ...p } : s)))
  const patchCfg = (id: string, p: Partial<HomeSectionConfig>) =>
    setSections((cur) => cur.map((s) => (s.id === id ? { ...s, config: { ...s.config, ...p } } : s)))

  function move(from: number, to: number) {
    if (to < 0 || to >= sections.length || from === to) return
    focusMoved(`sec-${sections[from].id}`, to > from ? 'down' : 'up')
    setSections(moveItem(sections, from, to))
    setLive(`${SECTION_LABELS[sections[from].type]} ${to + 1}. sıraya taşındı`)
  }

  function add() {
    const s = defaultsFor(addType)
    setSections((cur) => [...cur, s])
    setOpen(s.id)
    setLive(`${SECTION_LABELS[addType]} eklendi`)
    requestAnimationFrame(() =>
      document.getElementById(`sec-${s.id}-edit`)?.scrollIntoView({ block: 'nearest' }),
    )
  }

  function validate(): Record<string, string> {
    const e: Record<string, string> = {}
    for (const s of sections) {
      const c = s.config
      if (s.type === 'productShelf' || s.type === 'promoPanel') {
        const src = c.source ?? 'new'
        if (src === 'group' && !groups.some((g) => g.id === c.groupId))
          e[`${s.id}:groupId`] = 'Bir ürün grubu seçin.'
        if (src === 'manual' && (c.productIds?.length ?? 0) === 0)
          e[`${s.id}:productIds`] = 'En az bir ürün seçin.'
        const lim = c.limit ?? 5
        if (!Number.isInteger(lim) || lim < 4 || lim > 24)
          e[`${s.id}:limit`] = 'Ürün sayısı 4 ile 24 arasında olmalı.'
      }
      if (s.type === 'campaignStrip' || s.type === 'promoPanel') {
        const label = c.buttonLabel?.trim() ?? ''
        const link = c.buttonLink?.trim() ?? ''
        if (s.type === 'campaignStrip' && (label || link) && !(label && link))
          e[`${s.id}:buttonLabel`] = 'Düğme için hem yazı hem bağlantı girin.'
        if (link && !isAppPath(link))
          e[`${s.id}:buttonLink`] = 'Bağlantı "/" ile başlayan bir site yolu olmalı (ör. /katalog).'
      }
      if (s.type === 'campaignStrip' && !(c.title?.trim() ?? '') && (c.text?.trim() ?? ''))
        e[`${s.id}:title`] = 'Metin için bir başlık girin.'
      if (s.type === 'collections' && (c.groupIds?.length ?? 0) > 4)
        e[`${s.id}:groupIds`] = 'En çok 4 grup seçilebilir.'
    }
    return e
  }

  async function save() {
    const errs = validate()
    setErrors(errs)
    setSaved(false)
    const first = Object.keys(errs)[0]
    if (first) {
      setOpen(first.split(':')[0])
      requestAnimationFrame(() =>
        requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()),
      )
      return
    }
    setBusy(true)
    setError(null)
    try {
      const out = await saveAdminHome({ sections: sections.map(clean) })
      invalidateSite()
      invalidateHome()
      setSections(out.sections)
      setBase(out.sections)
      setSaved(true)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  /** Sunucunun varsayılan düzenini forma doldurur; kaydedilmez, kullanıcı Kaydet'e basar. */
  async function resetToDefault() {
    if (
      !window.confirm(
        'Form varsayılan ana sayfa düzeniyle doldurulacak (kaydedene kadar vitrin değişmez). Devam edilsin mi?',
      )
    )
      return
    setError(null)
    try {
      const d = await fetchAdminHomeDefault()
      setSections(d.sections.map(({ productIds: _ids, ...rest }) => rest))
      setErrors({})
      setOpen(null)
      setSaved(false)
      setLive('Varsayılan düzen forma yüklendi; kaydetmeniz gerekir')
    } catch (e) {
      setError(e)
    }
  }

  const enabledCount = sections.filter((s) => s.enabled).length

  return (
    <div className="adm-stack">
      <div className="ap-intro">
        <p className="muted">
          Vitrin ana sayfasının bölümlerini sıralayın, açıp kapatın ve düzenleyin. Sıralama için yukarı/aşağı
          düğmelerini ya da satırdayken Alt + ok tuşlarını kullanın; isteğe bağlı olarak tutamacı
          sürükleyebilirsiniz.
        </p>
        <a className="ui-button ui-button--secondary" href="/" target="_blank" rel="noopener noreferrer">
          <Icon name="external" />
          Vitrinde önizle<span className="visually-hidden"> (yeni sekmede açılır)</span>
        </a>
      </div>
      {dirty && (
        <Alert tone="warning">
          Önizleme kayıtlı düzeni gösterir; değişikliklerin görünmesi için önce kaydedin.
        </Alert>
      )}
      {saved && !dirty && <Alert>Ana sayfa düzeni kaydedildi. Değişiklikler vitrinde hemen görünür.</Alert>}
      <SaveError error={error} />
      <span className="visually-hidden" role="status" aria-live="polite">
        {live}
      </span>

      <Panel title={`Bölümler (${enabledCount} açık / ${sections.length}, en çok ${MAX_SECTIONS})`}>
        {sections.length === 0 ? (
          <p className="adm-empty">Hiç bölüm yok: vitrinde varsayılan düzen gösterilir.</p>
        ) : (
          <ol className="ap-sections">
            {sections.map((s, i) => {
              const isOpen = open === s.id
              const label = SECTION_LABELS[s.type]
              const title = s.title?.trim() || s.config.title?.trim() || s.config.panelTitle?.trim()
              return (
                <li
                  key={s.id}
                  className="ap-section"
                  data-off={!s.enabled || undefined}
                  data-drag={drag === i || undefined}
                  onDragOver={(e) => drag !== null && e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (drag !== null) move(drag, i)
                    setDrag(null)
                  }}
                  onKeyDown={(e) => {
                    if (
                      e.target instanceof HTMLInputElement ||
                      e.target instanceof HTMLSelectElement ||
                      e.target instanceof HTMLTextAreaElement
                    )
                      return
                    reorderKey(e, i, (to) => move(i, to))
                  }}
                >
                  <div className="ap-section__bar">
                    <span
                      className="ap-grip"
                      draggable
                      aria-hidden="true"
                      title="Sürükleyerek taşıyın"
                      onDragStart={(e) => {
                        setDrag(i)
                        e.dataTransfer.effectAllowed = 'move'
                        e.dataTransfer.setData('text/plain', s.id)
                      }}
                      onDragEnd={() => setDrag(null)}
                    >
                      <Icon name="list" />
                    </span>
                    <span className="ap-section__no num" aria-hidden="true">
                      {i + 1}
                    </span>
                    <span className="ap-section__text">
                      <strong>
                        {label}
                        {title ? <span className="ap-section__title"> · {title}</span> : null}
                      </strong>
                      <span className="muted ap-section__sum">{summary(s, groups)}</span>
                    </span>
                    <span className="ap-section__tools">
                      <Switch
                        on={s.enabled}
                        onChange={(on) => patch(s.id, { enabled: on })}
                        label={`${i + 1}. bölüm (${label}) vitrinde ${s.enabled ? 'açık' : 'kapalı'}`}
                        hideLabel
                      />
                      <ReorderButtons
                        idBase={`sec-${s.id}`}
                        index={i}
                        count={sections.length}
                        label={`${i + 1}. bölüm (${label})`}
                        onMove={(to) => move(i, to)}
                      />
                      <button
                        type="button"
                        className="ap-iconbtn"
                        aria-expanded={isOpen}
                        aria-controls={`sec-${s.id}-edit`}
                        aria-label={`${i + 1}. bölüm (${label}): ${isOpen ? 'düzenlemeyi kapat' : 'düzenle'}`}
                        onClick={() => setOpen(isOpen ? null : s.id)}
                      >
                        <Icon name={isOpen ? 'chevronDown' : 'edit'} />
                      </button>
                      <button
                        type="button"
                        className="ap-iconbtn ap-iconbtn--danger"
                        aria-label={`${i + 1}. bölüm (${label}): kaldır`}
                        onClick={() => {
                          setSections((cur) => cur.filter((x) => x.id !== s.id))
                          setLive(`${label} kaldırıldı`)
                        }}
                      >
                        <Icon name="trash" />
                      </button>
                    </span>
                  </div>
                  {isOpen && (
                    <div id={`sec-${s.id}-edit`} className="ap-section__edit">
                      <SectionFields
                        s={s}
                        groups={groups}
                        errors={errors}
                        patch={(p) => patch(s.id, p)}
                        cfg={(p) => patchCfg(s.id, p)}
                      />
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        )}

        <div className="ap-add">
          <Field label="Eklenecek bölüm türü" htmlFor="sec-add-type" help={SECTION_HELP[addType]}>
            <select
              id="sec-add-type"
              className="ui-select"
              value={addType}
              onChange={(e) => setAddType(e.target.value as HomeSectionType)}
            >
              {ADDABLE.map((t) => (
                <option key={t} value={t}>
                  {SECTION_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
          <Button variant="secondary" icon="plus" disabled={sections.length >= MAX_SECTIONS} onClick={add}>
            Bölüm ekle
          </Button>
        </div>
      </Panel>

      <SaveBar
        dirty={dirty}
        busy={busy}
        onSave={save}
        onReset={() => {
          setSections(base)
          setErrors({})
        }}
        extra={
          <Button variant="ghost" disabled={busy} onClick={resetToDefault}>
            Varsayılana dön
          </Button>
        }
      />
    </div>
  )
}

// ---------- Tipe göre alanlar ----------
function SectionFields({
  s,
  groups,
  errors,
  patch,
  cfg,
}: {
  s: HomeSection
  groups: CatalogGroup[]
  errors: Record<string, string>
  patch: (p: Partial<HomeSection>) => void
  cfg: (p: Partial<HomeSectionConfig>) => void
}) {
  const c = s.config
  const idb = useId()
  const err = (f: string) => errors[`${s.id}:${f}`]
  const text = (
    f: string,
    label: string,
    value: string,
    set: (v: string) => void,
    opts?: { help?: string; max?: number; placeholder?: string },
  ) => (
    <Field label={label} htmlFor={`${idb}-${f}`} help={opts?.help} error={err(f)}>
      <input
        id={`${idb}-${f}`}
        className="ui-input"
        value={value}
        maxLength={opts?.max}
        placeholder={opts?.placeholder}
        aria-invalid={err(f) ? true : undefined}
        onChange={(e) => set(e.target.value)}
      />
    </Field>
  )
  const audience = (def: Audience) => (
    <Field label="Kimlere gösterilsin" htmlFor={`${idb}-aud`}>
      <select
        id={`${idb}-aud`}
        className="ui-select"
        value={c.audience ?? def}
        onChange={(e) => cfg({ audience: e.target.value as Audience })}
      >
        {(Object.keys(AUDIENCE_LABELS) as Audience[]).map((a) => (
          <option key={a} value={a}>
            {AUDIENCE_LABELS[a]}
          </option>
        ))}
      </select>
    </Field>
  )

  const sourceFields = (
    <>
      <Field label="Ürün kaynağı" htmlFor={`${idb}-src`}>
        <select
          id={`${idb}-src`}
          className="ui-select"
          value={c.source ?? 'new'}
          onChange={(e) => cfg({ source: e.target.value as ShelfSource })}
        >
          {SOURCES.map((x) => (
            <option key={x} value={x}>
              {SOURCE_LABELS[x]}
            </option>
          ))}
        </select>
      </Field>
      {c.source === 'group' && (
        <Field label="Ürün grubu" htmlFor={`${idb}-groupId`} error={err('groupId')}>
          <select
            id={`${idb}-groupId`}
            className="ui-select"
            value={c.groupId ?? ''}
            aria-invalid={err('groupId') ? true : undefined}
            onChange={(e) => cfg({ groupId: e.target.value })}
          >
            <option value="">Seçin…</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {c.source === 'manual' && (
        <div className="ap-fieldgroup">
          {err('productIds') && (
            <p className="ui-error" role="alert" aria-invalid="true" tabIndex={-1}>
              {err('productIds')}
            </p>
          )}
          <ProductPicker
            idBase={`${idb}-pick`}
            ids={c.productIds ?? []}
            max={Math.min(24, c.limit ?? 24)}
            onChange={(ids) => cfg({ productIds: ids })}
          />
        </div>
      )}
      <Field
        label="Ürün sayısı"
        htmlFor={`${idb}-limit`}
        help="4 ile 24 arası. Kaynakta daha az ürün varsa o kadarı gösterilir."
        error={err('limit')}
      >
        <input
          id={`${idb}-limit`}
          className="ui-input ap-narrow"
          type="number"
          min={4}
          max={24}
          value={c.limit ?? 5}
          aria-invalid={err('limit') ? true : undefined}
          onChange={(e) => cfg({ limit: e.target.value === '' ? undefined : Number(e.target.value) })}
        />
      </Field>
    </>
  )

  switch (s.type) {
    case 'productShelf':
      return (
        <div className="ap-fields">
          {text('title', 'Başlık', s.title ?? '', (v) => patch({ title: v }), {
            help: `Boşsa “${SHELF_TITLES[c.source ?? 'new']}” yazar.`,
            max: 80,
          })}
          {text('subtitle', 'Alt başlık (isteğe bağlı)', s.subtitle ?? '', (v) => patch({ subtitle: v }), {
            max: 120,
          })}
          {sourceFields}
          <Field label="Düzen" htmlFor={`${idb}-layout`}>
            <select
              id={`${idb}-layout`}
              className="ui-select"
              value={c.layout ?? 'grid'}
              onChange={(e) => cfg({ layout: e.target.value as 'grid' | 'carousel' })}
            >
              <option value="grid">Izgara</option>
              <option value="carousel">Yana kaydırmalı şerit</option>
            </select>
          </Field>
        </div>
      )
    case 'promoPanel':
      return (
        <div className="ap-fields">
          {text('panelTitle', 'Panel başlığı', c.panelTitle ?? '', (v) => cfg({ panelTitle: v }), {
            max: 60,
          })}
          {text('panelText', 'Panel metni', c.panelText ?? '', (v) => cfg({ panelText: v }), { max: 160 })}
          {text('buttonLabel', 'Düğme yazısı', c.buttonLabel ?? '', (v) => cfg({ buttonLabel: v }), {
            help: 'Boşsa “Tümünü gör” yazar.',
            max: 30,
          })}
          {text('buttonLink', 'Düğme bağlantısı', c.buttonLink ?? '', (v) => cfg({ buttonLink: v }), {
            help: 'Boşsa kaynağın katalog sayfasına gider. Örn. /katalog?one-cikan=1',
            placeholder: '/katalog',
          })}
          {sourceFields}
        </div>
      )
    case 'campaignStrip':
      return (
        <div className="ap-fields">
          <p className="muted ap-fields__note">
            Başlık boş bırakılırsa standart şerit gösterilir (misafire “Bayimiz olun”, bayiye “Fiyat listenizi
            indirin”).
          </p>
          {audience('all')}
          {text('title', 'Başlık', c.title ?? '', (v) => cfg({ title: v }), { max: 80 })}
          {text('text', 'Metin', c.text ?? '', (v) => cfg({ text: v }), { max: 200 })}
          {text('buttonLabel', 'Düğme yazısı', c.buttonLabel ?? '', (v) => cfg({ buttonLabel: v }), {
            max: 30,
          })}
          {text('buttonLink', 'Düğme bağlantısı', c.buttonLink ?? '', (v) => cfg({ buttonLink: v }), {
            placeholder: '/katalog?yeni=1',
          })}
        </div>
      )
    case 'collections':
      return (
        <div className="ap-fields">
          <fieldset className="ap-groups">
            <legend className="ui-label">
              Koleksiyon grupları (en çok 4; seçilmezse en çok ürünlü 4 grup)
            </legend>
            {err('groupIds') && <p className="ui-error">{err('groupIds')}</p>}
            {groups.map((g) => {
              const on = c.groupIds?.includes(g.id) ?? false
              const full = (c.groupIds?.length ?? 0) >= 4
              return (
                <label key={g.id} className="ui-check">
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={!on && full}
                    onChange={(e) =>
                      cfg({
                        groupIds: e.target.checked
                          ? [...(c.groupIds ?? []), g.id]
                          : (c.groupIds ?? []).filter((x) => x !== g.id),
                      })
                    }
                  />
                  <span>
                    {g.name}
                    {!g.thumbUrl && <span className="muted"> (görseli yok, gösterilmez)</span>}
                  </span>
                </label>
              )
            })}
          </fieldset>
        </div>
      )
    case 'howItWorks':
      return <div className="ap-fields">{audience('guest')}</div>
    case 'hero':
      return (
        <p className="muted">
          Görseller <Link to="/yonetim/bannerlar">Kampanya görselleri</Link> sayfasından yönetilir.
        </p>
      )
    case 'categoryStrip':
      return (
        <p className="muted">
          Gruplar ve küçük resimleri <Link to="/yonetim/urun-gruplari">Ürün grupları</Link> sayfasından
          yönetilir.
        </p>
      )
    default:
      return (
        <p className="muted">
          {SECTION_HELP[s.type]} Bu bölümün düzenlenecek bir ayarı yok; yalnızca yeri ve açık/kapalı durumu
          değişir.
        </p>
      )
  }
}
