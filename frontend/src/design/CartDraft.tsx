// Taslak: Sepet ve ön sipariş özeti (K-20, K-21, K-22, K-33, K-36 – K-38). Örnek veriyle çalışır.
import { useState } from 'react'
import { Alert, Badge, Button, Field, QuantityStepper } from '../ui/components'
import { formatTRY } from '../ui/format'
import { cartLines, cartTotals, dealerAddress } from './mockData'

type Delivery = 'carrier' | 'pickup' | 'truck'

const DELIVERY: { value: Delivery; title: string; desc: string }[] = [
  {
    value: 'carrier',
    title: 'Ambar ile',
    desc: 'Adres, ambar firması ve şubesi gerekli',
  },
  {
    value: 'pickup',
    title: 'Bayi kendisi alır',
    desc: 'Teslim detayı görüşmede belirlenir',
  },
  {
    value: 'truck',
    title: 'Tır yüklemesi',
    desc: 'Adres görüşmede belirlenir',
  },
]

export function CartDraft() {
  const [delivery, setDelivery] = useState<Delivery>('carrier')
  const [quantities, setQuantities] = useState(() =>
    Object.fromEntries(cartLines.map((l) => [l.product.id, l.quantity])),
  )
  const hasOutOfStock = cartLines.some((l) => !l.product.inStock)

  return (
    <div className="draft">
      <header className="app-bar">
        <span className="app-bar__brand">AMİSOS B2B</span>
        <h1 className="app-bar__title">Sepet</h1>
      </header>

      <div className="draft__body cart-layout">
        <section aria-labelledby="cart-lines-title" className="cart-lines">
          <h2 id="cart-lines-title" className="visually-hidden">
            Sepetteki ürünler
          </h2>
          {hasOutOfStock && (
            <Alert tone="warning">
              Sepetinizde stokta olmayan ürün var. Bu ürünlerin tedarik süresi görüşmede belirlenecek.
            </Alert>
          )}
          <ul className="cart-list">
            {cartLines.map((l) => (
              <li key={l.product.id} className="cart-line ui-card">
                <div className="cart-line__info">
                  <h3 className="cart-line__name">{l.product.name}</h3>
                  <p className="muted num cart-line__sub">
                    {l.product.barcode} · Koli: {l.product.caseQuantity} adet · Birim{' '}
                    {formatTRY(l.product.price)}
                  </p>
                  {!l.product.inStock && (
                    <Badge tone="warning">Stokta yok · tedarik süresi görüşülecek</Badge>
                  )}
                </div>
                <div className="cart-line__qty">
                  <QuantityStepper
                    label={l.product.name}
                    value={quantities[l.product.id]}
                    step={l.product.caseQuantity}
                    onChange={(v) => setQuantities((s) => ({ ...s, [l.product.id]: v }))}
                  />
                </div>
                <div className="cart-line__total">
                  <span className="num cart-line__amount">{formatTRY(l.netAmount)}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    icon="trash"
                    aria-label={`${l.product.name} sepetten çıkar`}
                  >
                    Çıkar
                  </Button>
                </div>
              </li>
            ))}
          </ul>

          <fieldset className="ui-choice-group delivery">
            <legend>
              <h2>Teslimat</h2>
            </legend>
            {DELIVERY.map((d) => (
              <label key={d.value} className="ui-choice">
                <input
                  type="radio"
                  name="delivery"
                  value={d.value}
                  checked={delivery === d.value}
                  onChange={() => setDelivery(d.value)}
                />
                <span>
                  <span className="ui-choice__title">{d.title}</span>
                  <br />
                  <span className="ui-choice__desc">{d.desc}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {delivery === 'carrier' && (
            <div className="carrier-fields ui-card ui-card__body">
              <Field
                label="Teslimat adresi"
                htmlFor="addr"
                help="Başvurudaki adresiniz getirildi, değiştirebilirsiniz."
              >
                <textarea id="addr" className="ui-textarea" defaultValue={dealerAddress} />
              </Field>
              <div className="two-col">
                <Field label="Ambar firması" htmlFor="carrier">
                  <input id="carrier" className="ui-input" placeholder="Örn. Özkaya Ambarı" />
                </Field>
                <Field label="Şube" htmlFor="branch">
                  <input id="branch" className="ui-input" placeholder="Örn. Kayseri" />
                </Field>
              </div>
            </div>
          )}
        </section>

        <aside className="summary ui-card" aria-labelledby="summary-title">
          <div className="ui-card__body">
            <h2 id="summary-title">Ön sipariş özeti</h2>
            <dl className="totals num">
              <div>
                <dt>Ara toplam</dt>
                <dd>{formatTRY(cartTotals.grossTotal)}</dd>
              </div>
              <div className="totals__discount">
                <dt>İskonto</dt>
                <dd>−{formatTRY(cartTotals.discountTotal)}</dd>
              </div>
              <div>
                <dt>Net (KDV hariç)</dt>
                <dd>{formatTRY(cartTotals.netTotal)}</dd>
              </div>
              <div>
                <dt>KDV</dt>
                <dd>{formatTRY(cartTotals.vatTotal)}</dd>
              </div>
              <div className="totals__grand">
                <dt>Genel toplam</dt>
                <dd>{formatTRY(cartTotals.grandTotal)}</dd>
              </div>
            </dl>
            <Button block>Ön siparişi gönder</Button>
            <p className="muted summary__note">
              Gönderilen ön sipariş değiştirilemez. Ödeme ve teslim detayları ekibimizle görüşülerek
              tamamlanır.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
