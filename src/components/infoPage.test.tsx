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
  wowCharacter: null,
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
  wowAttributes: [],
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
        wowCharacter: null,
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

// Kärnan i den här sidan: sajten har två tal som båda kallas poäng, och det
// är förväxlingen mellan dem som gjorde att ingen tyckte det var glasklart.
describe('de två talen', () => {
  it('sätter betyget mot månadspoängen så de går att hålla isär', async () => {
    vi.spyOn(api, 'fetchSession').mockResolvedValue(null)
    renderPage()

    await screen.findByRole('heading', { name: /två olika siffror/i })
    expect(screen.getByText(/betyget är skicklighet, månadspoängen är närvaro/i)).toBeInTheDocument()
  })

  // Taket är svårt att förstå i löpande text men självklart när man ser raden
  // där timmarna kapas.
  it('räknar ut en månad med taket synligt', async () => {
    vi.spyOn(api, 'fetchSession').mockResolvedValue(null)
    renderPage()

    const table = await screen.findByRole('table', { name: /en månad, uträknad/i })
    expect(within(table).getByText(/14 h Valheim/)).toBeInTheDocument()
    expect(within(table).getByText(/taket/)).toBeInTheDocument()
    expect(within(table).getByText('21 p')).toBeInTheDocument()
  })

  it('säger rakt ut att stängd profil ger noll', async () => {
    vi.spyOn(api, 'fetchSession').mockResolvedValue(null)
    renderPage()

    await screen.findByRole('heading', { name: /så räknas månadspoängen/i })
    expect(screen.getByText(/Stängd Steam-profil ger noll/i)).toBeInTheDocument()
  })
})

// Den gamla texten nämnde bara Spelinformation. Utan att hela profilen är
// offentlig samplas man aldrig, och då blir månadspoängen noll hur öppen
// spelinformationen än är — det stod ingenstans.
describe('Steam-sekretessen', () => {
  it('namnger båda inställningarna, inte bara spelinformationen', async () => {
    vi.spyOn(api, 'fetchSession').mockResolvedValue(null)
    renderPage()

    await screen.findByRole('heading', { name: /kom igång/i })
    expect(screen.getByText(/Öppen spelinformation i Steam/)).toBeInTheDocument()
  })

  it('förklarar för en medlem att båda krävs, och vad var och en styr', async () => {
    vi.spyOn(api, 'fetchSession').mockResolvedValue({
      steamid64: MAG_STEAMID64,
      isMember: true,
      isAdmin: false,
    })
    vi.spyOn(api, 'fetchMembers').mockResolvedValue([MAG])
    vi.spyOn(api, 'fetchCards').mockResolvedValue([{ ...MAG_CARD, hasStats: false }])
    renderPage()

    await screen.findByRole('heading', { name: /2\. Öppna din Steam-profil/i })
    // Termerna, i definitionslistan — "Spelinformation" står även i löptexten
    // om kryssrutan, så sökningen måste hålla sig till <dt>:na.
    const terms = screen.getAllByRole('term').map((t) => t.textContent)
    expect(terms.some((t) => t?.includes('Min profil'))).toBe(true)
    expect(terms.some((t) => t?.includes('Spelinformation'))).toBe(true)
    // Den halvöppna fällan: vänner räcker inte, för vi frågar som en främling.
    expect(screen.getByText(/"Vänner endast" räcker inte/)).toBeInTheDocument()
    // Och kryssrutan som tar bort speltiden för sig.
    expect(screen.getByText(/totala speltid dold/i)).toBeInTheDocument()
  })
})

describe('utmärkelserna på Kom igång', () => {
  it('förklaras för en inloggad medlem, med vad som ger var och en', async () => {
    vi.spyOn(api, 'fetchSession').mockResolvedValue({
      steamid64: MAG_STEAMID64,
      isMember: true,
      isAdmin: false,
    })
    vi.spyOn(api, 'fetchMembers').mockResolvedValue([MAG])
    vi.spyOn(api, 'fetchCards').mockResolvedValue([MAG_CARD])
    renderPage()

    await screen.findByRole('heading', { name: /månadens utmärkelser/i })
    expect(screen.getByText('Träskeden')).toBeInTheDocument()
    expect(screen.getByText('Sofflocket')).toBeInTheDocument()
    expect(screen.getByText('Nattvakten')).toBeInTheDocument()
    // Det som gör skämtet snällt, och som måste stå där.
    expect(screen.getByText(/måste ha varit där för att kunna komma sist/i)).toBeInTheDocument()
  })

  // Sajten är publik och indexerad. En utloggad ska inte ens få veta att
  // träskeden finns — servern lämnar inte ut den, och sidan beskriver den inte.
  it('nämns inte med ett ord för en utloggad besökare', async () => {
    vi.spyOn(api, 'fetchSession').mockResolvedValue(null)
    renderPage()

    await screen.findByRole('heading', { name: /två olika siffror/i })
    expect(screen.queryByText('Träskeden')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /månadens utmärkelser/i })).not.toBeInTheDocument()
  })
})

describe('World of Warcraft-steget', () => {
  function stubWowMember(wowCharacter: { realmSlug: string; name: string } | null) {
    vi.spyOn(api, 'fetchSession').mockResolvedValue({
      steamid64: MAG_STEAMID64,
      isMember: true,
      isAdmin: false,
    })
    vi.spyOn(api, 'fetchMembers').mockResolvedValue([{ ...MAG, wowCharacter }])
    vi.spyOn(api, 'fetchCards').mockResolvedValue([MAG_CARD])
  }

  // Samma regel som World of Tanks: en valfri koppling får aldrig se ut som
  // ett krav.
  it('is optional, never "behöver åtgärdas", when not linked', async () => {
    stubWowMember(null)
    renderPage()

    const heading = await screen.findByRole('heading', { name: /world of warcraft/i })
    const step = heading.closest('li')!
    expect(within(step).getByText('Valfritt — inte gjort')).toBeInTheDocument()
    expect(within(step).queryByText(/behöver åtgärdas/i)).not.toBeInTheDocument()
  })

  it('shows the linked character and realm once connected', async () => {
    stubWowMember({ realmSlug: 'stormscale', name: 'Bravasdruid' })
    renderPage()

    const heading = await screen.findByRole('heading', { name: /world of warcraft/i })
    const step = heading.closest('li')!
    expect(within(step).getByText('Bravasdruid')).toBeInTheDocument()
    expect(within(step).getByText(/stormscale/)).toBeInTheDocument()
  })

  // Vi hämtar kontots karaktärer för att bevisa ägarskap, men sparar bara
  // realm och namn. Det ska stå, så ingen behöver undra.
  it('says what we store and what we do not', async () => {
    stubWowMember(null)
    renderPage()

    await screen.findByRole('heading', { name: /world of warcraft/i })
    expect(screen.getByText(/inget lösenord och inget battletag/i)).toBeInTheDocument()
  })
})
