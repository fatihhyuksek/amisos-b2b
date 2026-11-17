// K-65, GR-YON-001: Admin "Kampanya görselleri" (/yonetim/bannerlar). Liste, sıralama, ekle/düzenle, sil.
import { useEffect, useState } from 'react'
import { ApiError, deleteBanner, fetchAdminBanners, reorderBanners, type AdminBanner } from '../api'
import { Alert, Badge, Button, EmptyState, Modal } from '../ui/components'
import { ErrorAlert, LoadingCard, ProductImage } from '../ui/catalog'
import { replace, useRoute } from '../router'
import { networkMessage } from '../ui/networkMessage'
import { AdminLayout } from './AdminLayout'
import { BANNER_STATUS, bannerStatus, rangeText } from './bannerDates'
import { BannerForm } from './BannerForm'
import { useLoad } from './useLoad'

export function BannerListPage() {
  const { state, reload } = useLoad<AdminBanner[]>((s) => fetchAdminBanners(s), 'banners')
  // 'new' | banner | null
  const [editing, setEditing] = useState<AdminBanner | 'new' | null>(null)
  // "Yeni > Kampanya görseli" menüsü ?yeni=1 ile gelir (K-78): formu açar, adresi temizler.
  const wantsNew = useRoute().query.get('yeni') === '1'
  const [seenNew, setSeenNew] = useState(false)
  if (wantsNew !== seenNew) {
    setSeenNew(wantsNew)
    if (wantsNew) setEditing('new')
  }
  useEffect(() => {
    if (wantsNew) replace('/yonetim/bannerlar')
  }, [wantsNew])
  const [override, setOverride] = useState<AdminBanner[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [toDelete, setToDelete] = useState<AdminBanner | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const list = override ?? (state.status === 'ready' ? state.data : null)

  /** Güncel listeyi çeker; eski liste yeni gelene kadar ekranda kalır. */
  function refresh() {
    fetchAdminBanners()
      .then(setOverride)
      .catch(() => {
        setOverride(null)
        reload()
      })
  }

  async function move(index: number, delta: -1 | 1) {
    if (!list || busy) return
    const ids = list.map((b) => b.id)
    const [item] = ids.splice(index, 1)
    ids.splice(index + delta, 0, item)
    setBusy(true)
    setError('')
    try {
      const next = await reorderBanners(ids)
      setOverride(next)
      setNotice('Sıra güncellendi.')
    } catch (err) {
      setError(networkMessage(err, 'Sıra güncellenemedi. Lütfen tekrar deneyin.'))
      refresh()
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete() {
    if (!toDelete) return
    setDeleting(true)
    setDeleteError('')
    try {
      await deleteBanner(toDelete.id)
      setToDelete(null)
      setNotice('Kampanya görseli silindi.')
      refresh()
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setToDelete(null)
        refresh()
      } else {
        setDeleteError(networkMessage(err, 'Silinemedi. Lütfen tekrar deneyin.'))
      }
    } finally {
      setDeleting(false)
    }
  }

  if (editing) {
    return (
      <AdminLayout title={editing === 'new' ? 'Kampanya görseli ekle' : 'Kampanya görselini düzenle'}>
        <BannerForm
          banner={editing === 'new' ? null : editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setNotice(editing === 'new' ? 'Kampanya görseli eklendi.' : 'Değişiklikler kaydedildi.')
            setEditing(null)
            refresh()
          }}
        />
      </AdminLayout>
    )
  }

  return (
    <AdminLayout
      title="Kampanya görselleri"
      actions={
        <Button icon="plus" onClick={() => setEditing('new')}>
          Görsel ekle
        </Button>
      }
    >
      <p className="muted">
        Ana sayfadaki kampanya alanında bayilere gösterilir. Önerilen görsel 1200 × 400 piksel (3:1). Sıra,
        ana sayfadaki sıradır.
      </p>
      <div role="status" aria-live="polite">
        {notice && <Alert tone="info">{notice}</Alert>}
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      {state.status === 'loading' && !list && <LoadingCard rows={3} />}
      {state.status === 'error' && !list && (
        <ErrorAlert onRetry={reload}>Kampanya görselleri alınamadı.</ErrorAlert>
      )}
      {list && list.length === 0 && (
        <div className="ui-card">
          <EmptyState
            title="Henüz kampanya görseli yok"
            action={
              <Button icon="plus" onClick={() => setEditing('new')}>
                Görsel ekle
              </Button>
            }
          >
            Eklenene kadar ana sayfada sade duyuru kartı gösterilir.
          </EmptyState>
        </div>
      )}
      {list && list.length > 0 && (
        <ul className="ui-bannerlist">
          {list.map((b, i) => {
            const st = BANNER_STATUS[bannerStatus(b)]
            return (
              <li key={b.id} className="ui-card ui-bannerrow">
                <div className="ui-bannerrow__img">
                  <ProductImage src={b.thumbUrl} alt="" ratio="3 / 1" fit="cover" />
                </div>
                <div className="ui-bannerrow__info">
                  <strong className="ui-bannerrow__title">{b.title}</strong>
                  <div className="ui-badges">
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </div>
                  <span className="muted">{rangeText(b)}</span>
                </div>
                <div className="ui-bannerrow__actions">
                  <div className="ui-bannerrow__order" role="group" aria-label={`${b.title}: sıra`}>
                    <Button
                      variant="secondary"
                      className="ui-iconbutton"
                      disabled={busy || i === 0}
                      onClick={() => move(i, -1)}
                      aria-label={`${b.title}: yukarı taşı`}
                    >
                      ↑
                    </Button>
                    <Button
                      variant="secondary"
                      className="ui-iconbutton"
                      disabled={busy || i === list.length - 1}
                      onClick={() => move(i, 1)}
                      aria-label={`${b.title}: aşağı taşı`}
                    >
                      ↓
                    </Button>
                  </div>
                  <Button variant="secondary" className="ui-button--touch" onClick={() => setEditing(b)}>
                    Düzenle
                  </Button>
                  <Button
                    variant="ghost"
                    icon="trash"
                    className="ui-button--touch"
                    onClick={() => setToDelete(b)}
                    aria-label={`${b.title} görselini sil`}
                  >
                    Sil
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {toDelete && (
        <Modal
          title="Kampanya görselini sil"
          onClose={() => !deleting && setToDelete(null)}
          dismissable={!deleting}
        >
          <p>“{toDelete.title}” silinecek ve ana sayfadan kalkacak. Görsel kütüphanede kalır.</p>
          {deleteError && <Alert tone="danger">{deleteError}</Alert>}
          <div className="ui-modal__actions">
            <Button variant="secondary" disabled={deleting} onClick={() => setToDelete(null)}>
              Vazgeç
            </Button>
            <Button variant="danger" disabled={deleting} onClick={confirmDelete}>
              {deleting ? 'Siliniyor…' : 'Sil'}
            </Button>
          </div>
        </Modal>
      )}
    </AdminLayout>
  )
}
