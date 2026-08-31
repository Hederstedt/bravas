import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import * as api from '../api'
import type { PlayerCard, RosterMember } from '../api'
import { emitLiveEvent, installLiveEvents, teardownLiveEvents } from '../test/liveEvents'
import { resetMembersCache } from '../useMembers'
import { resetPresenceCache } from '../usePresence'
import { Roster } from './roster'

beforeEach(() => {
  installLiveEvents()
  // Glittret spelas högst en gång per webbläsarsession — utan att nollställa
  // den här skulle det andra testet i samma fil se den föregåendes flagga.
  sessionStorage.clear()
  // Medlemslistan delas nu via en modulnivå-cache (useMembers) — utan att
  // nollställa den läcker ett tests mockade svar in i nästa.
  resetMembersCache()
  // Närvaron delas numera med navbarens live-pill (usePresence) och behöver
  // samma nollställning av samma skäl.
  resetPresenceCache()
})

afterEach(() => {
  teardownLiveEvents()
  vi.restoreAllMocks()
})

const MAG: RosterMember = {
  id: 'test-public-id-mag',
  personaName: '[BVS] #Mag',
  avatarUrl: 'https://avatars.example/mag.jpg',
  discordName: 'mag', wotNickname: null, mine: false,
}

const HIDDEN: RosterMember = {
  id: 'test-public-id-hidden',
  personaName: '[BVS] Hemlig',
  avatarUrl: null,
  discordName: null, wotNickname: null, mine: false,
}

const MAG_CARD: PlayerCard = {
  id: MAG.id,
  personaName: MAG.personaName,
  hasStats: true,
  overall: 84,
  tier: 'guld',
  position: 'SMYGARE',
  attributes: [
    { key: 'SIK', label: 'Sikte', description: 'Andel av avlossade skott som träffar', rating: 80 },
    { key: 'SKA', label: 'Skallar', description: 'Andel av hans kills som är headshots', rating: 71 },
    { key: 'FRA', label: 'Frag', description: 'Kills per spelad runda', rating: 55 },
    { key: 'TÅL', label: 'Tålighet', description: 'Hur ofta han överlever rundan', rating: 92 },
    { key: 'NYT', label: 'Nytta', description: 'Bomber och MVP:er per runda', rating: 64 },
    { key: 'TID', label: 'Tid', description: 'Total speltid i CS2', rating: 88 },
  ],
  wotAttributes: [],
  comments: ['Smyger runt mest. Dyker upp när röken lagt sig.'],
  memberOfMonth: false,
}

// Standardläget för varje test: inget API svarar. Enskilda tester stubbar om
// bara det de bryr sig om.
function stubApi(overrides: {
  members?: RosterMember[]
  cards?: PlayerCard[]
  presence?: api.PresenceMap
  awards?: api.MonthAward[]
} = {}) {
  vi.spyOn(api, 'fetchMembersResult').mockResolvedValue({ ok: true, data: overrides.members ?? [] })
  vi.spyOn(api, 'fetchCards').mockResolvedValue(overrides.cards ?? [])
  vi.spyOn(api, 'fetchPresence').mockResolvedValue(overrides.presence ?? {})
  vi.spyOn(api, 'fetchAwards').mockResolvedValue({
    month: overrides.awards ? '2026-07' : null,
    awards: overrides.awards ?? [],
  })
}

// Hänvisningen till kontosidan är en Link, och en Link utan router kraschar —
// routern bor i main.tsx, så testet får bära med sig en egen.
function renderRoster() {
  return render(
    <MemoryRouter>
      <Roster />
    </MemoryRouter>,
  )
}

function cardFor(name: string) {
  return screen.getByRole('heading', { name }).closest('article')!
}

