// Ara toplam (brüt), iskonto, net (KDV hariç), KDV (ayrı satır) ve genel toplam (K-11, K-33).
// Tutarlar sunucudan hazır gelir; burada yalnızca biçimlenir.
import type { MoneySummary } from '../api'
import { formatTRY } from '../ui/format'

export function OrderTotals({ summary }: { summary: MoneySummary }) {
  return (
    <dl className="ui-totals num">
      <div>
        <dt>Ara toplam</dt>
        <dd>{formatTRY(summary.grossTotal)}</dd>
      </div>
      <div className="ui-totals__discount">
        <dt>İskonto</dt>
        <dd>−{formatTRY(summary.discountTotal)}</dd>
      </div>
      <div>
        <dt>Net (KDV hariç)</dt>
        <dd>{formatTRY(summary.netTotal)}</dd>
      </div>
      <div>
        <dt>KDV</dt>
        <dd>{formatTRY(summary.vatTotal)}</dd>
      </div>
      <div className="ui-totals__grand">
        <dt>Genel toplam</dt>
        <dd>{formatTRY(summary.grandTotal)}</dd>
      </div>
    </dl>
  )
}
