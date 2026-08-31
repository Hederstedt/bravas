import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import {
  fetchCards,
  fetchMembers,
  fetchMyApplication,
  fetchSession,
  STEAM_LOGIN_URL,
  type ApplicationStatus,
  type RosterMember,
} from '../api'
import { AWARDS, AWARD_ORDER, CAP_HOURS_PER_GAME } from '../awards'
import { useSiteConfig } from '../useSiteConfig'
import { SteamIcon } from './icons'

// Steams webbklient har ingen offentlig djuplänk till en enskild
// sekretessinställning — den här är den officiella sidan där "Spelinformation"
// bor, under Redigera profil → Sekretessinställningar.
const STEAM_PRIVACY_URL = 'https://steamcommunity.com/my/edit/settings'

type InfoState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'applicant'; applicationStatus: ApplicationStatus | 'none' }
  | { status: 'member'; mine: RosterMember; hasStats: boolean }

// Sidan vet numera vem som läser den: en anonym besökare får en generisk
// vägbeskrivning, en sökande sin ansökningsstatus, och en medlem exakt vilka
// av de fyra stegen som redan är klara. Statisk text dolde tidigare att
// inloggning och godkännande är två separata saker, och länkade Wargaming
// rakt mot en skyddad endpoint som kraschade för alla utom medlemmar.
export function InfoPage() {
  const [state, setState] = useState<InfoState>({ status: 'loading' })

  const load = useCallback(async (): Promise<InfoState> => {
    const session = await fetchSession()
    if (!session) return { status: 'anonymous' }
    if (!session.isMember) {
      const mine = await fetchMyApplication()
      return { status: 'applicant', applicationStatus: mine?.status ?? 'none' }
    }
    const [members, cards] = await Promise.all([fetchMembers(), fetchCards()])
    const mine = members.find((m) => m.mine)
    // isMember=true borde alltid ha en rad i rostern. Om den saknas ändå
    // (ett API-race) är den generiska guiden ett säkrare fel än att krascha.
    if (!mine) return { status: 'anonymous' }
    const card = cards.find((c) => c.id === mine.id)
    return { status: 'member', mine, hasStats: card?.hasStats ?? false }
  }, [])

  useEffect(() => {
    let cancelled = false
    void load().then((next) => {
      if (!cancelled) setState(next)
    })
    return () => {
      cancelled = true
    }
  }, [load])

  const reload = useCallback(() => {
    void load().then(setState)
  }, [load])

  return (
    <main id="main" tabIndex={-1}>
      <section id="kom-igang">
        <div className="container">
          <div className="section-head">
            <span className="index">?</span>
            <h1>Kom igång med Bravas</h1>
          </div>

          {state.status === 'loading' && (
            <p className="roster-note route-loading" role="status">
              Hämtar din status…
            </p>
          )}
          {state.status === 'anonymous' && <AnonymousGuide />}
          {state.status === 'applicant' && (
            <ApplicantStatus applicationStatus={state.applicationStatus} />
          )}
          {state.status === 'member' && (
            <MemberChecklist mine={state.mine} hasStats={state.hasStats} onRecheck={reload} />
          )}

          <TwoNumbers />
          <RatingExplanation />
          <MonthlyPoints />
          {/* Träskeden och skämtutmärkelserna bara för den som är med. En
              utloggad besökare får inte ens veta att de finns — servern
              lämnar inte ut dem, och sidan ska inte beskriva dem heller. */}
          {state.status === 'member' && <AwardsExplanation />}

          <p className="roster-note">
            Fundera på vad som lagras och visas om dig? Läs{' '}
            <Link to="/integritet">Integritet på Bravas</Link>.
          </p>
        </div>
      </section>
    </main>
  )
}

function AnonymousGuide() {
  return (
    <>
      <p className="roster-note">
        Vill du synas på sidan med kort, betyg och kommentarer som resten av gänget? Vägen dit ser
        olika ut beroende på om du redan är med i BVS eller inte.
      </p>

      <h2>Redan medlem i BVS?</h2>
      <p className="roster-note">
        Logga in med Steam så dyker du upp bland Gubbarna direkt. Efter det visar den här sidan
        exakt vilka av stegen nedan som återstår för dig.
      </p>
      <p>
        <a className="btn btn-primary" href={STEAM_LOGIN_URL}>
          <SteamIcon /> Logga in med Steam
        </a>
      </p>

      <h2>Vill du gå med?</h2>
      <p className="roster-note">
        BVS är ett gäng som lirat ihop länge, så vi släpper inte in vem som helst — men fråga
        gärna. <Link to="/ansok">Ansök om att vara med</Link> så loggar du in med Steam och skriver
        några rader om vem du är, sedan är det upp till gubbarna att godkänna.
      </p>

      <h2>Stegen, i korthet</h2>
      <ol className="info-steps">
        <li>Steam-inloggning (och godkänd ansökan, se ovan)</li>
        <li>Öppen spelinformation i Steam, annars blir kortet ditt men utan betyg</li>
        <li>Ditt Discord-namn, skrivet in för hand</li>
        <li>World of Tanks, valfritt — höjer bara betyget, sänker det aldrig</li>
        <li>World of Warcraft, också valfritt och på samma villkor</li>
      </ol>
    </>
  )
}

