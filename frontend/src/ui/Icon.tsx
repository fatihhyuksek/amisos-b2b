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
  eye: 'M12 5C6.5 5 2.7 9.2 1.3 12c1.4 2.8 5.2 7 10.7 7s9.3-4.2 10.7-7C21.3 9.2 17.5 5 12 5Zm0 2c3.8 0 6.8 2.7 8.4 5-1.6 2.3-4.6 5-8.4 5s-6.8-2.7-8.4-5C5.2 9.7 8.2 7 12 7Zm0 1.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z',
  eyeOff:
    'M3.3 2 2 3.3l3 3C3.4 7.5 2.1 9.4 1.3 12c1.4 2.8 5.2 7 10.7 7 1.9 0 3.6-.5 5-1.3l3.7 3.7 1.3-1.3L3.3 2Zm8.7 15c-3.8 0-6.8-2.7-8.4-5 .7-1 1.6-2 2.8-2.8l2.2 2.2a3.5 3.5 0 0 0 4.8 4.8l1.5 1.5c-.9.2-1.9.3-2.9.3Zm0-10c-.5 0-1 .1-1.5.2L8.9 5.6C9.9 5.2 11 5 12 5c5.5 0 9.3 4.2 10.7 7-.5 1-1.2 2-2.1 2.9l-1.4-1.4c.5-.5.9-1 1.2-1.5-1.6-2.3-4.6-5-8.4-5Z',
  moon: 'M20 15.3A8.5 8.5 0 0 1 8.7 4a8.5 8.5 0 1 0 11.3 11.3Z',
  heartFilled: 'M12 20.2s-7.7-4.7-7.7-10.4A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 7.7 2.8c0 5.7-7.7 10.4-7.7 10.4Z',
  starFilled: 'm12 3.8 2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8L12 3.8Z',
} as const