describe('Roster with live members', () => {
  it('renders a card per member with rating, position and every attribute', async () => {
    stubApi({ members: [MAG], cards: [MAG_CARD] })
    renderRoster()

    const card = await waitFor(() => cardFor(MAG.personaName))
    expect(within(card).getByText('84')).toBeInTheDocument()
    expect(within(card).getByText('SMYGARE')).toBeInTheDocument()
    for (const attr of MAG_CARD.attributes) {
      expect(within(card).getByText(attr.key)).toBeInTheDocument()
    }
  })

  it('prints the generated comment on the card', async () => {
    stubApi({ members: [MAG], cards: [MAG_CARD] })
    renderRoster()

    const card = await waitFor(() => cardFor(MAG.personaName))
    expect(within(card).getByText(MAG_CARD.comments[0])).toBeInTheDocument()
  })

  it('shows the Steam avatar when there is one', async () => {
    stubApi({ members: [MAG], cards: [MAG_CARD] })
    renderRoster()

    const card = await waitFor(() => cardFor(MAG.personaName))
    expect(within(card).getByRole('img', { name: MAG.personaName })).toHaveAttribute(
      'src',
      MAG.avatarUrl,
    )
  })

  it('marks who is in-game right now', async () => {
    stubApi({
      members: [MAG],
      cards: [MAG_CARD],
      presence: { [MAG.id]: { status: 'in-game', game: 'Counter-Strike 2' } },
    })
    renderRoster()

    const card = await waitFor(() => cardFor(MAG.personaName))
    expect(within(card).getByRole('status')).toHaveAccessibleName('Spelar Counter-Strike 2')
    expect(within(card).getByText('Counter-Strike 2')).toBeInTheDocument()
  })

  it('sorts the lineup the way the API returned it', async () => {
    const hiddenCard: PlayerCard = {
      ...MAG_CARD,
      id: HIDDEN.id,
      personaName: HIDDEN.personaName,
      overall: 51,
      tier: 'brons',
    }
    stubApi({ members: [MAG, HIDDEN], cards: [hiddenCard, MAG_CARD] })
    renderRoster()

    await waitFor(() => cardFor(MAG.personaName))
    const names = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(names).toEqual([HIDDEN.personaName, MAG.personaName])
  })
})

describe('Roster degrading gracefully', () => {
  it('still renders a member whose card has no stats', async () => {
    // Låst Steam-profil: kortet ska finnas i raden, inte lämna ett hål.
    const locked: PlayerCard = {
      id: HIDDEN.id,
      personaName: HIDDEN.personaName,
      hasStats: false,
      overall: 0,
      tier: 'okänd',
      position: 'OKÄND',
      attributes: [],
      wotAttributes: [],
      comments: ['Steam-profilen är låst.'],
      memberOfMonth: false,
    }
    stubApi({ members: [HIDDEN], cards: [locked] })
    renderRoster()

    const card = await waitFor(() => cardFor(HIDDEN.personaName))
    expect(within(card).getByText('OKÄND')).toBeInTheDocument()
    expect(within(card).getByText('Steam-profilen är låst.')).toBeInTheDocument()
    expect(within(card).queryByText('SIK')).not.toBeInTheDocument()
  })

  it('renders the card shell when the stats endpoint gives nothing back', async () => {
    // Medlemmarna laddade men statistiken inte — namnet ska synas ändå.
    stubApi({ members: [MAG], cards: [] })
    renderRoster()

    const card = await waitFor(() => cardFor(MAG.personaName))
    expect(within(card).getByText(/statistik/i)).toBeInTheDocument()
  })

  // Ett API-fel gav förut exakt samma tomma array som "ingen har loggat in
  // än" — en driftstörning såg ut som en helt vanlig dag utan medlemmar.
  it('says nobody has logged in yet instead of showing fictional gubbar', async () => {
    stubApi()
    renderRoster()

    await waitFor(() => {
      expect(screen.getByText(/ingen har loggat in än/i)).toBeInTheDocument()
    })
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument()
  })
})