function ApplicantStatus({ applicationStatus }: { applicationStatus: ApplicationStatus | 'none' }) {
  if (applicationStatus === 'approved') {
    return (
      <>
        <p className="roster-note">
          Din ansökan är godkänd! Kortet skapas först vid inloggningen, så logga in med Steam en
          gång till för att bli synlig bland Gubbarna.
        </p>
        <p>
          <a className="btn btn-primary" href={STEAM_LOGIN_URL}>
            <SteamIcon /> Logga in med Steam
          </a>
        </p>
      </>
    )
  }

  if (applicationStatus === 'rejected') {
    return (
      <p className="roster-note">
        Din förra ansökan blev avslagen. Du får gärna skriva en ny på{' '}
        <Link to="/ansok">Ansök om att vara med</Link> — den ersätter den gamla.
      </p>
    )
  }

  if (applicationStatus === 'pending') {
    return (
      <p className="roster-note">
        Din ansökan ligger inne och väntar på svar. Det är gubbarna själva som läser och avgör —
        håll utkik på <Link to="/ansok">ansökningssidan</Link> för besked.
      </p>
    )
  }

  return (
    <p className="roster-note">
      Du är inloggad men har inte ansökt än. <Link to="/ansok">Ansök om att vara med</Link> för att
      komma igång.
    </p>
  )
}

// Den gamla texten nämnde bara "Spelinformation". Det räcker inte: presence.ts
// kräver att hela profilen är offentlig (communityvisibilitystate === 3) för
// att du ska samplas alls, och utan det får du noll månadspoäng hur öppen din
// spelinformation än är. Två inställningar, två olika konsekvenser — och den
// ena stod ingenstans på sajten.
function SteamPrivacyGuide({ hasStats, onRecheck }: { hasStats: boolean; onRecheck: () => void }) {
  return (
    <>
      <p className="roster-note">
        {hasStats
          ? 'Klart — vi når dina siffror. Två inställningar styr det här, och båda måste stå på Offentlig:'
          : 'Steam släpper inte ifrån sig något om dig än. Två inställningar styr det, och båda måste stå på Offentlig:'}
      </p>

      <dl className="steam-settings">
        <div>
          <dt>
            Min profil <span className="steam-settings-en">(My profile)</span>
          </dt>
          <dd>
            Utan den ser vi dig aldrig alls — ingen prick när du är inne, och{' '}
            <strong>noll månadspoäng</strong>, för det finns inga timmar att räkna.
          </dd>
        </div>
        <div>
          <dt>
            Spelinformation <span className="steam-settings-en">(Game details)</span>
          </dt>
          <dd>
            Utan den blir kortet ditt men <strong>utan betyg</strong> — Steam vägrar lämna ut din
            CS2-statistik.
          </dd>
        </div>
      </dl>

      <p className="roster-note">
        Båda ligger under Redigera profil →{' '}
        <a href={STEAM_PRIVACY_URL}>Sekretessinställningar i Steam</a>.{' '}
        <strong>"Vänner endast" räcker inte</strong> — sajten frågar Steam utan att vara inloggad
        som någon, så vi räknas som en främling oavsett vilka du är vän med.
      </p>
      <p className="roster-note">
        Under Spelinformation finns dessutom kryssrutan{' '}
        <em>"Håll alltid min totala speltid dold"</em>{' '}
        <span className="steam-settings-en">(Always keep my total playtime private)</span>. Den är
        separat, och är den ikryssad försvinner Valheim-timmarna även om allt annat är öppet.
      </p>

      {!hasStats && (
        <button type="button" className="btn btn-ghost" onClick={onRecheck}>
          Kontrollera igen
        </button>
      )}
    </>
  )
}

