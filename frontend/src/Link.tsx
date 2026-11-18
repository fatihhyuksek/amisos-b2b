import type { AnchorHTMLAttributes, MouseEvent } from 'react'
import { navigate } from './router'

/** Uygulama içi bağlantı: temiz yol (K-82); sade tıklamada sayfa yenilenmeden geçer. */
export function Link({
  to,
  onClick,
  target,
  ...rest
}: { to: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  const handle = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e)
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    if (target && target !== '_self') return
    e.preventDefault()
    navigate(to)
  }
  return <a href={to} target={target} onClick={handle} {...rest} />
}
