import './App.css'
import { Nav, Hero, Games, Roster, About, DiscordCta, Footer } from './components/sections'

function App() {
  return (
    <>
      <Nav />
      <Hero />
      <main>
        <Games />
        <Roster />
        <About />
        <DiscordCta />
      </main>
      <Footer />
    </>
  )
}

export default App
