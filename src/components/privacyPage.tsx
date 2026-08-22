import { Link } from 'react-router'

// Statisk textsida, ingen data att hämta. Beskriver vad som faktiskt lagras
// och visas — inte vad som borde göras, se docs/improvmentplan.md Etapp 5.
// Kopplingsbortagning finns numera på Mitt konto (koppla bort Discord/WoT
// själv); att lämna BVS helt går bara via en admin i dag, så sidan lovar inte
// ett självbetjäningsflöde som inte existerar.
export function PrivacyPage() {
  return (
    <main id="main" tabIndex={-1}>
      <section id="integritet">
        <div className="container">
          <div className="section-head">
            <span className="index">i</span>
            <h1>Integritet på Bravas</h1>
          </div>

          <p className="roster-note">
            Kort och konkret: vad vi hämtar, vad som visas, och hur du kommer i kontakt om något
            ska ändras eller bort.
          </p>

          <h2>Vad vi hämtar</h2>
          <p className="roster-note">
            Loggar du in med Steam hämtar vi ditt Steam-namn, din avatar och — om din
            spelinformation är öppen — dina CS2-siffror. Länkar du World of Tanks via Wargaming
            hämtar vi ditt Wargaming-nick och dina stridssiffror på samma sätt. Inget nick eller
            lösenord skickas till oss vid någon av kopplingarna, bara en bekräftelse från Steam
            respektive Wargaming på vem du är.
          </p>
          <p className="roster-note">
            Ditt Discord-namn känner varken Steam eller Wargaming till, så det skriver du in för
            hand under <Link to="/mitt-konto">Mitt konto</Link> — vi läser aldrig av Discorden
            själva för att koppla dig till en rad.
          </p>

          <h2>Vad som visas offentligt</h2>
          <p className="roster-note">
            Namn, avatar, CS2/WoT-betyg och det Discord-namn du själv skrivit in är publikt synligt
            på sajten för alla besökare, inloggade eller inte — det är hela poängen med Gubbarna.
            Ditt Steam-id (steamid64) och Wargaming-konto-id skickas aldrig ut, varken i sidans
            innehåll eller i API-svaren tekniska verktyg kan läsa — bara ett slumpat id som inte
            går att koppla till ditt riktiga Steam-konto.
          </p>

          <h2>Vad vi sparar och hur länge</h2>
          <p className="roster-note">
            Inloggningen är en signerad kaka som håller i 30 dagar och förnyas medan du är aktiv —
            ingen databasrad över kakan, bara din identitet. CS2- och WoT-statistiken cachas i 30
            minuter åt gången innan den hämtas om. Aktivitetsprover (vem som spelar vad, när) och
            Manager-historik (säsonger, matcher, tabeller) sparas löpande för att räkna fram
            Månadens BVS:are och hålla ligan spelbar över tid.
          </p>

          <h2>Tredje part</h2>
          <p className="roster-note">
            Steam-avatarer laddas direkt från Steams egna servrar när du besöker sidan — din
            webbläsare pratar då med Steam, inte bara med oss. Widgeten "Häng med i Discorden"
            hämtas av vår server, aldrig av din webbläsare, så Discord vet inte att du tittar.
          </p>

          <h2>Ändra eller ta bort</h2>
          <p className="roster-note">
            Discord-namn och World of Tanks-koppling tar du själv bort när du vill under{' '}
            <Link to="/mitt-konto">Mitt konto</Link> — ingen adminhjälp behövs. Vill du lämna BVS
            helt, hör av dig i Discorden så tar en admin bort din rad. Citat du skickat in och din
            plats i Manager-historiken finns kvar — annars försvinner andras minnen och gamla
            tabeller bara för att en enda person slutar — men kopplas loss från ditt namn.
          </p>
        </div>
      </section>
    </main>
  )
}