function StepStatus({ done, optional }: { done: boolean; optional?: boolean }) {
  if (done) return <span className="step-status step-done">Klar</span>
  if (optional) return <span className="step-status step-optional">Valfritt — inte gjort</span>
  return <span className="step-status step-action">Behöver åtgärdas</span>
}

function MemberChecklist({
  mine,
  hasStats,
  onRecheck,
}: {
  mine: RosterMember
  hasStats: boolean
  onRecheck: () => void
}) {
  // Steget pekar vidare till Mitt konto. Är kopplingen inte påslagen finns
  // ingen knapp där, och steget hade varit en instruktion till en tom sida.
  const { wowLinkEnabled } = useSiteConfig()
  const hasDiscord = mine.discordName !== null
  const hasWot = mine.wotNickname !== null

  return (
    <>
      <p className="roster-note">
        Du är med i BVS — här är exakt vad som återstår för ett komplett kort.
      </p>

      <ol className="info-steps info-steps-personal">
        <li>
          <h2>1. Steam-inloggning</h2>
          <StepStatus done />
          <p className="roster-note">Klar — du är inloggad och synlig bland Gubbarna.</p>
        </li>

        <li>
          <h2>2. Öppna din Steam-profil</h2>
          <StepStatus done={hasStats} />
          <SteamPrivacyGuide hasStats={hasStats} onRecheck={onRecheck} />
        </li>

        <li>
          <h2>3. Discord-namn</h2>
          <StepStatus done={hasDiscord} />
          {hasDiscord ? (
            <p className="roster-note">
              Kopplat som <strong>{mine.discordName}</strong>.
            </p>
          ) : (
            <p className="roster-note">
              Steam vet inte vad du heter i Discorden, så den kopplingen görs för hand under{' '}
              <Link to="/mitt-konto">Mitt konto</Link>.
            </p>
          )}
        </li>

        <li>
          <h2>4. World of Tanks</h2>
          <StepStatus done={hasWot} optional />
          {hasWot ? (
            <p className="roster-note">
              Länkad som <strong>{mine.wotNickname}</strong>.
            </p>
          ) : (
            <p className="roster-note">
              Valfritt — kör du strider i World of Tanks räknas det också in, och kan bara höja
              betyget, aldrig sänka det. Länka under <Link to="/mitt-konto">Mitt konto</Link> med
              ditt Wargaming.net-konto — inget nick eller lösenord skickas till oss, bara en
              bekräftelse på vem du är.
            </p>
          )}
        </li>

        {(wowLinkEnabled || mine.wowCharacter) && (
        <li>
          <h2>5. World of Warcraft</h2>
          <StepStatus done={mine.wowCharacter !== null} optional />
          {mine.wowCharacter ? (
            <p className="roster-note">
              Länkad som <strong>{mine.wowCharacter.name}</strong> på {mine.wowCharacter.realmSlug}.
            </p>
          ) : (
            <p className="roster-note">
              Valfritt — kör du WoW räknas det också in, och kan bara höja betyget. Länka under{' '}
              <Link to="/mitt-konto">Mitt konto</Link> med ditt Battle.net-konto. Vi hämtar bara
              vilka karaktärer kontot äger, väljer den du spelat senast, och sparar realm och namn
              — inget lösenord och inget battletag.
            </p>
          )}
        </li>
        )}
      </ol>
    </>
  )
}

// Sajten har två helt olika tal som båda kallas "poäng", och de förklarades
// aldrig bredvid varandra: betyget bodde i Gubbarna-legenden, månadspoängen i
// en ruta på Mitt konto som de flesta aldrig öppnar. Det är nästan säkert
// därför ingen tyckte att det var glasklart hur poängen räknas.
function TwoNumbers() {
  return (
    <>
      <h2>Två olika siffror — och det är där folk går bet</h2>
      <p className="roster-note">
        Det finns två tal på sajten, de mäter olika saker, och de har ingenting med varandra att
        göra. Blandar man ihop dem blir båda obegripliga.
      </p>

      <dl className="number-legend">
        <div>
          <dt>BVS-betyget</dt>
          <dd>
            Hur bra du är, räknat på hela din speltid någonsin. Det är talet på kortet, och det
            är det som ger dig din <strong>titel</strong> (KAPTEN, GENERAL) och din färg på kortet.
            Det rör sig långsamt.
          </dd>
        </div>
        <div>
          <dt>Månadspoängen</dt>
          <dd>
            Hur mycket du hängt med gänget den <strong>här</strong> månaden. Den nollställs varje
            månadsskifte och avgör <strong>utmärkelserna</strong> — Månadens BVS:are och de andra.
            Den säger ingenting om hur bra du är.
          </dd>
        </div>
      </dl>

      <p className="roster-note">
        Kort sagt: betyget är skicklighet, månadspoängen är närvaro. Man kan vara klanens bästa
        skytt och ändå få noll månadspoäng för att man var bortrest.
      </p>
    </>
  )
}

