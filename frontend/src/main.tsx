import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
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
