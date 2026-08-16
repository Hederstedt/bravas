import { useEffect } from 'react'
import { useLocation, useSearchParams } from 'react-router'
import { Quotes } from './quotes'
import { About, DiscordCta, Games, Hero, Roster, Stats } from './sections'

// Steam-callbacken skickar hem besökaren med ?auth=failed när OpenID-svaret
// inte gick att verifiera. Parametern lästes förut aldrig, så en misslyckad
// inloggning såg ut som att ingenting hände alls.
function AuthNotice() {
  const [params] = useSearchParams()
  if (params.get('auth') !== 'failed') return null

  return (
    <p className="auth-notice" role="status">
      Inloggningen med Steam gick inte igenom. Försök igen — hjälper det inte kan Steam vara nere
      för stunden.
    </p>
  )
}

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
        <AuthNotice />
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
