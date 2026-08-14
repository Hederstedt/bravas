import './App.css'
import { Navigate, Route, Routes } from 'react-router'
import { HomePage } from './components/home'
import { ManagerPage } from './components/manager/managerPage'
import { Nav, Footer } from './components/sections'

// Nav och Footer ligger utanför Routes — de är desamma på alla sidor.
function App() {
  return (
    <>
      <Nav />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/manager" element={<ManagerPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Footer />
    </>
  )
}

export default App
