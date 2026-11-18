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
import { upgradeLegacyHash } from './router'

// Eski "/#/..." bağlantıları (e-postalar dahil) aynı temiz yola taşınır (K-82).
upgradeLegacyHash()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
