import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/archivo-black/400.css'
import '@fontsource/space-mono/400.css'
import '@fontsource/space-mono/700.css'
import './index.css'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'

if (navigator.storage?.persist) {
  // chiediamo al browser di non cancellare IndexedDB sotto pressione di spazio
  void navigator.storage.persist().catch(() => {})
}

// Aggiornamenti: il service worker nuovo prende il controllo da solo (autoUpdate), ma la pagina
// aperta resterebbe sulla versione vecchia. Ricarichiamo, mai però durante una camminata:
// lì aspettiamo che si esca dalla schermata di camminata.
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller
  let pending = false
  const reloadIfSafe = () => {
    if (pending && !location.hash.startsWith('#/camminata')) location.reload()
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return // prima installazione: niente da ricaricare
    pending = true
    reloadIfSafe()
  })
  window.addEventListener('hashchange', reloadIfSafe)
  // controlla se c'è una versione nuova ogni volta che l'app torna in primo piano
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => {})
    }
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
