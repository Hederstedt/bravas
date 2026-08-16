import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import {
  applyForMembership,
  fetchMyApplication,
  fetchSession,
  MAX_APPLICATION_MESSAGE,
  STEAM_LOGIN_URL,
  type MyApplication,
} from '../api'
import { SteamIcon } from './icons'

type State =
  | { status: 'loading' }
  | { status: 'anonymous' }
  // Redan med — den som klickat fel ska få vägen till sina egna sidor.
  | { status: 'member' }
  | { status: 'applicant'; mine: MyApplication }

// Vägen in för den som inte står i allowlisten. Steam-inloggningen kommer
// först: då vet vi vilket konto ansökan gäller, och ingen kan ansöka i någon
// annans namn. Callbacken skickar hit den som loggat in utan att vara med.
export function ApplyPage() {
  const [state, setState] = useState<State>({ status: 'loading' })

  const load = useCallback(async (): Promise<State> => {
    try {
      const session = await fetchSession()
      if (!session) return { status: 'anonymous' }
      if (session.isMember) return { status: 'member' }
      const mine = await fetchMyApplication()
      return {
        status: 'applicant',
        mine: mine ?? { status: 'none', personaName: session.steamid64, avatarUrl: null },
      }
    } catch {
      return { status: 'anonymous' }
    }
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

  // Efter en skickad ansökan: samma sida, nytt läge — inget behov av att hämta
  // om från servern, den vet redan vad den just sparade.
  const markPending = useCallback(() => {
    setState((current) =>
      current.status === 'applicant'
        ? { status: 'applicant', mine: { ...current.mine, status: 'pending' } }
        : current,
    )
  }, [])

  return (
    <main>
      <section id="ansok">
        <div className="container">
          <div className="section-head">
            <span className="index">IN</span>
            <h2>Ansök om att vara med</h2>
          </div>

          {state.status === 'anonymous' && (
            <>
              <p className="roster-note">
                BVS är ett gäng som lirat ihop länge, så vi släpper inte in vem som helst — men
                fråga gärna. Logga in med Steam först, så vet vi vilket konto ansökan gäller, och
                skriv sedan några rader om vem du är.
              </p>
              <p>
                <a className="btn btn-primary" href={STEAM_LOGIN_URL}>
                  <SteamIcon /> Logga in med Steam
                </a>
              </p>
            </>
          )}

          {state.status === 'member' && (
            <p className="roster-note">
              Du är redan med — ditt kort finns bland Gubbarna. Kontokopplingarna hittar du på{' '}
              <Link to="/mitt-konto">Mitt konto</Link>.
            </p>
          )}

          {state.status === 'applicant' && <Applicant mine={state.mine} onSent={markPending} />}
        </div>
      </section>
    </main>
  )
}

function Applicant({ mine, onSent }: { mine: MyApplication; onSent: () => void }) {
  return (
    <>
      <p className="account-who">
        {mine.avatarUrl && <img src={mine.avatarUrl} alt={mine.personaName} />}
        <span>{mine.personaName}</span>
      </p>

      {mine.status === 'pending' && (
        <p className="roster-note">
          Din ansökan ligger inne och väntar på svar. Blir den godkänd dyker du upp bland Gubbarna
          nästa gång du loggar in.
        </p>
      )}

      {mine.status === 'approved' && (
        <p className="roster-note">
          Du är godkänd — välkommen! Kortet skapas först vid inloggningen, så logga in med Steam
          igen så syns du bland Gubbarna.
        </p>
      )}

      {mine.status !== 'pending' && mine.status !== 'approved' && (
        <>
          {mine.status === 'rejected' && (
            <p className="roster-note">
              Din förra ansökan blev avslagen. Du får gärna skriva en ny — den ersätter den gamla.
            </p>
          )}
          <p className="roster-note">
            Skriv några rader om vem du är och hur du känner gänget. Det är gubbarna själva som
            läser och avgör.
          </p>
          <ApplyForm onSent={onSent} />
        </>
      )}
    </>
  )
}

function ApplyForm({ onSent }: { onSent: () => void }) {
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const value = message.trim()
    if (!value || saving) return

    setSaving(true)
    setError('')
    const ok = await applyForMembership(value)
    setSaving(false)

    if (!ok) {
      setError('Ansökan kunde inte skickas. Försök igen.')
      return
    }
    onSent()
  }

  return (
    <form className="quote-form apply-form" onSubmit={submit}>
      <label>
        Berätta vem du är
        <textarea
          value={message}
          rows={5}
          maxLength={MAX_APPLICATION_MESSAGE}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Jag har lirat CS med Mag sedan hedenhös och vill gärna häng med i Discorden."
        />
      </label>
      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving ? 'Skickar…' : 'Skicka ansökan'}
      </button>
      {error && <p className="quote-error">{error}</p>}
    </form>
  )
}
