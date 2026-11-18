// K-85: Admin > Analitik > Aramalar (/yonetim/analitik/aramalar). En çok aranan ve sonuçsuz aramalar.
import { fetchAnalyticsSearches } from '../../api'
import { Link } from '../../Link'
import { ErrorAlert } from '../../ui/catalog'
import { EmptyState } from '../../ui/components'
import { formatInt } from '../../ui/format'
import { Icon } from '../../ui/Icon'
import { AdminLayout } from '../AdminLayout'
import { Panel, SkeletonRows } from '../kit'
import { timeAgo } from '../time'
import { useLoad } from '../useLoad'
import { PeriodBar } from './shared'
import { usePeriod } from './lib'

export function SearchesPage() {
  const { from, to, invalid } = usePeriod()
  const { state, reload } = useLoad((s) => fetchAnalyticsSearches({ from, to }, s), `${from}|${to}`)
  const d = state.status === 'ready' ? state.data : null
  const avg = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 })

  return (
    <AdminLayout title="Aramalar">
      <PeriodBar path="/yonetim/analitik/aramalar" from={from} to={to} invalid={invalid} />
      {state.status === 'loading' && <SkeletonRows rows={6} />}
      {state.status === 'error' && <ErrorAlert onRetry={reload}>Arama verisi alınamadı.</ErrorAlert>}
      {d && (
        <div className="an-two">
          <Panel title="En çok aranan" flush>
            {d.top.length === 0 ? (
              <EmptyState icon="search" title="Bu dönemde arama yok">
                Vitrinde arama yapıldıkça burada görünür.
              </EmptyState>
            ) : (
              <div className="ui-table-wrap ui-table-wrap--scroll an-flat">
                <table className="ui-table">
                  <caption className="visually-hidden">En çok aranan sorgular</caption>
                  <thead>
                    <tr>
                      <th scope="col">Arama</th>
                      <th scope="col" className="num">
                        Adet
                      </th>
                      <th scope="col" className="num">
                        Ort. sonuç
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.top.map((r) => (
                      <tr key={r.query}>
                        <td className="wrap">{r.query}</td>
                        <td className="num">{formatInt(r.count)}</td>
                        <td className="num">{avg.format(r.avgResults)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel title="Sonuçsuz aramalar" flush>
            {d.zeroResults.length === 0 ? (
              <EmptyState icon="check" title="Sonuçsuz arama yok">
                Bu dönemde aranan her şey için ürün bulunmuş.
              </EmptyState>
            ) : (
              <>
                <p className="muted an-panelnote an-padded">
                  Müşterilerin aradığı ama bulamadığı ürünler: eksik ürün ya da farklı yazım olabilir.
                </p>
                <div className="ui-table-wrap ui-table-wrap--scroll an-flat">
                  <table className="ui-table">
                    <caption className="visually-hidden">Sonuç vermeyen aramalar</caption>
                    <thead>
                      <tr>
                        <th scope="col">Arama</th>
                        <th scope="col" className="num">
                          Adet
                        </th>
                        <th scope="col" className="adm-hide-sm">
                          Son
                        </th>
                        <th scope="col">Kısayol</th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.zeroResults.map((r) => (
                        <tr key={r.query}>
                          <td className="wrap">{r.query}</td>
                          <td className="num">{formatInt(r.count)}</td>
                          <td className="muted num adm-hide-sm">{timeAgo(r.lastAt)}</td>
                          <td>
                            <span className="an-actions">
                              <Link
                                className="ui-button ui-button--secondary ui-button--sm"
                                to={`/yonetim/urunler?q=${encodeURIComponent(r.query)}`}
                              >
                                <Icon name="search" />
                                Ürünlerde ara
                              </Link>
                              <Link
                                className="ui-button ui-button--secondary ui-button--sm"
                                to="/yonetim/urunler/yeni"
                              >
                                <Icon name="plus" />
                                Ürün ekle
                              </Link>
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Panel>
        </div>
      )}
    </AdminLayout>
  )
}
