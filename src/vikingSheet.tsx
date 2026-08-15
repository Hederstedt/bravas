import { createRoot } from 'react-dom/client'
import './index.css'
import './App.css'
import { VikingSheet } from './components/vikingSheet'

// Ingång för provarket, se viking-sheet.html. Bara montering här — själva
// arket bor i components/vikingSheet.tsx, av samma skäl som main.tsx inte
// definierar komponenter.
createRoot(document.getElementById('sheet')!).render(<VikingSheet />)
