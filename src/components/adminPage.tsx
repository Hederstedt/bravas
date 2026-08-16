import { useCallback, useEffect, useState } from 'react'
import {
  approveApplication,
  fetchAdminMembers,
  fetchApplications,
  fetchSession,
  rejectApplication,
  removeMember,
  type AdminMember,
  type Application,
} from '../api'
import { MonthlyStandings } from './monthlyStandings'

type State =
  | { status: 'loading' }
  | { status: 'denied' }
  | { status: 'admin'; me: string; applications: Application[]; members: AdminMember[] }

// Godkänna eller avslå ansökningar, och ta bort den som slutat. Behörigheten
// kommer från servern (ADMIN_STEAMIDS), som gatear varje endpoint oberoende av
// vad den här sidan råkar rita — flaggan styr bara vad som visas.
export function AdminPage() {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [error, setError] = useState('')

  const load = useCallback(async (): Promise<State> => {
    const session = await fetchSession()
    // Inga admin-anrop för den som inte är admin: sidan ska inte generera 403:or
    // i konsolen för en vanlig medlem som råkat skriva in adressen.
    if (!session?.isAdmin) return { status: 'denied' }

    const [applications, members] = await Promise.all([fetchApplications(), fetchAdminMembers()])
    return { status: 'admin', me: session.steamid64, applications, members }
  }, [])

  useEffect(() => {
    let cancelled = false
    void load()
      .then((next) => {
        if (!cancelled) setState(next)
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'denied' })
      })
    return () => {
      cancelled = true
    }
  }, [load])

  async function decide(steamid64: string, approve: boolean) {
    setError('')
    const ok = await (approve ? approveApplication(steamid64) : rejectApplication(steamid64))
    if (!ok) {
      setError('Beslutet gick inte igenom. Försök igen.')
      return
    }
    // Avgjord är avgjord — raden lämnar listan i stället för att ligga kvar
    // och se ut att vänta på ett svar till.
    setState((current) =>
      current.status === 'admin'
        ? {
            ...current,
            applications: current.applications.filter((a) => a.steamid64 !== steamid64),
          }
        : current,
    )
  }

  async function remove(steamid64: string) {
    setError('')
    if (!(await removeMember(steamid64))) {
      setError('Medlemmen gick inte att ta bort. Försök igen.')
      return false
    }
    setState((current) =>
      current.status === 'admin'
        ? { ...current, members: current.members.filter((m) => m.steamid64 !== steamid64) }
        : current,
    )
    return true
  }

  return (
    <main>
      <section id="admin">
        <div className="container">
          <div className="section-head">
            <span className="index">ADM</span>
            <h2>Admin</h2>
          </div>

          {state.status === 'denied' && (
            <p className="roster-note">
              Den här sidan är bara för admin. Är det du som ska vara det står ditt steamid i
              serverns ADMIN_STEAMIDS.
            </p>
          )}

          {state.status === 'admin' && (
            <>
              {error && <p className="quote-error">{error}</p>}

              <h3>Ansökningar</h3>
              <p className="roster-note">
                Ett godkännande skriver bara allowlisten — kortet skapas nästa gång de loggar in.
              </p>
              {state.applications.length === 0 ? (
                <p className="roster-note">Inga ansökningar just nu.</p>
              ) : (
                <ul className="admin-list">
                  {state.applications.map((a) => (
                    <li key={a.steamid64} className="admin-application">
                      <p className="account-who">
                        {a.avatarUrl && <img src={a.avatarUrl} alt={a.personaName} />}
                        <span>{a.personaName}</span>
                      </p>
                      <p className="admin-message">{a.message}</p>
                      <div className="admin-actions">
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={() => void decide(a.steamid64, true)}
                        >
                          Godkänn
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => void decide(a.steamid64, false)}
                        >
                          Avslå
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <h3>Medlemmar</h3>
              <ul className="admin-list">
                {state.members.map((m) => (
                  <li key={m.steamid64} className="admin-member">
                    <span>{m.personaName}</span>
                    {/* Servern nekar en admin att ta bort sig själv, så knappen
                        lovar inget den inte kan hålla. */}
                    {m.steamid64 !== state.me && (
                      <RemoveButton onRemove={() => remove(m.steamid64)} />
                    )}
                  </li>
                ))}
              </ul>

              <MonthlyStandings />
            </>
          )}
        </div>
      </section>
    </main>
  )
}

// Borttagning går inte att ångra, så den kräver ett andra klick i stället för
// en dialogruta — samma mönster som raderingen på citatväggen.
function RemoveButton({ onRemove }: { onRemove: () => Promise<boolean> }) {
  const [confirming, setConfirming] = useState(false)

  return (
    <button
      type="button"
      className="btn btn-ghost"
      onClick={() => {
        if (!confirming) {
          setConfirming(true)
          return
        }
        setConfirming(false)
        void onRemove()
      }}
    >
      {confirming ? 'Säkert?' : 'Ta bort'}
    </button>
  )
}
