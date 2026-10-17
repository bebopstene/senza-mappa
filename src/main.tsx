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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
