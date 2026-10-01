import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Clarity from '@microsoft/clarity'
import './index.css'
import App from './App.tsx'
import { prefetchLikelyScreens } from './prefetch'

// Clarity's own script is heavy and runs on the main thread, so start it after the page has
// loaded and gone quiet instead of during the first screen. Anything the app sends it in the
// meantime (Clarity.event) is kept by this small queue and replayed once it starts.
const clarityQueue = window as unknown as { clarity?: ((...args: unknown[]) => void) & { q?: unknown[][] } }
if (!clarityQueue.clarity) {
  const queue: unknown[][] = []
  const stub = ((...args: unknown[]) => { queue.push(args) }) as ((...args: unknown[]) => void) & { q?: unknown[][] }
  stub.q = queue
  clarityQueue.clarity = stub
}
const startClarity = () => Clarity.init('wsa5e4uym8')
const scheduleClarity = () => {
  if ('requestIdleCallback' in window) window.requestIdleCallback(startClarity, { timeout: 5000 })
  else setTimeout(startClarity, 3000)
}
if (document.readyState === 'complete') scheduleClarity()
else window.addEventListener('load', scheduleClarity, { once: true })
prefetchLikelyScreens()

// Capture beforeinstallprompt before React mounts so the hook can read it
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  (window as any).__pwaInstallPrompt = e;
  window.dispatchEvent(new Event('pwaInstallReady'));
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
