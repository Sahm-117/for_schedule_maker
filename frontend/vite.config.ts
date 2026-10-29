import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import nameClickTargets from './vite-plugins/nameClickTargets'

// PostHog's project key is public (it ships to the browser by design) but Vercel flags any VITE_ variable as
// private-looking, so it can be set as plain POSTHOG_KEY / POSTHOG_HOST (or VITE_POSTHOG_KEY / VITE_POSTHOG_HOST).
// Only those two names are passed through, so no other POSTHOG_ value (a personal API key, say) can reach the browser.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
  define: {
    __POSTHOG_KEY__: JSON.stringify(env.POSTHOG_KEY || env.VITE_POSTHOG_KEY || ''),
    __POSTHOG_HOST__: JSON.stringify(env.POSTHOG_HOST || env.VITE_POSTHOG_HOST || ''),
  },
  plugins: [
    nameClickTargets(),
    react(),
    VitePWA({
      registerType: 'prompt',
      srcDir: 'src',
      filename: 'sw.ts',
      strategies: 'injectManifest',
      manifest: {
        name: 'FOF Ops',
        short_name: 'FOF Ops',
        description: 'TCN Ikorodu Foundation of Faith Support Schedule',
        theme_color: '#ffffff',
        background_color: '#f9fafb',
        display: 'standalone',
        id: '/',
        scope: '/',
        start_url: '/',
        categories: ['productivity', 'business'],
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        screenshots: [
          { src: '/screenshots/mobile-1.png', sizes: '390x844', type: 'image/png', form_factor: 'narrow', label: 'Your week at a glance' },
          { src: '/screenshots/mobile-2.png', sizes: '390x844', type: 'image/png', form_factor: 'narrow', label: 'Your group and prayers' },
          { src: '/screenshots/desktop-1.png', sizes: '1280x800', type: 'image/png', form_factor: 'wide', label: 'Support home' },
        ],
      },
      injectManifest: {
        // Saved for offline on the very first visit: the app itself. The PDF/export tools,
        // the class manuals and the guide are big and rarely needed; sw.ts saves those the
        // first time they are opened, so the first visit isn't spent downloading them.
        globIgnores: [
          '**/assets/jspdf*', '**/assets/html2canvas*', '**/assets/pdf-*', '**/assets/index.es-*',
          '**/assets/class*.js', '**/assets/intro-*.js', '**/assets/faithGuide*.js', '**/guides/**',
        ],
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Split large, rarely-changing vendor libs into their own long-cached
        // chunks so app deploys don't bust the vendor cache.
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
  },
  }
})
