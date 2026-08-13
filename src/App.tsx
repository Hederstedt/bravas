import './App.css'
import { Quotes } from './components/quotes'
import { Nav, Hero, Games, Roster, Stats, About, DiscordCta, Footer } from './components/sections'

function App() {
  return (
    <>
      <Nav />
      <Hero />
      <main>
        <Roster />
        <Games />
        <Stats />
        <Quotes />
        <About />
        <DiscordCta />
      </main>
      <Footer />
    </>
  )
}

export default App