// Çizgi ikonlar (mağaza kabuğu): ince, sade; 24 piksel ızgara.
const STROKES = {
  arrowUp: 'M12 19V5m-6 6 6-6 6 6',
  arrowDown: 'M12 5v14m-6-6 6 6 6-6',
  chart: 'M4 20V4m0 16h16M8 16v-5m4 5V8m4 8v-3',
  download: 'M12 4v11m-4-4 4 4 4-4M5 19h14',
  copy: 'M8 8h11v12H8V8Zm-3 8V4h11',
  menu: 'M4 7h16M4 12h16M4 17h16',
  home: 'M4 11 12 4l8 7v9h-5.5v-6h-5v6H4v-9Z',
  filter: 'M4 6.5h16M7 12h10M10 17.5h4',
  sort: 'M7.5 4v16M4.5 17l3 3 3-3M16.5 20V4M13.5 7l3-3 3 3',
  truck:
    'M3 6.5h11v9.5H3V6.5Zm11 3.5h3.8l3.2 3.2V16H14v-6ZM7 19.5a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Zm10 0a1.75 1.75 0 1 0 0-3.5 1.75 1.75 0 0 0 0 3.5Z',
  close: 'M6 6l12 12M18 6 6 18',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0',
  bag: 'M5.5 8h13l-1 12.5h-11L5.5 8Zm3.5 0V7a3 3 0 0 1 6 0v1',
  bagPlus: 'M5.5 8h13l-1 12.5h-11L5.5 8Zm3.5 0V7a3 3 0 0 1 6 0v1M12 11.5v6M9 14.5h6',
  orders: 'M6.5 3.5h11v17l-2.75-1.5L12 20.5 9.25 19 6.5 20.5v-17ZM9.5 8h5M9.5 11.5h5M9.5 15h3',
  chevronDown: 'm6 9 6 6 6-6',
  chevronRight: 'm9 6 6 6-6 6',
  chevronLeft: 'm15 6-6 6 6 6',
  arrowRight: 'M5 12h14m-6-6 6 6-6 6',
  tag: 'M20.5 13.5 13.5 20.5a2 2 0 0 1-2.8 0L3 12.8V3.5h9.3l8.2 8.2a2 2 0 0 1 0 1.8ZM7.5 7.5h.01',
  boxes: 'M3.5 7.5 12 3.2l8.5 4.3v9L12 20.8l-8.5-4.3v-9Zm0 0L12 12l8.5-4.5M12 12v8.8',
  shield: 'M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3Zm-3 9 2 2 4-4',
  headset:
    'M4 15v-3a8 8 0 0 1 16 0v3M4 14h3v5H5a1 1 0 0 1-1-1v-4Zm16 0h-3v5h2a1 1 0 0 0 1-1v-4Zm-3 5c0 1.1-1.3 2-3 2h-1.5',
  percent:
    'M18.5 5.5l-13 13M7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm9 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  phone:
    'M5.5 4h3.2l1.8 4.6-2.2 1.4a11 11 0 0 0 5.7 5.7l1.4-2.2 4.6 1.8v3.2a2 2 0 0 1-2.1 2A16 16 0 0 1 3.5 6.1a2 2 0 0 1 2-2.1Z',
  chat: 'M4 20l1.3-3.9A8 8 0 1 1 8 19l-4 1Zm5-8h.01M12 12h.01M15 12h.01',
  whatsapp:
    'M12 3.2a8.8 8.8 0 0 0-7.6 13.2L3.2 20.8l4.5-1.2A8.8 8.8 0 1 0 12 3.2ZM9.2 8.2c.4 0 .6 0 .8.5l.7 1.6c.1.3 0 .5-.2.7l-.6.6a6 6 0 0 0 2.9 2.7l.6-.7c.2-.2.4-.3.7-.2l1.6.8c.4.2.4.4.3.8-.2.9-1 1.6-2 1.6-3 0-6-3-6-6 0-1.1.6-2.3 1.2-2.4Z',
  mail: 'M3.5 6h17v12h-17V6Zm0 .5 8.5 6.5 8.5-6.5',
  pin: 'M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  grid: 'M4 4h6.5v6.5H4V4Zm9.5 0H20v6.5h-6.5V4ZM4 13.5h6.5V20H4v-6.5Zm9.5 0H20V20h-6.5v-6.5Z',
  logout: 'M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10',
  heart: 'M12 20.2s-7.7-4.7-7.7-10.4A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 7.7 2.8c0 5.7-7.7 10.4-7.7 10.4Z',
  lock: 'M6.5 11h11v9h-11v-9Zm2.5 0V8a3 3 0 0 1 6 0v3M12 14.5v2.5',
  print: 'M7 9V4h10v5M7 17H4.5v-6.5h15V17M7 14h10v6H7v-6Z',
  file: 'M7 3.5h7l4 4V20.5H7v-17ZM14 3.5v4h4M9.5 12.5h5M9.5 16h5',
  edit: 'M4 20h4L18 10l-4-4L4 16v4ZM12.5 7.5l4 4',
  check: 'm5 12.5 4.5 4.5L19 7.5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13.5V12l3 2',
  star: 'm12 4 2.4 5 5.5.7-4 3.8 1 5.5-4.9-2.7-4.9 2.7 1-5.5-4-3.8 5.5-.7L12 4Z',
  sliders: 'M4 7h9m4 0h3M4 17h3m4 0h9M15 4.5v5M9 14.5v5',
  history: 'M4 12a8 8 0 1 0 2.5-5.8M4 4v4h4M12 8v4.5l3 1.5',
  users:
    'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6.5 9a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18.5 14a6 6 0 0 1 3 6',
  zap: 'M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z',
  store:
    'M4 9.5 5.5 4h13L20 9.5M4 9.5a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0M5.5 12.5V20h13v-7.5M10 20v-4.5h4V20',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  key: 'M14.5 9.5a4 4 0 1 1-1.2-2.9M9 12l-6 6v3h3l1-1v-2h2v-2l1-1',
  clipboard: 'M8 5H6.5v15.5h11V5H16M9 3.5h6v3H9v-3ZM9.5 11h5M9.5 14.5h5',
  barcode: 'M3.5 7V4.5H6M18 4.5h2.5V7M20.5 17v2.5H18M6 19.5H3.5V17M7.5 8v8M10.5 8v8M13.5 8v8M16.5 8v8',
} as const

export type IconName = keyof typeof PATHS | keyof typeof STROKES

export function Icon({ name, label }: { name: IconName; label?: string }) {
  const a11y = {
    'aria-hidden': label ? undefined : true,
    role: label ? 'img' : undefined,
    'aria-label': label,
  }
  if (name in STROKES)
    return (
      <svg
        className="ui-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...a11y}
      >
        <path d={STROKES[name as keyof typeof STROKES]} />
      </svg>
    )
  return (
    <svg className="ui-icon" viewBox="0 0 24 24" fill="currentColor" {...a11y}>
      <path d={PATHS[name as keyof typeof PATHS]} />
    </svg>
  )
}