function MonthlyPoints() {
  return (
    <>
      <h2>Så räknas månadspoängen</h2>
      <p className="roster-note">
        Du får en poäng per timme du är inne i något av klanens spel — men{' '}
        <strong>varje spel har ett tak på {CAP_HOURS_PER_GAME} timmar</strong>. Timme elva i samma
        spel ger ingenting. Att synas i Discorden räknas som ett eget "spel", med samma tak.
      </p>
      <p className="roster-note">
        Taket är hela poängen med systemet: <strong>bredd slår grind</strong>. Den som är med på
        allt möjligt slår den som maler ett enda spel, annars hade samma gubbe vunnit varje månad.
      </p>

      <table className="points-example">
        <caption>En månad, uträknad</caption>
        <tbody>
          <tr>
            <th scope="row">8 h Counter-Strike 2</th>
            <td>8 p</td>
          </tr>
          <tr>
            <th scope="row">14 h Valheim</th>
            <td>
              <strong>{CAP_HOURS_PER_GAME} p</strong> — taket, de sista {14 - CAP_HOURS_PER_GAME}{' '}
              timmarna räknas inte
            </td>
          </tr>
          <tr>
            <th scope="row">3 h i Discorden</th>
            <td>3 p</td>
          </tr>
          <tr className="points-sum">
            <th scope="row">Totalt</th>
            <td>{8 + CAP_HOURS_PER_GAME + 3} p</td>
          </tr>
        </tbody>
      </table>

      <p className="roster-note">
        <strong>Stängd Steam-profil ger noll.</strong> Vi ser dig helt enkelt aldrig, så det finns
        inga timmar att räkna — se steget om Steam ovan. Det är inget personligt, ingen mäts den
        vägen.
      </p>
    </>
  )
}

function RatingExplanation() {
  return (
    <>
      <h2>Så räknas betyget och titeln</h2>
      <p className="roster-note">
        BVS-betyget är en viktad summa av dina CS2-attribut — den som väger tyngst (Frag) räknas
        mer än den som väger minst (Tid). Länkar du fler spel läggs varje spel på som ett rejält
        tillägg ovanpå, <strong>aldrig ett avdrag</strong> — ju fler spelkonton du länkar, desto
        högre kan betyget bli, och ett svagt konto kan bara höja det.
      </p>
      <p className="roster-note">
        Titeln (t.ex. KAPTEN eller GENERAL) är BVS egen rangordning och styrs bara av betyget,
        oavsett vilket spel poängen kom ifrån. Tier — ikon, guld, silver, brons — är samma betyg i
        hinkar: 87 och uppåt, 75 och uppåt, 60 och uppåt, annars brons.
      </p>
    </>
  )
}

// Bara för inloggade medlemmar. Sajten är publik och indexerad, och någons
// namn kopplat till en bottenplacering på öppna nätet är en annan sak än
// samma skämt i Discorden — servern lämnar inte ens ut dem utan session.
function AwardsExplanation() {
  return (
    <>
      <h2>Månadens utmärkelser</h2>
      <p className="roster-note">
        När månaden är slut delas fem utmärkelser ut, alla uträknade ur samma data — ingen delar
        ut dem för hand, och ingen kan skylla på favorisering. De syns bara för inloggade
        medlemmar; utomstående ser bara Månadens BVS:are.
      </p>

      <dl className="award-legend">
        <div>
          <dt className="award-legend-winner">Månadens BVS:are</dt>
          <dd>
            Flest månadspoäng. Får diamantkortet, en egen rad högst upp bland Gubbarna och ett
            kort som är större än alla andras.
          </dd>
        </div>
        {AWARD_ORDER.map((key) => (
          <div key={key}>
            <dt className={`award-legend-${key}`}>{AWARDS[key].label}</dt>
            <dd>{AWARDS[key].earnedBy}</dd>
          </div>
        ))}
      </dl>

      <p className="roster-note">
        Utmärkelserna är just utmärkelser, inte titlar — titeln är din rang och den hänger på
        betyget. Och ingen bär två: vinnaren och träskeden står utanför de tre skämtsamma, så de
        hamnar på fem olika gubbar.
      </p>
    </>
  )
}
