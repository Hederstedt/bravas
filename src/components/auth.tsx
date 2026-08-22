import { Link } from 'react-router'
import { STEAM_LOGIN_URL } from '../api'
import { useMembers } from '../useMembers'
import { useSession } from '../useSession'
import { SteamIcon } from './icons'

// Delar session och medlemslista med Nav/Roster/About i stället för att
// hämta sitt eget — SteamLogin monteras dessutom två gånger samtidigt
// (desktopmenyn och mobilöverlägget), så det hade räckt att öppna sidan för
// att dubbla antalet anrop.
export function SteamLogin() {
  const session = useSession()
  const { result } = useMembers()

  // undefined = sessionen inte hämtad än. Väntar hellre tyst än gissar fel
  // och byter sig — samma för medlemslistan när man väl vet att man är
  // inloggad, annars blinkar namnet förbi som ett rått steamid64 en stund.
  if (session === undefined) return null
  if (session === null) {
    return (
      <a className="steam-login" href={STEAM_LOGIN_URL}>
        <SteamIcon /> Logga in med Steam
      </a>
    )
  }
  if (result === null) return null

  const mine = result.ok ? result.data.find((m) => m.steamid64 === session.steamid64) : undefined
  const personaName = mine?.personaName ?? session.steamid64
  const avatarUrl = mine?.avatarUrl ?? null

  // Namnet är vägen till kontosidan — det var förut en död text, och då fanns
  // ingenstans att gå för den som ville koppla konton eller logga ut.
  return (
    <Link to="/mitt-konto" className="steam-me">
      {avatarUrl && (
        <img src={avatarUrl} alt={personaName} width={26} height={26} decoding="async" />
      )}
      <span>{personaName}</span>
    </Link>
  )
}
