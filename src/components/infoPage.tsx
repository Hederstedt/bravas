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

          <RatingExplanation />

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
        exakt vilka av de fyra stegen nedan som återstår för dig.
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

      <h2>De fyra stegen, i korthet</h2>
      <ol className="info-steps">
        <li>Steam-inloggning (och godkänd ansökan, se ovan)</li>
        <li>Öppen spelinformation i Steam, annars blir kortet ditt men utan betyg</li>
        <li>Ditt Discord-namn, skrivet in för hand</li>
        <li>World of Tanks, valfritt — höjer bara betyget, sänker det aldrig</li>
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
          <h2>2. Öppen spelinformation i Steam</h2>
          <StepStatus done={hasStats} />
          {!hasStats && (
            <>
              <p className="roster-note">
                Steam nekar oss dina siffror så länge din spelinformation är stängd — kortet är
                ditt, men utan betyg. Slå på "Spelinformation" under Redigera profil →{' '}
                <a href={STEAM_PRIVACY_URL}>Sekretessinställningar i Steam</a>, så hämtar vi
                resten automatiskt.
              </p>
              <button type="button" className="btn btn-ghost" onClick={onRecheck}>
                Kontrollera igen
              </button>
            </>
          )}
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
      </ol>
    </>
  )
}

function RatingExplanation() {
  return (
    <>
      <h2>Hur betyget och titeln räknas fram</h2>
      <p className="roster-note">
        BVS-betyget är en viktad summa av dina CS2-attribut. Länkar du fler spel läggs varje spel
        på som ett rejält tillägg ovanpå, aldrig ett avdrag — ju fler spelkonton du länkar, desto
        högre kan betyget bli. Titeln (t.ex. KAPTEN eller GENERAL) är BVS egen rangordning och
        styrs bara av betyget, oavsett vilket spel poängen kom ifrån.
      </p>
    </>
  )
}
