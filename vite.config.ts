/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Dev-servern har inget eget API — /api går mot den riktiga driften så att
    // inloggning och roster går att prova lokalt.
    proxy: {
      '/api': {
        target: 'https://bravas.se',
        changeOrigin: true,
        secure: true,
      },
    },
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
