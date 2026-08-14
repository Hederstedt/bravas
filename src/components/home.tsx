import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { Quotes } from './quotes'
import { About, DiscordCta, Games, Hero, Roster, Stats } from './sections'

// React Router scrollar inte till #ankare vid SPA-navigering — den som klickar
// "Citat" uppe på /manager ska landa vid citatväggen, inte högst upp på sidan.
// location.key som beroende gör att samma länk fungerar två gånger i rad.
function ScrollToHash() {
  const location = useLocation()
  useEffect(() => {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView()
  }, [location.key, location.hash])
  return null
}

export function HomePage() {
  return (
    <>
      <ScrollToHash />
      <Hero />
      <main>
        <Roster />
        <Games />
        <Stats />
        <Quotes />
        <About />
        <DiscordCta />
      </main>
    </>
  )
}
