// K-85: Admin > Analitik > Ürün ilgisi (/yonetim/analitik/urunler). Sıralanabilir tablo; "çok bakılıyor ama satmıyor" vurgusu.
import { useState } from 'react'
import { fetchAnalyticsProducts, type AnalyticsProductRow } from '../../api'
import { Link } from '../../Link'
import { replace, useRoute } from '../../router'
import { ErrorAlert } from '../../ui/catalog'
import { EmptyState } from '../../ui/components'
import { formatInt, formatPercent } from '../../ui/format'
import { AdminLayout } from '../AdminLayout'
import { Panel, SkeletonRows } from '../kit'
import { ReportTable, type Col } from '../reports/ui'
import { useLoad } from '../useLoad'
import { PeriodBar } from './shared'
import { usePeriod } from './lib'

type Basis = 'views' | 'addToCart' | 'ordered'
const BASES: { id: Basis; label: string }[] = [
  { id: 'views', label: 'En çok görüntülenen' },
  { id: 'addToCart', label: 'En çok sepete eklenen' },
  { id: 'ordered', label: 'En çok sipariş edilen' },
]

/**
 * "Çok bakılıyor ama satmıyor": listedeki görüntülenme üst çeyreğinde (en az 10) ve siparişi 0 ya da 1.
 * Yalnızca görsel vurgudur; eşik arayüze aittir.
 */
function stalled(rows: AnalyticsProductRow[]): Set<string> {
  const views = rows.map((r) => r.views).sort((a, b) => a - b)
  const p75 = views.length ? views[Math.floor((views.length - 1) * 0.75)] : 0
  const min = Math.max(10, p75)
  return new Set(rows.filter((r) => r.views >= min && r.orderCount <= 1).map((r) => r.productId))
}

export function ProductInterestPage() {
  const { from, to, invalid } = usePeriod()
  const { query } = useRoute()
  const raw = query.get('sirala')
  const basis: Basis = raw === 'sepet' ? 'addToCart' : raw === 'siparis' ? 'ordered' : 'views'
  const [onlyStalled, setOnlyStalled] = useState(false)
  const { state, reload } = useLoad(
    (s) => fetchAnalyticsProducts({ from, to }, basis, s),
    `${from}|${to}|${basis}`,
  )
  const setBasis = (b: Basis) =>
    replace(
      `/yonetim/analitik/urunler?bas=${from}&bit=${to}${b === 'views' ? '' : `&sirala=${b === 'addToCart' ? 'sepet' : 'siparis'}`}`,
    )

  const rows = state.status === 'ready' ? state.data.items : []
  const flagged = stalled(rows)
  const shown = onlyStalled ? rows.filter((r) => flagged.has(r.productId)) : rows

  const cols: Col<AnalyticsProductRow>[] = [
    {
      key: 'name',
      label: 'Ürün',
      title: true,
      sort: (r) => r.name,
      cell: (r) => (
        <span className="an-prod">
          {r.thumbUrl ? (
            <img className="an-prod__img" src={r.thumbUrl} alt="" width={40} height={40} loading="lazy" />
          ) : (
            <span className="an-prod__img an-prod__img--empty" aria-hidden="true" />
          )}
          <span className="an-prod__text">
            <Link to={`/yonetim/urunler/${encodeURIComponent(r.productId)}`}>{r.name}</Link>
            <span className="muted num an-prod__sub">{r.barcode}</span>
            {flagged.has(r.productId) && (
              <span className="ui-badge ui-badge--warning an-prod__flag">Çok bakılıyor, satmıyor</span>
            )}
          </span>
        </span>
      ),
    },
    { key: 'views', label: 'Görüntülenme', num: true, sort: (r) => r.views, cell: (r) => formatInt(r.views) },
    {
      key: 'unique',
      label: 'Tekil izleyici',
      num: true,
      sort: (r) => r.uniqueViewers,
      cell: (r) => formatInt(r.uniqueViewers),
    },
    {
      key: 'cart',
      label: 'Sepete ekleme',
      num: true,
      sort: (r) => r.addToCarts,
      cell: (r) => formatInt(r.addToCarts),
    },
    {
      key: 'ordered',
      label: 'Sipariş adedi',
      num: true,
      sort: (r) => r.orderedQuantity,
      cell: (r) => (
        <>
          {formatInt(r.orderedQuantity)}
          <span className="muted"> ({formatInt(r.orderCount)} sipariş)</span>
        </>
      ),
    },
    {
      key: 'rate',
      label: 'İnceleme → sepet',
      num: true,
      sort: (r) => r.viewToCartRate,
      cell: (r) => formatPercent(String(r.viewToCartRate)),
    },
  ]

  return (
    <AdminLayout title="Ürün ilgisi">
      <PeriodBar path="/yonetim/analitik/urunler" from={from} to={to} invalid={invalid} />
      <div className="adm-card an-toolbar">
        <div className="ui-chips" role="group" aria-label="Liste ölçütü">
          {BASES.map((b) => (
            <button
              key={b.id}
              type="button"
              className="ui-chip"
              aria-pressed={basis === b.id}
              onClick={() => setBasis(b.id)}
            >
              {b.label}
            </button>
          ))}
        </div>
        <label className="ui-check an-toolbar__check">
          <input type="checkbox" checked={onlyStalled} onChange={(e) => setOnlyStalled(e.target.checked)} />
          <span>Yalnızca çok bakılıp satmayanlar ({formatInt(flagged.size)})</span>
        </label>
      </div>
      <p className="an-note muted">
        İlk 50 ürün gösterilir. “Çok bakılıyor, satmıyor”: listedeki görüntülenme üst çeyreğinde (en az 10)
        olup dönemde en fazla 1 siparişte yer alan ürünler; fiyat, görsel ya da stok durumunu gözden geçirin.
      </p>

      {state.status === 'loading' && <SkeletonRows rows={6} />}
      {state.status === 'error' && <ErrorAlert onRetry={reload}>Ürün ilgisi verisi alınamadı.</ErrorAlert>}
      {state.status === 'ready' && (
        <Panel title="Ürünler" flush>
          {shown.length === 0 ? (
            <EmptyState
              icon="eye"
              title={onlyStalled ? 'Bu ölçüte uyan ürün yok' : 'Bu dönemde ürün verisi yok'}
            >
              {onlyStalled
                ? 'Süzgeci kapatarak tüm listeyi görebilirsiniz.'
                : 'Vitrinde ürün incelendikçe burada görünür.'}
            </EmptyState>
          ) : (
            <div className="an-tablewrap">
              <ReportTable
                key={basis}
                rows={shown}
                cols={cols}
                rowKey={(r) => r.productId}
                caption="Ürün ilgisi"
                defaultSort={{
                  key: basis === 'views' ? 'views' : basis === 'addToCart' ? 'cart' : 'ordered',
                  dir: 'desc',
                }}
              />
            </div>
          )}
        </Panel>
      )}
    </AdminLayout>
  )
}
