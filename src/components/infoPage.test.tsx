import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import * as api from '../api'
import { InfoPage } from './infoPage'

afterEach(() => {
  vi.restoreAllMocks()
})

function renderPage() {
  return render(
    <MemoryRouter>
      <InfoPage />
    </MemoryRouter>,
  )
}

const MAG_STEAMID64 = '76561198053832683'

const MAG = {
  id: 'test-public-id-mag',
  personaName: '[BVS] #Mag',
  avatarUrl: null,
  discordName: null as string | null,
  wotNickname: null as string | null,
  mine: true,
}

const MAG_CARD = {
  id: MAG.id,
  personaName: MAG.personaName,
  hasStats: true,
  overall: 74,
  tier: 'silver' as const,
  position: 'AWP',
  attributes: [],
  wotAttributes: [],
  comments: [],
  memberOfMonth: false,
}

describe('InfoPage for an anonymous visitor', () => {
  it('offers two paths: already a member, or applying', async () => {
    vi.spyOn(api, 'fetchSession').mockResolvedValue(null)
    renderPage()

    expect(await screen.findByText(/redan medlem/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /logga in med steam/i })).toHaveAttribute(
      'href',
      api.STEAM_LOGIN_URL,
    )
    expect(screen.getByRole('link', { name: /ansök/i })).toHaveAttribute('href', '/ansok')
  })

  // Den skyddade endpointen kraschar för en utloggad besökare — se
  // requireAuth i server/src/middleware — så länken får aldrig visas förrän
  // vi vet att besökaren är en bekräftad medlem.
  it('never links straight to the protected World of Tanks endpoint', async () => {
    vi.spyOn(api, 'fetchSession').mockResolvedValue(null)
    renderPage()

    await screen.findByText(/redan medlem/i)
    expect(screen.queryByRole('link', { name: /world of tanks/i })).not.toBeInTheDocument()
  })

  it('still explains how the rating and title are calculated', async () => {
    vi.spyOn(api, 'fetchSession').mockResolvedValue(null)
    renderPage()

    await screen.findByText(/redan medlem/i)
    expect(screen.getByText(/ju fler spelkonton du länkar/)).toBeInTheDocument()
    expect(screen.getByText(/egen rangordning/)).toBeInTheDocument()
  })
})

describe('InfoPage for an applicant', () => {
  function stubApplicant(status: api.ApplicationStatus | 'none') {
    vi.spyOn(api, 'fetchSession').mockResolvedValue({
      steamid64: MAG_STEAMID64,
      isMember: false,
      isAdmin: false,
    })
    vi.spyOn(api, 'fetchMyApplication').mockResolvedValue({
      status,
      personaName: MAG.personaName,
      avatarUrl: null,
    })
  }

  it('tells a pending applicant their application is waiting', async () => {
    stubApplicant('pending')
    renderPage()
    expect(await screen.findByText(/väntar på svar/i)).toBeInTheDocument()
  })

  it('tells a rejected applicant and offers to apply again', async () => {
    stubApplicant('rejected')
    renderPage()

    expect(await screen.findByText(/avslagen/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /ansök/i })).toHaveAttribute('href', '/ansok')
  })

  // Kortet skapas först vid nästa inloggning — se accountPage.tsx. En
  // godkänd sökande som inte loggat in igen är alltså fortfarande inte
  // "isMember" i sessionen.
  it('tells an approved applicant to log in again to finish', async () => {
    stubApplicant('approved')
    renderPage()

    expect(await screen.findByText(/godkänd/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /logga in med steam/i })).toHaveAttribute(
      'href',
      api.STEAM_LOGIN_URL,
    )
  })
})

describe('InfoPage for a confirmed member', () => {
  function stubMember(overrides: { hasStats?: boolean; discordName?: string | null; wotNickname?: string | null } = {}) {
    vi.spyOn(api, 'fetchSession').mockResolvedValue({
      steamid64: MAG_STEAMID64,
      isMember: true,
      isAdmin: false,
    })
    vi.spyOn(api, 'fetchMembers').mockResolvedValue([
      {
        ...MAG,
        // null är ett meningsfullt, medvetet override här ("inte kopplad") —
        // ?? hade tolkat det som "inte satt" och fallit tillbaka till förvalet.
        discordName: 'discordName' in overrides ? overrides.discordName! : 'mag',
        wotNickname: overrides.wotNickname ?? null,
      },
    ])
    vi.spyOn(api, 'fetchCards').mockResolvedValue([
      { ...MAG_CARD, hasStats: overrides.hasStats ?? true },
    ])
  }

  it('marks every step done when everything is linked', async () => {
    stubMember({ hasStats: true, discordName: 'mag', wotNickname: 'MagTheTank' })
    renderPage()

    const steps = await screen.findAllByRole('listitem')
    expect(steps.length).toBeGreaterThanOrEqual(4)
    for (const step of steps) {
      expect(within(step).queryByText(/behöver åtgärdas/i)).not.toBeInTheDocument()
    }
  })

  it('flags closed game info as needing action, with a link to the Steam setting and a recheck button', async () => {
    stubMember({ hasStats: false })
    renderPage()

    expect(await screen.findByText(/behöver åtgärdas/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /steam/i })).toHaveAttribute(
      'href',
      expect.stringContaining('steamcommunity.com'),
    )
    expect(screen.getByRole('button', { name: /kontrollera igen/i })).toBeInTheDocument()
  })

  it('rechecks game info when the button is clicked', async () => {
    const user = userEvent.setup()
    stubMember({ hasStats: false })
    renderPage()

    await screen.findByText(/behöver åtgärdas/i)
    vi.spyOn(api, 'fetchCards').mockResolvedValue([{ ...MAG_CARD, hasStats: true }])
    await user.click(screen.getByRole('button', { name: /kontrollera igen/i }))

    await waitFor(() => {
      expect(screen.queryByText(/behöver åtgärdas/i)).not.toBeInTheDocument()
    })
  })

  it('flags a missing Discord name as needing action, linking to Mitt konto', async () => {
    stubMember({ discordName: null })
    renderPage()

    const heading = await screen.findByRole('heading', { name: /discord/i })
    const step = heading.closest('li')!
    expect(within(step).getByText(/behöver åtgärdas/i)).toBeInTheDocument()
    expect(within(step).getByRole('link', { name: 'Mitt konto' })).toHaveAttribute(
      'href',
      '/mitt-konto',
    )
  })

  // Den valfria kopplingen får aldrig se ut som ett krav — se
  // docs/improvmentplan.md Etapp 4.
  it('marks World of Tanks optional, never "behöver åtgärdas", when not linked', async () => {
    stubMember({ wotNickname: null })
    renderPage()

    const heading = await screen.findByRole('heading', { name: /world of tanks/i })
    const step = heading.closest('li')!
    expect(within(step).getByText('Valfritt — inte gjort')).toBeInTheDocument()
    expect(within(step).queryByText(/behöver åtgärdas/i)).not.toBeInTheDocument()
  })

  it('shows the linked World of Tanks nickname when already connected', async () => {
    stubMember({ wotNickname: 'MagTheTank' })
    renderPage()

    expect(await screen.findByText(/MagTheTank/)).toBeInTheDocument()
  })

  it('keeps the rating explanation out of the numbered steps', async () => {
    stubMember()
    renderPage()

    await screen.findAllByRole('listitem')
    const explanation = screen.getByText(/ju fler spelkonton du länkar/).closest('li')
    expect(explanation).toBeNull()
  })
})
