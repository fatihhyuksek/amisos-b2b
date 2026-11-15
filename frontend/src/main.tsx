import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Yazı tipi kendi içinden sunulur (harici CDN yok). Tarayıcı yalnızca gereken alt kümeyi indirir.
import '@fontsource/plus-jakarta-sans/400.css'
import '@fontsource/plus-jakarta-sans/500.css'
import '@fontsource/plus-jakarta-sans/600.css'
import '@fontsource/plus-jakarta-sans/700.css'
import '@fontsource/plus-jakarta-sans/800.css'
import '@fontsource/playfair-display/500.css'
import '@fontsource/playfair-display/600.css'
import './index.css'
import App from './App.tsx'

// E-posta bağlantıları temiz yol olabilir (/sifre-sifirla?...); hash rotasına çevrilir.
if (location.pathname !== '/' && !location.hash) {
  location.replace(`/#${location.pathname}${location.search}`)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
