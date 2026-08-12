import './App.css'
import { Nav, Hero, Games, Roster, Stats, About, DiscordCta, Footer } from './components/sections'

function App() {
  return (
    <>
      <Nav />
      <Hero />
      <main>
        <Games />
        <Roster />
        <Stats />
        <About />
        <DiscordCta />
      </main>
      <Footer />
    </>
  )
}

export default App
