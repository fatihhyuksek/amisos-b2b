// Satır içi SVG ikonlar (harici kütüphane yok). Dekoratif ikonlar ekran okuyucudan gizlenir.
const PATHS = {
  search:
    'M11 4a7 7 0 1 0 4.4 12.4l4.3 4.3 1.4-1.4-4.3-4.3A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z',
  cart: 'M3 4h2.2l2.1 10.2A2 2 0 0 0 9.3 16H18v-2H9.3l-.2-1H18a2 2 0 0 0 1.9-1.4L21.7 6H6.8l-.4-2A2 2 0 0 0 4.5 2H3v2Zm6 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm8 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z',
  plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z',
  minus: 'M5 11h14v2H5v-2Z',
  info: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1 7h2V7h-2v2Zm0 8h2v-6h-2v6Z',
  warning: 'M12 2 1 21h22L12 2Zm-1 7h2v6h-2V9Zm0 8h2v2h-2v-2Z',
  box: 'M12 2 3 6.5v11L12 22l9-4.5v-11L12 2Zm0 2.2 6.3 3.1L12 10.5 5.7 7.3 12 4.2ZM5 9l6 3v7.5l-6-3V9Zm8 10.5V12l6-3v7.5l-6 3Z',
  trash: 'M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Zm4 2v8h2v-8h-2Zm4 0v8h2v-8h-2Z',
  sun: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm-1-6h2v3h-2V1Zm0 19h2v3h-2v-3ZM1 11h3v2H1v-2Zm19 0h3v2h-3v-2ZM4.2 2.8l2.1 2.1-1.4 1.4-2.1-2.1 1.4-1.4Zm13.4 13.4 2.1 2.1-1.4 1.4-2.1-2.1 1.4-1.4ZM2.8 19.8l2.1-2.1 1.4 1.4-2.1 2.1-1.4-1.4ZM16.2 6.3l2.1-2.1 1.4 1.4-2.1 2.1-1.4-1.4Z',
  moon: 'M20 15.3A8.5 8.5 0 0 1 8.7 4a8.5 8.5 0 1 0 11.3 11.3Z',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, label }: { name: IconName; label?: string }) {
  return (
    <svg
      className="ui-icon"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
