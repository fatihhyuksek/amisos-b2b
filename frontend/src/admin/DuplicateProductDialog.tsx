// K-78: Ürün kopyalama. Barkod benzersiz olduğundan yeni barkod (ve isteğe bağlı kod) sorulur;
// asıl doğrulama sunucudadır (POST /api/admin/products/:id/duplicate).
import { useState, type FormEvent } from 'react'
import { ApiError, duplicateProduct } from '../api'
import { navigate } from '../router'
import { Alert, Button, Field, Modal } from '../ui/components'
import { networkMessage } from '../ui/networkMessage'

export function DuplicateProductDialog({
  productId,
  productName,
  onClose,
}: {
  productId: string
  productName: string
  onClose: () => void
}) {
  const [barcode, setBarcode] = useState('')
  const [code, setCode] = useState('')
  const [errors, setErrors] = useState<{ barcode?: string; code?: string }>({})
  const [formError, setFormError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    const b = barcode.trim()
    if (!b) {
      setErrors({ barcode: 'Yeni ürün için barkod zorunlu.' })
      return
    }
    setErrors({})
    setFormError('')
    setBusy(true)
    try {
      const created = await duplicateProduct(productId, {
        barcode: b,
        ...(code.trim() ? { code: code.trim() } : {}),
      })
      onClose()
      navigate(`/yonetim/urunler/${encodeURIComponent(created.id)}`)
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.code === 'DUPLICATE_BARCODE')
        setErrors({ barcode: 'Bu barkod başka bir üründe kullanılıyor.' })
      else if (err instanceof ApiError && err.status === 409 && err.code === 'DUPLICATE_CODE')
        setErrors({ code: 'Bu ürün kodu başka bir üründe kullanılıyor.' })
      else if (err instanceof ApiError && err.status === 400)
        setErrors({ barcode: err.fields?.barcode ?? 'Barkod geçersiz.', code: err.fields?.code })
      else if (err instanceof ApiError && err.status === 404)
        setFormError('Ürün bulunamadı. Sayfayı yenileyin.')
      else setFormError(networkMessage(err, 'Ürün kopyalanamadı. Lütfen tekrar deneyin.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title="Ürünü kopyala" onClose={onClose} dismissable={!busy}>
      <form className="ui-auth__form" onSubmit={submit} noValidate>
        <p>
          <strong>{productName}</strong> kopyalanacak. Yeni ürün pasif ve stokta yok olarak açılır; ad sonuna
          “(kopya)” eklenir.
        </p>
        {formError && <Alert tone="danger">{formError}</Alert>}
        <Field label="Yeni barkod" htmlFor="dup-barcode" error={errors.barcode}>
          <input
            id="dup-barcode"
            className="ui-input"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={barcode}
            aria-invalid={errors.barcode ? true : undefined}
            onChange={(e) => setBarcode(e.target.value)}
          />
        </Field>
        <Field label="Yeni ürün kodu (isteğe bağlı)" htmlFor="dup-code" error={errors.code}>
          <input
            id="dup-code"
            className="ui-input"
            autoComplete="off"
            value={code}
            aria-invalid={errors.code ? true : undefined}
            onChange={(e) => setCode(e.target.value)}
          />
        </Field>
        <div className="ui-modal__actions">
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Vazgeç
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Kopyalanıyor…' : 'Kopyala'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
