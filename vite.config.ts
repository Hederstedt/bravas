/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Dev-servern har inget eget API. Som standard går /api mot den riktiga
  // driften så att rostern och statistiken går att titta på direkt.
  //
  // Inloggning fungerar däremot inte den vägen: Steam skickar tillbaka
  // besökaren till driftens PUBLIC_ORIGIN, så kakan hamnar på bravas.se och
  // localhost förblir utloggat. Kör API:et lokalt och peka hit i stället:
  //
  //   VITE_API_PROXY=http://localhost:3001 npm run dev
  //
  // med PUBLIC_ORIGIN=http://localhost:5173 i server/.env. Se README.
  //
  // Värdet läses både från skalet och från .env.local (gitignorerad), så den
  // som kör lokalt API slipper sätta variabeln vid varje start.
  const apiProxy =
    process.env.VITE_API_PROXY ||
    loadEnv(mode, process.cwd(), '').VITE_API_PROXY ||
    'https://bravas.se'

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: apiProxy,
          changeOrigin: true,
          secure: true,
        },
      },
    },
    // Preview ärver annars `server.proxy`, vilket skulle få e2e-testerna i CI
    // att ringa skarp drift — de ska vara självständiga och stubbar /api själva.
    preview: {
      proxy: {},
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      // Byggskripten är också kod som kan ha fel i sig — se
      // scripts/check-bundle-size.test.mjs.
      include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
      globals: true,
      // forks-poolen kraschar på Windows-sökvägar med mellanslag
      pool: 'threads',
    },
  }
})
