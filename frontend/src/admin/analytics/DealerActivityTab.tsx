// K-85: Bayi detayı > Etkinlik sekmesi. Gün başlıklarıyla gruplu zaman çizelgesi; "daha fazla yükle" ile eskiye gidilir.
import { useCallback, useEffect, useState } from 'react'
import { fetchDealerActivity, type DealerActivityItem } from '../../api'
import { Link } from '../../Link'
import { ErrorAlert } from '../../ui/catalog'
import { Button, EmptyState } from '../../ui/components'
import { formatInt } from '../../ui/format'
import { SkeletonRows } from '../kit'
import { EventIcon } from './shared'
import { EVENT_LABEL, pathLabel } from './lib'

const DAY_KEY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' })
const DAY_LONG = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  weekday: 'long',
})
const TIME = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  hour: '2-digit',
  minute: '2-digit',
})

function dayTitle(iso: string): string {
  const key = DAY_KEY.format(new Date(iso))
  const now = Date.now()
  if (key === DAY_KEY.format(new Date(now))) return 'Bugün'
  if (key === DAY_KEY.format(new Date(now - 86_400_000))) return 'Dün'
  return DAY_LONG.format(new Date(iso))
}

function EventText({ e }: { e: DealerActivityItem }) {
  const product = e.productName ? (
    e.productId ? (
      <Link to={`/yonetim/urunler/${encodeURIComponent(e.productId)}`}>{e.productName}</Link>
    ) : (
      e.productName
    )
  ) : null
  switch (e.type) {
    case 'login':
      return <strong>Giriş yaptı</strong>
    case 'page_view':
      return (
        <>
          <strong>{EVENT_LABEL.page_view}</strong> <span className="muted">· {pathLabel(e.path)}</span>
        </>
      )
    case 'product_view':
      return (
        <>
          <strong>{EVENT_LABEL.product_view}</strong>
          {product && <> · {product}</>}
        </>
      )
    case 'search':
      return (
        <>
          <strong>Arama yaptı</strong> · “{e.query ?? ''}”
          {e.resultCount !== null && (
            <span className={e.resultCount === 0 ? 'an-zero' : 'muted'}>
              {' '}
              ({e.resultCount === 0 ? 'sonuç yok' : `${formatInt(e.resultCount)} sonuç`})
            </span>
          )}
        </>
      )
    case 'add_to_cart':
      return (
        <>
          <strong>{EVENT_LABEL.add_to_cart}</strong>
          {product && <> · {product}</>}
          {e.quantity !== null && <span className="muted num"> × {formatInt(e.quantity)}</span>}
        </>
      )
    case 'order_submitted':
      return (
        <>
          <strong>{EVENT_LABEL.order_submitted}</strong>
          {e.orderId && (
            <>
              {' '}
              ·{' '}
              <Link className="num" to={`/yonetim/siparisler/${encodeURIComponent(e.orderId)}`}>
                #{e.orderNo ?? 'sipariş'}
              </Link>
            </>
          )}
        </>
      )
  }
}

export function DealerActivityTab({ dealerId }: { dealerId: string }) {
  const [items, setItems] = useState<DealerActivityItem[]>([])
  const [next, setNext] = useState<number | string | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [more, setMore] = useState<'idle' | 'busy' | 'error'>('idle')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    const c = new AbortController()
    fetchDealerActivity(dealerId, null, c.signal)
      .then((r) => {
        if (!alive) return
        setItems(r.items)
        setNext(r.nextBefore)
        setStatus('ready')
      })
      .catch(() => {
        if (alive && !c.signal.aborted) setStatus('error')
      })
    return () => {
      alive = false
      c.abort()
    }
  }, [dealerId, tick])

  const loadMore = useCallback(async () => {
    if (next === null) return
    setMore('busy')
    try {
      const r = await fetchDealerActivity(dealerId, next)
      setItems((cur) => [...cur, ...r.items.filter((n) => !cur.some((o) => o.id === n.id))])
      setNext(r.nextBefore)
      setMore('idle')
    } catch {
      setMore('error')
    }
  }, [dealerId, next])

  if (status === 'loading') return <SkeletonRows rows={6} />
  if (status === 'error')
    return (
      <ErrorAlert
        onRetry={() => {
          setStatus('loading')
          setTick((n) => n + 1)
        }}
      >
        Etkinlik alınamadı.
      </ErrorAlert>
    )
  if (items.length === 0)
    return (
      <div className="adm-card">
        <EmptyState icon="history" title="Henüz etkinlik yok">
          Bayi vitrinde gezindikçe, arama yaptıkça ve sipariş verdikçe burada görünür.
        </EmptyState>
      </div>
    )

  const groups: { title: string; key: string; rows: DealerActivityItem[] }[] = []
  for (const it of items) {
    const key = DAY_KEY.format(new Date(it.at))
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.rows.push(it)
    else groups.push({ key, title: dayTitle(it.at), rows: [it] })
  }

  return (
    <div className="adm-card an-timeline">
      {groups.map((g) => (
        <section key={g.key} aria-label={g.title}>
          <h3 className="an-timeline__day">{g.title}</h3>
          <ol className="an-timeline__list">
            {g.rows.map((e) => (
              <li key={e.id}>
                <EventIcon type={e.type} />
                <span className="an-timeline__text">
                  <EventText e={e} />
                </span>
                <time className="muted num an-timeline__time" dateTime={e.at}>
                  {TIME.format(new Date(e.at))}
                </time>
              </li>
            ))}
          </ol>
        </section>
      ))}
      {more === 'error' && <ErrorAlert onRetry={loadMore}>Daha fazla etkinlik alınamadı.</ErrorAlert>}
      {next !== null ? (
        <div className="an-timeline__more">
          <Button variant="secondary" disabled={more === 'busy'} onClick={loadMore}>
            {more === 'busy' ? 'Yükleniyor…' : 'Daha fazla yükle'}
          </Button>
        </div>
      ) : (
        <p className="muted an-timeline__end">Başka etkinlik yok.</p>
      )}
    </div>
  )
}
