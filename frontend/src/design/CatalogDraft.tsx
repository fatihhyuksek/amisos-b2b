// Taslak: Ürün kataloğu (K-40, K-18, K-21, K-10, K-11). Örnek veriyle çalışır.
import { useMemo, useState } from 'react'
import { Button, EmptyState, Price, QuantityStepper, StockBadge } from '../ui/components'
import { Icon } from '../ui/Icon'
import { groups, products } from './mockData'

export function CatalogDraft() {
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('Tümü')
  const [quantities, setQuantities] = useState<Record<string, number>>({})

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr')
    return products.filter(
      (p) =>
        (group === 'Tümü' || p.group === group) &&
        (q === '' || p.name.toLocaleLowerCase('tr').includes(q) || p.barcode.includes(q)),
    )
  }, [query, group])

  return (
    <div className="draft">
      <header className="app-bar">
        <span className="app-bar__brand">Amisos B2B</span>
        <div className="ui-search app-bar__search">
          <Icon name="search" />
          <input
            className="ui-input"
            type="search"
            placeholder="Ürün adı veya barkod"
            aria-label="Ürün ara"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Button variant="secondary" icon="cart" aria-label="Sepet, 3 ürün">
          <span className="app-bar__cart-label">Sepet</span>
          <span className="count-pill">3</span>
        </Button>
      </header>

      <div className="draft__body">
        <div className="ui-chips" role="group" aria-label="Ürün grubu">
          {groups.map((g) => (
            <button
              key={g}
              type="button"
              className="ui-chip"
              aria-pressed={g === group}
              onClick={() => setGroup(g)}
            >
              {g}
            </button>
          ))}
        </div>

        <p className="muted result-count">{visible.length} ürün · Fiyatlar KDV hariçtir</p>

        {visible.length === 0 ? (
          <EmptyState title="Ürün bulunamadı">Aramanızı veya ürün grubunu değiştirin.</EmptyState>
        ) : (
          <ul className="product-grid">
            {visible.map((p) => {
              const qty = quantities[p.id] ?? p.caseQuantity
              return (
                <li key={p.id} className="product-card ui-card">
                  <div className="product-card__media" aria-hidden="true">
                    <Icon name="box" />
                  </div>
                  <div className="product-card__body">
                    <div className="product-card__meta">
                      <StockBadge inStock={p.inStock} />
                      <span className="muted num">Koli: {p.caseQuantity} adet</span>
                    </div>
                    <h3 className="product-card__name">{p.name}</h3>
                    <p className="muted num product-card__barcode">{p.barcode}</p>
                    <Price value={p.price} listValue={p.listPrice} discountPercent={p.discountPercent} />
                  </div>
                  <div className="product-card__actions">
                    <QuantityStepper
                      label={p.name}
                      value={qty}
                      step={p.caseQuantity}
                      onChange={(v) => setQuantities((s) => ({ ...s, [p.id]: v }))}
                    />
                    <Button icon="cart" disabled={qty <= 0 || qty % p.caseQuantity !== 0}>
                      Ekle
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
