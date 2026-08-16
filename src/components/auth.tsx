import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { fetchMembers, fetchSession, STEAM_LOGIN_URL } from '../api'
import { SteamIcon } from './icons'

type State =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'signed-in'; personaName: string; avatarUrl: string | null }

export function SteamLogin() {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const session = await fetchSession()
        if (!session) {
          if (!cancelled) setState({ status: 'anonymous' })
          return
        }
        const me = (await fetchMembers()).find((m) => m.steamid64 === session.steamid64)
        if (cancelled) return
        setState({
          status: 'signed-in',
          personaName: me?.personaName ?? session.steamid64,
          avatarUrl: me?.avatarUrl ?? null,
        })
      } catch {
        if (!cancelled) setState({ status: 'anonymous' })
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [])

  if (state.status === 'loading') return null

  if (state.status === 'anonymous') {
    return (
      <a className="steam-login" href={STEAM_LOGIN_URL}>
        <SteamIcon /> Logga in med Steam
      </a>
    )
  }

  // Namnet är vägen till kontosidan — det var förut en död text, och då fanns
  // ingenstans att gå för den som ville koppla konton eller logga ut.
  return (
    <Link to="/mitt-konto" className="steam-me">
      {state.avatarUrl && <img src={state.avatarUrl} alt={state.personaName} />}
      <span>{state.personaName}</span>
    </Link>
  )
}
