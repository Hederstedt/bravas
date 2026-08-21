import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import * as api from '../api'
import type { RosterMember } from '../api'
import { AccountPage } from './accountPage'

const MAG: RosterMember = {
  steamid64: '76561198053832683',
  personaName: '[BVS] #Mag',
  avatarUrl: 'https://avatars.example/mag.jpg',
  discordName: 'mag',
  wotNickname: null,
}

// jsdom kan inte navigera på riktigt. Utloggningen byter adress för att
// nollställa all klientstate, så location byts ut medan testet kör.
function stubNavigation() {
  const stub = { href: '' }
  Object.defineProperty(window, 'location', { configurable: true, value: stub })
  return stub
}

const realLocation = window.location

afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation })
  vi.restoreAllMocks()
})

// Sidan hämtar sitt eget "mine": bara en session räcker inte, steamid:t måste
// också finnas som rad i rostern.
function stubApi(overrides: { members?: RosterMember[]; session?: api.Session | null } = {}) {
  vi.spyOn(api, 'fetchMembers').mockResolvedValue(overrides.members ?? [])
  vi.spyOn(api, 'fetchSession').mockResolvedValue(overrides.session ?? null)
}

function renderPage(path = '/mitt-konto') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AccountPage />
    </MemoryRouter>,
  )
}

const signedIn = { members: [MAG], session: { steamid64: MAG.steamid64, isMember: true, isAdmin: false } }

