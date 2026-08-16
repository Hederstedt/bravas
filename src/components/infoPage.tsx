import { Link } from 'react-router'
import { WOT_LOGIN_URL } from '../api'

// Statisk textsida, ingen data att hämta — riktad till den som inte är så
// teknisk och undrar varför kompisen har ett kort och siffror men inte de.
export function InfoPage() {
  return (
    <main>
      <section id="kom-igang">
        <div className="container">
          <div className="section-head">
            <span className="index">?</span>
            <h2>Kom igång</h2>
          </div>

          <p className="roster-note">
            Vill du synas på sidan med kort, betyg och kommentarer som resten av gänget? Här är
            vad som krävs — inget är krångligt, men några saker måste du göra själv.
          </p>

          <h3>1. Logga in med Steam</h3>
          <p className="roster-note">
            Utan en Steam-inloggning dyker du inte upp i Gubbarna-listan alls — det är den enda
            vägen in. Tryck på "Logga in med Steam" uppe i menyn, godkänn, och du är med.
          </p>

          <h3>2. Öppen spelinformation krävs för statistik</h3>
          <p className="roster-note">
            Även inloggad kan Steam neka oss dina siffror om din spelinformation är stängd i
            profilinställningarna — då blir kortet ditt, men utan betyg. Slå på "Spelinformation"
            under Redigera profil → Sekretessinställningar i Steam, så hämtar vi resten
            automatiskt.
          </p>

          <h3>3. Discord-namn</h3>
          <p className="roster-note">
            Steam vet inte vad du heter i Discorden, så den kopplingen görs för hand — skriv in
            ditt Discord-namn under <Link to="/mitt-konto">Mitt konto</Link>, så hamnar det på
            kortet bredvid Steam-profilen.
          </p>

          <h3>4. Länka World of Tanks</h3>
          <p className="roster-note">
            Kör du strider i World of Tanks räknas det också in. Tryck{' '}
            <a href={WOT_LOGIN_URL}>Länka World of Tanks</a> under{' '}
            <Link to="/mitt-konto">Mitt konto</Link> och logga in med ditt Wargaming.net-konto —
            inget nick eller lösenord skickas till oss, bara en bekräftelse på vem du är.
          </p>

          <h3>5. Hur betyget och titeln räknas fram</h3>
          <p className="roster-note">
            BVS-betyget är en viktad summa av dina CS2-attribut. Länkar du fler spel läggs varje
            spel på som ett rejält tillägg ovanpå, aldrig ett avdrag — ju fler spelkonton du
            länkar, desto högre kan betyget bli. Titeln (t.ex. KAPTEN eller GENERAL) är BVS egen
            rangordning och styrs bara av betyget, oavsett vilket spel poängen kom ifrån.
          </p>
        </div>
      </section>
    </main>
  )
}
