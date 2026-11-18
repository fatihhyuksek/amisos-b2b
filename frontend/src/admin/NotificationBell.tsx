// K-78: Bildirim merkezi. Zil + okunmamış sayısı, açılır panel, "tümünü okundu say".
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Link } from '../Link'
import { Icon, type IconName } from '../ui/Icon'
import { useDismiss } from './kitUtils'
import { timeAgo } from './time'
import { useNotificationFeed } from './useFeed'
import type { FeedItem } from '../api'

const TYPE_ICON: Record<FeedItem['type'], IconName> = {
  order_submitted: 'orders',
  application_verified: 'users',
  notification_failed: 'warning',
  order_status_changed: 'truck',
}

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const btn = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const feed = useNotificationFeed()
  const close = useCallback(() => setOpen(false), [])
  useDismiss(open, close, wrap, btn)

  // Panel açılınca yenilenir.
  const { reload } = feed
  useEffect(() => {
    if (open) reload()
  }, [open, reload])

  return (
    <div className="adm-menu" ref={wrap}>
      <button
        ref={btn}
        type="button"
        className="adm-iconbtn"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={feed.unread > 0 ? `Bildirimler, ${feed.unread} okunmamış` : 'Bildirimler'}
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="bell" />
        {feed.unread > 0 && (
          <span className="adm-iconbtn__dot num" aria-hidden="true">
            {feed.unread > 9 ? '9+' : feed.unread}
          </span>
        )}
      </button>
      {open && (
        <div id={panelId} role="dialog" aria-label="Bildirimler" className="adm-pop adm-pop--right adm-feed">
          <header className="adm-feed__head">
            <h2>Bildirimler</h2>
            <button
              type="button"
              className="adm-textbtn"
              disabled={feed.unread === 0}
              onClick={() => void feed.markAllRead()}
            >
              Tümünü okundu say
            </button>
          </header>
          <div className="adm-feed__list">
            {!feed.loaded && <p className="adm-feed__note">Yükleniyor…</p>}
            {feed.loaded && feed.error && feed.items.length === 0 && (
              <p className="adm-feed__note">Bildirimler alınamadı.</p>
            )}
            {feed.loaded && !feed.error && feed.items.length === 0 && (
              <p className="adm-feed__note">Son 30 günde yeni bir gelişme yok.</p>
            )}
            <ul>
              {feed.items.map((it, i) => (
                <li key={it.id}>
                  <Link
                    to={it.link}
                    className="adm-feed__item"
                    data-unread={i < feed.unread || undefined}
                    onClick={close}
                  >
                    <span className="adm-feed__icon">
                      <Icon name={TYPE_ICON[it.type] ?? 'info'} />
                    </span>
                    <span className="adm-feed__text">
                      <span className="adm-feed__title">
                        {i < feed.unread && <span className="visually-hidden">Okunmamış: </span>}
                        {it.title}
                      </span>
                      <span className="adm-feed__body">{it.body}</span>
                    </span>
                    <time className="adm-feed__time" dateTime={it.createdAt}>
                      {timeAgo(it.createdAt)}
                    </time>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <footer className="adm-feed__foot">
            <Link to="/yonetim/bildirimler" onClick={close}>
              Tüm bildirimler
            </Link>
          </footer>
        </div>
      )}
    </div>
  )
}
