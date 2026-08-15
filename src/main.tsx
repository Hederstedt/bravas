import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import '@fontsource/rajdhani/600.css'
import '@fontsource/rajdhani/700.css'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/errorBoundary.tsx'

// Routern bor här och inte i App, så att testerna kan rendera App i en
// MemoryRouter och styra startadressen.
//
// Felgränsen ligger ytterst: ett renderingsfel någonstans i trädet gav
// tidigare vit skärm, eftersom React avmonterar allt när ingen fångar felet.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
