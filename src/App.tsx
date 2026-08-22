import './App.css'
import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import { AccountPage } from './components/accountPage'
import { AdminPage } from './components/adminPage'
import { ApplyPage } from './components/applyPage'
import { HomePage } from './components/home'
import { InfoPage } from './components/infoPage'
import { NotFoundPage } from './components/notFoundPage'
import { PrivacyPage } from './components/privacyPage'
import { RouteFocus } from './components/routeFocus'
import { RouteMeta } from './components/routeMeta'
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
      <a href="#main" className="skip-link">
        Hoppa till huvudinnehåll
      </a>
      <RouteMeta />
      <RouteFocus />
      <Nav />
      <Suspense fallback={<p className="roster-note route-loading">Hämtar managern…</p>}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/kom-igang" element={<InfoPage />} />
          <Route path="/integritet" element={<PrivacyPage />} />
          {/* Utan lazy() — sidan är för lätt för att vara värd en egen chunk. */}
          <Route path="/mitt-konto" element={<AccountPage />} />
          <Route path="/ansok" element={<ApplyPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/manager" element={<ManagerPage />} />
          <Route path="/manager/match/:id" element={<MatchReportPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
      <Footer />
    </>
  )
}

export default App
