import { useEffect } from 'react'
import { useLocation, useSearchParams } from 'react-router'
import { useApiOutage } from '../useApiOutage'
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

// Gubbarna, Siffrorna och Citaten hämtar från samma API. Ligger det nere
// felar de samtidigt, och startsidan visade då tre likadana rutor med var sin
// "Försök igen" — som om det vore tre olika problem. Beskedet ges en gång här
// i stället, med den enda knappen som hämtar om allt på en gång.
function ApiOutageNotice() {
  const { outage, retry } = useApiOutage()
  if (!outage) return null

  return (
    <div className="api-outage" role="alert">
      <p>
        Sajten <strong>når inte servern just nu</strong>, så flera avsnitt står tomma. Inget har
        försvunnit — det kommer tillbaka så fort servern svarar igen.
      </p>
      <button type="button" className="btn btn-ghost" onClick={retry}>
        Försök igen
      </button>
    </div>
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
      <main id="main" tabIndex={-1}>
        <ApiOutageNotice />
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
