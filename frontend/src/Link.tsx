import type { AnchorHTMLAttributes } from 'react'

export function Link({
  to,
  ...rest
}: { to: string } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  return <a href={`#${to}`} {...rest} />
}
