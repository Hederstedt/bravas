import './App.css'
import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { HomePage } from './components/home'
import { Nav, Footer } from './components/sections'

// Managern är ett helt spel — simulering, tabell, marknad, träning och ett
// dussin komponenter. Den som bara tittar på startsidan ska slippa ladda ner
// den, så de två manager-rutterna hämtas först när någon går dit.
const ManagerPage = lazy(() =>
  import('./components/manager/managerPage').then((m) => ({ default: m.ManagerPage })),
)
const MatchReportPage = lazy(() =>
  import('./components/manager/matchReport').then((m) => ({ default: m.MatchReportPage })),
)

// Nav och Footer ligger utanför Routes — de är desamma på alla sidor.
function App() {
  return (
    <>
      <Nav />
      <Suspense fallback={<p className="roster-note route-loading">Hämtar managern…</p>}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/manager" element={<ManagerPage />} />
          <Route path="/manager/match/:id" element={<MatchReportPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <Footer />
    </>
  )
}

export default App
