/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
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
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY ?? 'https://bravas.se',
        changeOrigin: true,
        secure: true,
      },
    },
  },
  // Preview ärver annars `server.proxy`, vilket skulle få e2e-testerna i CI att
  // ringa skarp drift — de ska vara självständiga och stubbar /api själva.
  preview: {
    proxy: {},
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.test.{ts,tsx}'],
    globals: true,
    // forks-poolen kraschar på Windows-sökvägar med mellanslag
    pool: 'threads',
  },
})