describe('Roster loading and error states', () => {
  it('shows a loading state before the roster has answered', () => {
    stubApi({ members: [MAG], cards: [MAG_CARD] })
    renderRoster()

    expect(screen.getByRole('status')).toHaveTextContent(/hämtar/i)
  })

  it('shows an error with a retry button when the roster endpoint fails', async () => {
    vi.spyOn(api, 'fetchMembersResult').mockResolvedValue({ ok: false })
    vi.spyOn(api, 'fetchCards').mockResolvedValue([])
    vi.spyOn(api, 'fetchPresence').mockResolvedValue({})
    renderRoster()

    expect(await screen.findByRole('alert')).toHaveTextContent(/kunde inte hämta/i)
    expect(screen.getByRole('button', { name: 'Försök igen' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument()
  })

  it('retries the roster fetch when Försök igen is clicked', async () => {
    const user = userEvent.setup()
    const spy = vi
      .spyOn(api, 'fetchMembersResult')
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, data: [MAG] })
    vi.spyOn(api, 'fetchCards').mockResolvedValue([MAG_CARD])
    vi.spyOn(api, 'fetchPresence').mockResolvedValue({})
    renderRoster()

    await screen.findByRole('alert')
    await user.click(screen.getByRole('button', { name: 'Försök igen' }))

    expect(await screen.findByRole('heading', { name: MAG.personaName })).toBeInTheDocument()
    expect(spy).toHaveBeenCalledTimes(2)
  })
})

describe('the lineup row', () => {
  it('is grouped and labelled for screen readers', async () => {
    stubApi({ members: [MAG], cards: [MAG_CARD] })
    renderRoster()

    expect(await screen.findByRole('group', { name: /gubbarna/i })).toBeInTheDocument()
  })
})

describe('comparing an attribute', () => {
  const RIVAL: RosterMember = {
    id: 'test-public-id-rival',
    personaName: '[BVS] Rival',
    avatarUrl: null,
    discordName: null, wotNickname: null, mine: false,
  }

  const RIVAL_CARD: PlayerCard = {
    ...MAG_CARD,
    id: RIVAL.id,
    personaName: RIVAL.personaName,
    overall: 60,
    attributes: MAG_CARD.attributes.map((a) => ({ ...a, rating: a.key === 'SIK' ? 40 : a.rating })),
  }

  it('explains the attribute and places him against the crew on click', async () => {
    const user = userEvent.setup()
    stubApi({ members: [MAG, RIVAL], cards: [MAG_CARD, RIVAL_CARD] })
    renderRoster()

    const card = await waitFor(() => cardFor(MAG.personaName))
    await user.click(within(card).getByRole('button', { name: /SIK/ }))

    expect(within(card).getByText(/Andel av avlossade skott som träffar/)).toBeInTheDocument()
    // SIK: han 80, rivalen 40 → etta av två, bäst 80, snitt 60.
    expect(within(card).getByText(/1 av 2 i klanen/)).toBeInTheDocument()
    expect(within(card).getByText(/snitt 60/)).toBeInTheDocument()
  })

  it('closes again when the same attribute is clicked twice', async () => {
    const user = userEvent.setup()
    stubApi({ members: [MAG], cards: [MAG_CARD] })
    renderRoster()

    const card = await waitFor(() => cardFor(MAG.personaName))
    const toggle = within(card).getByRole('button', { name: /SIK/ })

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(within(card).queryByText(/Andel av avlossade skott/)).not.toBeInTheDocument()
  })

  // Utan kopplingen vet ett tekniskt hjälpmedel inte vilken panel en
  // attributknapp fäller ut.
  it('links the attribute button to its panel with aria-controls', async () => {
    const user = userEvent.setup()
    stubApi({ members: [MAG], cards: [MAG_CARD] })
    renderRoster()

    const card = await waitFor(() => cardFor(MAG.personaName))
    const toggle = within(card).getByRole('button', { name: /SIK/ })
    await user.click(toggle)

    const panelId = toggle.getAttribute('aria-controls')
    expect(panelId).toBeTruthy()
    expect(document.getElementById(panelId!)).toContainElement(
      within(card).getByText(/Andel av avlossade skott som träffar/),
    )
  })
})

describe('the attribute legend', () => {
  it('is collapsed until someone asks for it', async () => {
    stubApi({ members: [MAG], cards: [MAG_CARD] })
    renderRoster()

    await waitFor(() => cardFor(MAG.personaName))
    const toggle = screen.getByRole('button', { name: 'Hur räknas betyget fram?' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveAttribute('aria-controls')
    expect(screen.queryByText(MAG_CARD.attributes[0]!.description)).not.toBeInTheDocument()
  })

  it('links the legend toggle to its panel with aria-controls', async () => {
    const user = userEvent.setup()
    stubApi({ members: [MAG], cards: [MAG_CARD] })
    renderRoster()

    await waitFor(() => cardFor(MAG.personaName))
    const toggle = screen.getByRole('button', { name: 'Hur räknas betyget fram?' })
    await user.click(toggle)

    const panelId = toggle.getAttribute('aria-controls')!
    expect(document.getElementById(panelId)).toContainElement(
      screen.getByText(MAG_CARD.attributes[0]!.description),
    )
  })

  it('spells out what every code means once opened, without needing a hover', async () => {
    const user = userEvent.setup()
    stubApi({ members: [MAG], cards: [MAG_CARD] })
    renderRoster()

    await waitFor(() => cardFor(MAG.personaName))
    await user.click(screen.getByRole('button', { name: 'Hur räknas betyget fram?' }))

    for (const attr of MAG_CARD.attributes) {
      expect(screen.getByText(attr.description)).toBeInTheDocument()
    }
  })

  it('explains that another game only ever adds to the score, never subtracts, and that titles come from BVS itself', async () => {
    const user = userEvent.setup()
    stubApi({ members: [MAG], cards: [MAG_CARD] })
    renderRoster()

    await waitFor(() => cardFor(MAG.personaName))
    await user.click(screen.getByRole('button', { name: 'Hur räknas betyget fram?' }))

    expect(screen.getByText(/aldrig ett avdrag/)).toBeInTheDocument()
    expect(screen.getByText(/ju fler spelkonton/)).toBeInTheDocument()
    expect(screen.getByText(/egen rangordning/)).toBeInTheDocument()
  })

  it('lists World of Tanks attributes separately once someone has linked one', async () => {
    const user = userEvent.setup()
    const withWot: PlayerCard = {
      ...MAG_CARD,
      wotAttributes: [{ key: 'SEG', label: 'Segerprocent', description: 'Andel vunna strider', rating: 70 }],
    }
    stubApi({ members: [MAG], cards: [withWot] })
    renderRoster()

    await waitFor(() => cardFor(MAG.personaName))
    await user.click(screen.getByRole('button', { name: 'Hur räknas betyget fram?' }))

    expect(screen.getByText('Andel vunna strider')).toBeInTheDocument()
  })
})

describe('World of Tanks attributes on the card', () => {
  it('shows a separate World of Tanks row once an account is linked', async () => {
    const withWot: PlayerCard = {
      ...MAG_CARD,
      wotAttributes: [{ key: 'SEG', label: 'Segerprocent', description: 'Andel vunna strider', rating: 70 }],
    }
    stubApi({ members: [MAG], cards: [withWot] })
    renderRoster()

    const card = await waitFor(() => cardFor(MAG.personaName))
    expect(within(card).getByText('World of Tanks')).toBeInTheDocument()
    expect(within(card).getByText('SEG')).toBeInTheDocument()
    expect(within(card).getByText('70')).toBeInTheDocument()
  })

  it('stays quiet about World of Tanks for a member who never linked one', async () => {
    stubApi({ members: [MAG], cards: [MAG_CARD] })
    renderRoster()

    const card = await waitFor(() => cardFor(MAG.personaName))
    expect(within(card).queryByText('World of Tanks')).not.toBeInTheDocument()
  })

  it('labels the score BVS-betyg on the card', async () => {
    stubApi({ members: [MAG], cards: [MAG_CARD] })
    renderRoster()

    const card = await waitFor(() => cardFor(MAG.personaName))
    expect(within(card).getByText('BVS-betyg')).toBeInTheDocument()
  })
})

// Kopplingarna bodde här förut. Nu bor de på kontosidan, men den som letar
// där de låg ska hitta vägen dit i stället för ingenting.
describe('the account links moving out of Gubbarna', () => {
  it('points a signed-in member to the account page', async () => {
    stubApi({ members: [{ ...MAG, mine: true }], cards: [MAG_CARD] })
    renderRoster()

    expect(await screen.findByRole('link', { name: 'Mitt konto' })).toHaveAttribute(
      'href',
      '/mitt-konto',
    )
  })

  it('no longer carries the linking forms itself', async () => {
    stubApi({ members: [{ ...MAG, mine: true }], cards: [MAG_CARD] })
    renderRoster()

    await waitFor(() => cardFor(MAG.personaName))
    expect(screen.queryByRole('button', { name: 'Koppla till kortet' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Länka World of Tanks' })).not.toBeInTheDocument()
  })

  it('says nothing to an anonymous visitor', async () => {
    stubApi({ members: [MAG], cards: [MAG_CARD] })
    renderRoster()

    await waitFor(() => cardFor(MAG.personaName))
    expect(screen.queryByRole('link', { name: 'Mitt konto' })).not.toBeInTheDocument()
  })
})

describe('live presence updates', () => {
  it('moves the dot when the server says someone started a game', async () => {
    stubApi({ members: [MAG], cards: [MAG_CARD] })
    renderRoster()

    const card = await waitFor(() => cardFor(MAG.personaName))
    expect(within(card).queryByRole('status')).not.toBeInTheDocument()

    act(() => {
      emitLiveEvent('presence', {
        presence: { [MAG.id]: { status: 'in-game', game: 'Valheim' } },
      })
    })

    expect(within(card).getByRole('status')).toHaveAccessibleName('Spelar Valheim')
    expect(within(card).getByText('Valheim')).toBeInTheDocument()
  })

  it('leaves the ratings alone so the lineup does not jump', async () => {
    stubApi({ members: [MAG], cards: [MAG_CARD] })
    renderRoster()

    const card = await waitFor(() => cardFor(MAG.personaName))
    act(() => {
      emitLiveEvent('presence', {
        presence: { [MAG.id]: { status: 'online', game: null } },
      })
    })

    expect(within(card).getByText('84')).toBeInTheDocument()
    expect(within(card).getByText('SMYGARE')).toBeInTheDocument()
  })

  it('ignores an event with nothing useful in it', async () => {
    stubApi({
      members: [MAG],
      cards: [MAG_CARD],
      presence: { [MAG.id]: { status: 'online', game: null } },
    })
    renderRoster()

    const card = await waitFor(() => cardFor(MAG.personaName))
    act(() => emitLiveEvent('presence', null))

    expect(within(card).getByRole('status')).toHaveAccessibleName('Online')
  })
})

// Sätts inte i cs2Cards.ts/playerCards.ts — inte betygshärlett — utan
// dekoreras på i statsService.getCards(). Här testas bara att kortet ritar
// vad API:et säger.
describe('the member of the month', () => {
  it('gets a star instead of the ordinary card without one', async () => {
    stubApi({ members: [MAG], cards: [{ ...MAG_CARD, memberOfMonth: true }] })
    renderRoster()

    const card = await waitFor(() => cardFor(MAG.personaName))
    expect(within(card).getByText('Månadens BVS:are')).toBeInTheDocument()
  })

  it('says nothing about it for anyone who is not the reigning winner', async () => {
    stubApi({ members: [MAG], cards: [MAG_CARD] })
    renderRoster()

    const card = await waitFor(() => cardFor(MAG.personaName))
    expect(within(card).queryByText('Månadens BVS:are')).not.toBeInTheDocument()
  })

  // "Titel" är upptaget av position (KAPTEN, GENERAL) — stjärnan får inte
  // kallas det.
  it('never calls the star a title', async () => {
    stubApi({ members: [MAG], cards: [{ ...MAG_CARD, memberOfMonth: true }] })
    renderRoster()

    const card = await waitFor(() => cardFor(MAG.personaName))
    expect(within(card).queryByText(/titel/i)).not.toBeInTheDocument()
  })

  // Kortet frågas om inuti väntan i stället för att hållas fast i en variabel:
  // vinnaren flyttas från rutnätet upp till pyramidens topp, så React river
  // den gamla noden och bygger en ny. En referens tagen före kröningen pekar
  // på en förälderlös nod som aldrig uppdateras.
  it('refetches the cards when the crowning job announces a new month', async () => {
    stubApi({ members: [MAG], cards: [MAG_CARD] })
    renderRoster()

    await waitFor(() => cardFor(MAG.personaName))
    vi.spyOn(api, 'fetchCards').mockResolvedValue([{ ...MAG_CARD, memberOfMonth: true }])
    act(() => emitLiveEvent('bvs-month', { month: '2026-08', id: MAG.id, score: 12 }))

    await waitFor(() =>
      expect(
        within(cardFor(MAG.personaName)).getByText('Månadens BVS:are'),
      ).toBeInTheDocument(),
    )
  })
})

// Träskeden och skämtutmärkelserna, till skillnad från stjärnan, bara för
// inloggade medlemmar. Servern gatear ändå med 401 — det här är att sajten
// inte ens frågar, och inte ritar något, för den som inte ska se det.
describe('månadens utmärkelser', () => {
  const MINE: RosterMember = { ...MAG, mine: true }
  const SPOON: api.MonthAward = {
    award: 'jumbo',
    id: HIDDEN.id,
    personaName: HIDDEN.personaName,
    value: 1.5,
  }

  it('never asks for them as a logged-out visitor', async () => {
    stubApi({ members: [MAG], cards: [MAG_CARD] })
    renderRoster()

    await waitFor(() => cardFor(MAG.personaName))
    expect(api.fetchAwards).not.toHaveBeenCalled()
  })

  it('shows the wooden spoon on the card it belongs to, for a signed-in member', async () => {
    stubApi({ members: [MINE, HIDDEN], cards: [MAG_CARD], awards: [SPOON] })
    renderRoster()

    // Bandet kommer i en senare runda än kortet — utmärkelserna hämtas för
    // sig, efter att rostern vet att besökaren är medlem. Att hålla fast en
    // kortreferens från första waitFor gör testet till en kapplöpning, och
    // den förlorades i CI men inte lokalt.
    await waitFor(() =>
      expect(within(cardFor(HIDDEN.personaName)).getByText('Träskeden')).toBeInTheDocument(),
    )
    expect(within(cardFor(HIDDEN.personaName)).getByText(/1,5 p/)).toBeInTheDocument()
  })


  it('shows the night owl band with the hours that won it', async () => {
    stubApi({
      members: [MINE, HIDDEN],
      cards: [MAG_CARD],
      awards: [{ award: 'nattvakten', id: HIDDEN.id, personaName: HIDDEN.personaName, value: 12.5 }],
    })
    renderRoster()

    await waitFor(() =>
      expect(within(cardFor(HIDDEN.personaName)).getByText('Nattvakten')).toBeInTheDocument(),
    )
    expect(within(cardFor(HIDDEN.personaName)).getByText(/12,5 h efter midnatt/)).toBeInTheDocument()
  })

  it('leaves every other card alone', async () => {
    stubApi({ members: [MINE, HIDDEN], cards: [MAG_CARD], awards: [SPOON] })
    renderRoster()

    const card = await waitFor(() => cardFor(MINE.personaName))
    expect(within(card).queryByText('Träskeden')).not.toBeInTheDocument()
  })

  // Samma regel som stjärnan lyder under: titeln är rangen, det här är en
  // utmärkelse. Ordet får inte smyga sig in via den nya texten.
  it('never calls an award a title', async () => {
    stubApi({ members: [MINE, HIDDEN], cards: [MAG_CARD], awards: [SPOON] })
    renderRoster()

    const card = await waitFor(() => cardFor(HIDDEN.personaName))
    expect(within(card).queryByText(/titel/i)).not.toBeInTheDocument()
  })

  // Servern delar aldrig ut två till samma gubbe, men kortet ska inte kunna
  // bära två band ens om den regeln någon gång luckras upp.
  it('gives the reigning winner the star and nothing else', async () => {
    stubApi({
      members: [MINE],
      cards: [{ ...MAG_CARD, memberOfMonth: true }],
      awards: [{ award: 'sofflocket', id: MINE.id, personaName: MINE.personaName, value: 6 }],
    })
    renderRoster()

    const card = await waitFor(() => cardFor(MINE.personaName))
    expect(within(card).getByText('Månadens BVS:are')).toBeInTheDocument()
    expect(within(card).queryByText('Sofflocket')).not.toBeInTheDocument()
  })
})

describe('the pyramid', () => {
  const MINE: RosterMember = { ...MAG, mine: true }

  it('lifts the reigning winner onto a row of their own above the grid', async () => {
    stubApi({
      members: [HIDDEN, MINE],
      cards: [
        { ...MAG_CARD, id: HIDDEN.id, personaName: HIDDEN.personaName },
        { ...MAG_CARD, memberOfMonth: true },
      ],
    })
    const { container } = renderRoster()

    await waitFor(() => cardFor(MINE.personaName))
    const crowned = container.querySelector('.lineup-crown .player-card')
    expect(crowned).toBeTruthy()
    expect(within(crowned as HTMLElement).getByRole('heading')).toHaveTextContent(MINE.personaName)
    // Och han står inte kvar i rutnätet också.
    expect(container.querySelectorAll('.lineup .player-card')).toHaveLength(1)
  })

  it('keeps everyone in the grid when no month has been decided', async () => {
    stubApi({ members: [MAG], cards: [MAG_CARD] })
    const { container } = renderRoster()

    await waitFor(() => cardFor(MAG.personaName))
    expect(container.querySelector('.lineup-crown')).toBeNull()
    expect(container.querySelectorAll('.lineup .player-card')).toHaveLength(1)
  })

  // Gruppen och dess etikett ligger runt båda raderna — annars hamnar
  // vinnaren utanför den för den som navigerar med skärmläsare.
  it('keeps the winner inside the labelled group', async () => {
    stubApi({ members: [MINE], cards: [{ ...MAG_CARD, memberOfMonth: true }] })
    renderRoster()

    await waitFor(() => cardFor(MINE.personaName))
    const group = screen.getByRole('group', { name: 'Gubbarna i BVS' })
    expect(within(group).getByRole('heading', { name: MINE.personaName })).toBeInTheDocument()
  })
})

describe('the once-per-session glitter', () => {
  it('plays for the reigning winner the first time the roster is seen this session', async () => {
    stubApi({ members: [MAG], cards: [{ ...MAG_CARD, memberOfMonth: true }] })
    renderRoster()

    const card = await waitFor(() => cardFor(MAG.personaName))
    await waitFor(() => expect(card.querySelector('.card-glitter')).not.toBeNull())
  })

  it('does not play again once this session has already seen it', async () => {
    sessionStorage.setItem('bvs-month-glitter-played', '1')
    stubApi({ members: [MAG], cards: [{ ...MAG_CARD, memberOfMonth: true }] })
    renderRoster()

    const card = await waitFor(() => cardFor(MAG.personaName))
    // Stjärnan syns fortfarande — bara animationen är engångs.
    expect(within(card).getByText('Månadens BVS:are')).toBeInTheDocument()
    expect(card.querySelector('.card-glitter')).toBeNull()
  })

  it('stays quiet when nobody has logged in yet — there is no real winner in an empty roster', async () => {
    stubApi()
    renderRoster()

    await waitFor(() => screen.getByText(/ingen har loggat in än/i))
    expect(document.querySelector('.card-glitter')).toBeNull()
  })
})