describe('AccountPage', () => {
  it('has a page heading', async () => {
    stubApi(signedIn)
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Mitt konto' })).toBeInTheDocument()
  })

  it('shows the signed-in member which Steam account the page is about', async () => {
    stubApi(signedIn)
    renderPage()

    expect(await screen.findByText(MAG.personaName)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: MAG.personaName })).toHaveAttribute(
      'src',
      MAG.avatarUrl,
    )
  })

  it('gathers the account links on the page', async () => {
    stubApi(signedIn)
    renderPage()

    expect(await screen.findByRole('button', { name: 'Koppla till kortet' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Länka World of Tanks' })).toBeInTheDocument()
  })

  it('offers a way out at the bottom', async () => {
    stubApi(signedIn)
    renderPage()
    expect(await screen.findByRole('button', { name: 'Logga ut' })).toBeInTheDocument()
  })

  // En tom sida för den utloggade vore obegriplig — det ser ut som att sidan
  // är trasig i stället för att man saknar inloggning.
  it('asks an anonymous visitor to sign in instead of showing an empty page', async () => {
    stubApi({ session: null })
    renderPage()

    const link = await screen.findByRole('link', { name: /logga in med steam/i })
    expect(link).toHaveAttribute('href', api.STEAM_LOGIN_URL)
    expect(screen.queryByRole('button', { name: 'Logga ut' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Koppla till kortet' })).not.toBeInTheDocument()
  })

  it('renders nothing but the heading while the session is still loading', () => {
    vi.spyOn(api, 'fetchMembers').mockReturnValue(new Promise(() => {}))
    vi.spyOn(api, 'fetchSession').mockReturnValue(new Promise(() => {}))
    renderPage()

    expect(screen.getByRole('heading', { name: 'Mitt konto' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /logga in med steam/i })).not.toBeInTheDocument()
  })
})

// Callbacken skickar hit den som precis loggat in för första gången, med ?ny=1.
// Servern vet om det är första gången — klienten behöver inget eget minne.
describe('a brand new member', () => {
  it('is welcomed and pointed at the other games', async () => {
    stubApi(signedIn)
    renderPage('/mitt-konto?ny=1')

    expect(await screen.findByText(/Välkommen till BVS/)).toBeInTheDocument()
  })

  it('is not welcomed again on an ordinary visit', async () => {
    stubApi(signedIn)
    renderPage()

    await screen.findByRole('button', { name: 'Logga ut' })
    expect(screen.queryByText(/Välkommen till BVS/)).not.toBeInTheDocument()
  })
})

describe('logging out', () => {
  it('clears the session and reloads the site from scratch', async () => {
    const user = userEvent.setup()
    const nav = stubNavigation()
    stubApi(signedIn)
    const out = vi.spyOn(api, 'logout').mockResolvedValue(true)

    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Logga ut' }))

    expect(out).toHaveBeenCalled()
    // En hel omladdning i stället för att jaga varje komponents cachade
    // session — SteamLogin renderas på två ställen med var sin state.
    await waitFor(() => expect(nav.href).toBe('/'))
  })

  it('says so when the server refused to log out', async () => {
    const user = userEvent.setup()
    const nav = stubNavigation()
    stubApi(signedIn)
    vi.spyOn(api, 'logout').mockResolvedValue(false)

    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Logga ut' }))

    expect(await screen.findByText(/kunde inte logga ut/i)).toBeInTheDocument()
    expect(nav.href).toBe('')
  })
})

// Steam vet vad du heter i Steam, inte i Discorden. Flyttat hit från Gubbarna
// när kopplingarna fick en egen sida.
describe('linking a Discord name', () => {
  it('saves the name and refreshes so the card updates', async () => {
    const user = userEvent.setup()
    stubApi({ members: [{ ...MAG, discordName: null }], session: { steamid64: MAG.steamid64, isMember: true, isAdmin: false } })
    const link = vi.spyOn(api, 'linkDiscord').mockResolvedValue(true)

    renderPage()

    await user.type(await screen.findByLabelText(/Vad heter du i Discorden/), 'magge')
    await user.click(screen.getByRole('button', { name: 'Koppla till kortet' }))

    expect(link).toHaveBeenCalledWith('magge')
    expect(await screen.findByText(/Sparat — namnet syns på ditt kort/)).toBeInTheDocument()
  })

  it('says so when the name could not be saved', async () => {
    const user = userEvent.setup()
    stubApi(signedIn)
    vi.spyOn(api, 'linkDiscord').mockResolvedValue(false)

    renderPage()

    await user.type(await screen.findByLabelText(/Byt Discord-namn/), 'magge')
    await user.click(screen.getByRole('button', { name: 'Koppla till kortet' }))

    expect(await screen.findByText(/kunde inte sparas/)).toBeInTheDocument()
  })

  it('hides the form from anonymous visitors', async () => {
    stubApi({ members: [MAG], session: null })
    renderPage()

    await screen.findByRole('link', { name: /logga in med steam/i })
    expect(screen.queryByRole('button', { name: 'Koppla till kortet' })).not.toBeInTheDocument()
  })
})

// Andra klicket, inte en dialogruta — samma mönster som att ta bort ett
// citat, se quotes.tsx.
describe('unlinking a Discord name', () => {
  it('offers to unlink only when a name is already connected', async () => {
    stubApi(signedIn)
    renderPage()
    expect(await screen.findByRole('button', { name: 'Koppla bort Discord' })).toBeInTheDocument()
  })

  it('does not offer to unlink when nothing is connected', async () => {
    stubApi({ members: [{ ...MAG, discordName: null }], session: signedIn.session })
    renderPage()

    await screen.findByRole('button', { name: 'Koppla till kortet' })
    expect(screen.queryByRole('button', { name: 'Koppla bort Discord' })).not.toBeInTheDocument()
  })

  it('requires a second click to confirm before calling the API', async () => {
    const user = userEvent.setup()
    stubApi(signedIn)
    const unlink = vi.spyOn(api, 'unlinkDiscord').mockResolvedValue(true)
    renderPage()

    const button = await screen.findByRole('button', { name: 'Koppla bort Discord' })
    await user.click(button)
    expect(unlink).not.toHaveBeenCalled()
    expect(button).toHaveTextContent(/säkert/i)

    await user.click(button)
    expect(unlink).toHaveBeenCalled()
  })

  it('refreshes so the form reverts to asking for a name once unlinked', async () => {
    const user = userEvent.setup()
    stubApi(signedIn)
    vi.spyOn(api, 'unlinkDiscord').mockResolvedValue(true)
    vi.spyOn(api, 'fetchMembers')
      .mockResolvedValueOnce([MAG])
      .mockResolvedValueOnce([{ ...MAG, discordName: null }])
    renderPage()

    const button = await screen.findByRole('button', { name: 'Koppla bort Discord' })
    await user.click(button)
    await user.click(button)

    expect(await screen.findByLabelText(/Vad heter du i Discorden/)).toBeInTheDocument()
  })

  it('says so when the server refused to unlink', async () => {
    const user = userEvent.setup()
    stubApi(signedIn)
    vi.spyOn(api, 'unlinkDiscord').mockResolvedValue(false)
    renderPage()

    const button = await screen.findByRole('button', { name: 'Koppla bort Discord' })
    await user.click(button)
    await user.click(button)

    expect(await screen.findByText(/kunde inte koppla bort/i)).toBeInTheDocument()
  })
})

// Ingen egen inloggning eller formulär att fylla i — bara en länk ut till
// Wargaming och tillbaka, så testerna kollar länken snarare än ett anrop.
// Så var och en ser var hen ligger — se monthlyStandings.test.tsx för
// komponentens eget beteende, det här bara verifierar att kontosidan visar den.
describe('the monthly standings', () => {
  it('are shown to a signed-in member', async () => {
    stubApi(signedIn)
    vi.spyOn(api, 'fetchMonthlyStatus').mockResolvedValue({
      month: '2026-08',
      standings: [{ steamid64: MAG.steamid64, personaName: MAG.personaName, score: 5 }],
      lastMonth: null,
    })

    renderPage()

    expect(await screen.findByRole('heading', { name: 'Månadens BVS:are' })).toBeInTheDocument()
  })
})

describe('linking a World of Tanks account', () => {
  it('offers to link an account for a member who has not linked one', async () => {
    stubApi(signedIn)
    renderPage()

    const link = await screen.findByRole('link', { name: 'Länka World of Tanks' })
    expect(link).toHaveAttribute('href', api.WOT_LOGIN_URL)
  })

  it('shows the linked nickname instead of the invitation once linked', async () => {
    stubApi({
      members: [{ ...MAG, wotNickname: 'GubbeIRL' }],
      session: { steamid64: MAG.steamid64, isMember: true, isAdmin: false },
    })
    renderPage()

    expect(await screen.findByText(/Länkad mot World of Tanks som/)).toBeInTheDocument()
    expect(screen.getByText('GubbeIRL')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Länka World of Tanks' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Byt konto' })).toHaveAttribute(
      'href',
      api.WOT_LOGIN_URL,
    )
  })

  it('hides the link from anonymous visitors', async () => {
    stubApi({ members: [MAG], session: null })
    renderPage()

    await screen.findByRole('link', { name: /logga in med steam/i })
    expect(screen.queryByRole('link', { name: /World of Tanks/ })).not.toBeInTheDocument()
  })
})

describe('unlinking a World of Tanks account', () => {
  const linked = {
    members: [{ ...MAG, wotNickname: 'GubbeIRL' }],
    session: { steamid64: MAG.steamid64, isMember: true, isAdmin: false },
  }

  it('offers to unlink only when an account is already connected', async () => {
    stubApi(linked)
    renderPage()
    expect(
      await screen.findByRole('button', { name: 'Koppla bort World of Tanks' }),
    ).toBeInTheDocument()
  })

  it('does not offer to unlink when nothing is connected', async () => {
    stubApi(signedIn)
    renderPage()

    await screen.findByRole('link', { name: 'Länka World of Tanks' })
    expect(
      screen.queryByRole('button', { name: 'Koppla bort World of Tanks' }),
    ).not.toBeInTheDocument()
  })

  it('requires a second click to confirm before calling the API', async () => {
    const user = userEvent.setup()
    stubApi(linked)
    const unlink = vi.spyOn(api, 'unlinkWot').mockResolvedValue(true)
    renderPage()

    const button = await screen.findByRole('button', { name: 'Koppla bort World of Tanks' })
    await user.click(button)
    expect(unlink).not.toHaveBeenCalled()
    expect(button).toHaveTextContent(/säkert/i)

    await user.click(button)
    expect(unlink).toHaveBeenCalled()
  })

  it('refreshes so the invite to link comes back once unlinked', async () => {
    const user = userEvent.setup()
    stubApi(linked)
    vi.spyOn(api, 'unlinkWot').mockResolvedValue(true)
    vi.spyOn(api, 'fetchMembers')
      .mockResolvedValueOnce(linked.members)
      .mockResolvedValueOnce([MAG])
    renderPage()

    const button = await screen.findByRole('button', { name: 'Koppla bort World of Tanks' })
    await user.click(button)
    await user.click(button)

    expect(await screen.findByRole('link', { name: 'Länka World of Tanks' })).toBeInTheDocument()
  })

  it('says so when the server refused to unlink', async () => {
    const user = userEvent.setup()
    stubApi(linked)
    vi.spyOn(api, 'unlinkWot').mockResolvedValue(false)
    renderPage()

    const button = await screen.findByRole('button', { name: 'Koppla bort World of Tanks' })
    await user.click(button)
    await user.click(button)

    expect(await screen.findByText(/kunde inte koppla bort/i)).toBeInTheDocument()
  })
})
