// Logo türevlerini üretir: node scripts/brand-assets.mjs <sharp-modül-yolu>
// Kaynak: docs/design/brand/amisos-logo-orijinal.webp (1254×1254, kare siyah zemin).
// Çıktı: public/brand/ altında yuvarlak (köşeleri saydam) webp + png ve favicon'lar.
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const sharpPath = process.argv[2] ?? resolve(here, '../../backend/node_modules/sharp')
const sharp = createRequire(import.meta.url)(sharpPath)
const src = resolve(here, '../../docs/design/brand/amisos-logo-orijinal.webp')
const out = resolve(here, '../public/brand')
mkdirSync(out, { recursive: true })

const mask = (n) =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n}" height="${n}"><circle cx="${n / 2}" cy="${n / 2}" r="${n / 2}"/></svg>`,
  )

async function round(n) {
  return sharp(src)
    .resize(n, n, { kernel: 'lanczos3' })
    .ensureAlpha()
    .composite([{ input: mask(n), blend: 'dest-in' }])
    .png()
    .toBuffer()
}

for (const n of [64, 128, 256]) {
  const buf = await round(n)
  await sharp(buf).webp({ quality: 90, alphaQuality: 100 }).toFile(`${out}/logo-${n}.webp`)
  await sharp(buf).png({ compressionLevel: 9, palette: false }).toFile(`${out}/logo-${n}.png`)
}
await sharp(await round(32))
  .png()
  .toFile(`${out}/favicon-32.png`)
// apple-touch-icon: iOS köşeleri kendisi yuvarlar; kare ve siyah zemin kalır.
await sharp(src).resize(180, 180).png().toFile(`${out}/apple-touch-icon-180.png`)
console.log('ok:', out)
