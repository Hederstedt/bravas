import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { HomePage } from './home'
import * as api from '../api'
import { installLiveEvents, teardownLiveEvents } from '../test/liveEvents'
import { resetApiOutage } from '../useApiOutage'
import { resetMembersCache } from '../useMembers'
import { resetSessionCache } from '../useSession'
import { resetSiteConfigCache } from '../useSiteConfig'

// Ligger API:et nere är det inte tre problem utan ett, och startsidan visade
// det som tre likadana rutor med var sin "Försök igen" — en per sektion. Nu
// säger en banner det en gång, och sektionerna nöjer sig med att förklara
// varför de är tomma.
beforeEach(() => {
  installLiveEvents()
  resetApiOutage()
  resetMembersCache()
  resetSessionCache()
  resetSiteConfigCache()

  vi.spyOn(api, 'fetchSession').mockResolvedValue(null)
  // Loggboken hämtar också från API:et. Den mockas som lyckad här så att varje
  // test styr själv exakt vilka sektioner som felar.
  vi.spyOn(api, 'fetchFeedResult').mockResolvedValue({ ok: true, data: [] })
  vi.spyOn(api, 'fetchCards').mockResolvedValue([])
  vi.spyOn(api, 'fetchPresence').mockResolvedValue({})
  vi.spyOn(api, 'fetchSiteConfig').mockResolvedValue({ discordInviteUrl: '' })
  vi.spyOn(api, 'fetchValheimStatus').mockResolvedValue({
    online: false,
    players: null,
    maxPlayers: null,
    address: 'valheim.bravas.test',
    signedIn: false,
    serverName: null,
    password: null,
  })
  vi.spyOn(api, 'fetchDiscordStatus').mockResolvedValue({
    available: false,
    online: 0,
    members: [],
  })
})

afterEach(() => {
  teardownLiveEvents()
  vi.restoreAllMocks()
})

function renderHome() {
  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
  )
}

describe('HomePage när hela API:et ligger nere', () => {
  it('säger det en gång i stället för en gång per sektion', async () => {
    vi.spyOn(api, 'fetchMembersResult').mockResolvedValue({ ok: false })
    vi.spyOn(api, 'fetchHighlightsResult').mockResolvedValue({ ok: false })
    vi.spyOn(api, 'fetchQuotesResult').mockResolvedValue({ ok: false })

    renderHome()

    expect(await screen.findByText(/når inte servern just nu/)).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /Försök igen/ })).toHaveLength(1)
    })
  })

  it('låter en ensam trasig sektion behålla sin egen ruta', async () => {
    vi.spyOn(api, 'fetchMembersResult').mockResolvedValue({ ok: true, data: [] })
    vi.spyOn(api, 'fetchQuotesResult').mockResolvedValue({ ok: true, data: [] })
    vi.spyOn(api, 'fetchHighlightsResult').mockResolvedValue({ ok: false })

    renderHome()

    expect(await screen.findByText(/Kunde inte hämta siffrorna/)).toBeInTheDocument()
    expect(screen.queryByText(/når inte servern just nu/)).not.toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Försök igen/ })).toHaveLength(1)
  })

  it('hämtar om alla trasiga sektioner på ett klick', async () => {
    const members = vi.spyOn(api, 'fetchMembersResult').mockResolvedValue({ ok: false })
    const highlights = vi.spyOn(api, 'fetchHighlightsResult').mockResolvedValue({ ok: false })
    const quotes = vi.spyOn(api, 'fetchQuotesResult').mockResolvedValue({ ok: false })

    renderHome()

    const retry = await screen.findByRole('button', { name: /Försök igen/ })
    await waitFor(() => expect(quotes).toHaveBeenCalledTimes(1))

    members.mockClear()
    highlights.mockClear()
    quotes.mockClear()
    retry.click()

    await waitFor(() => {
      expect(members).toHaveBeenCalled()
      expect(highlights).toHaveBeenCalled()
      expect(quotes).toHaveBeenCalled()
    })
  })
})
