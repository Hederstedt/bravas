import { useEffect, useState } from 'react'
import { fetchSiteConfig, type SiteConfig } from './api'

const EMPTY: SiteConfig = { discordInviteUrl: '', wowLinkEnabled: false }

// Configen ändras inte under ett besök, och flera komponenter behöver den —
// dela på ett anrop i stället för ett per komponent.
let pending: Promise<SiteConfig> | null = null

function loadOnce(): Promise<SiteConfig> {
  pending ??= fetchSiteConfig()
  return pending
}

// Invite-länken bor i backendens .env, inte i bundlen — den kan bytas utan
// omdeploy, och en trasig "#"-länk visas aldrig för besökaren.
export function useSiteConfig(): SiteConfig {
  const [config, setConfig] = useState<SiteConfig>(EMPTY)

  useEffect(() => {
    let cancelled = false
    void loadOnce().then((c) => {
      if (!cancelled) setConfig(c)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return config
}

// Testerna byter ut fetchSiteConfig per fall, så cachen måste kunna nollställas.
export function resetSiteConfigCache(): void {
  pending = null
}
