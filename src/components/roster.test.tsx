import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import * as api from '../api'
import type { PlayerCard, RosterMember } from '../api'
import { members } from '../data/clan'
import { emitLiveEvent, installLiveEvents, teardownLiveEvents } from '../test/liveEvents'
import { Roster } from './roster'

beforeEach(() => {
  installLiveEvents()
})

afterEach(() => {
  teardownLiveEvents()
  vi.restoreAllMocks()
})

const MAG: RosterMember = {
  steamid64: '76561198053832683',
  personaName: '[BVS] #Mag',
  avatarUrl: 'https://avatars.example/mag.jpg',
  discordName: 'mag', wotNickname: null,
}

const HIDDEN: RosterMember = {
  steamid64: '76561198000000002',
  personaName: '[BVS] Hemlig',
  avatarUrl: null,
  discordName: null, wotNickname: null,
}

const MAG_CARD: PlayerCard = {
  steamid64: MAG.steamid64,
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
}

// Standardläget för varje test: inget API svarar. Enskilda tester stubbar om
// bara det de bryr sig om.
function stubApi(overrides: {
  members?: RosterMember[]
  cards?: PlayerCard[]
  presence?: api.PresenceMap
  session?: api.Session | null
} = {}) {
  vi.spyOn(api, 'fetchMembers').mockResolvedValue(overrides.members ?? [])
  vi.spyOn(api, 'fetchCards').mockResolvedValue(overrides.cards ?? [])
  vi.spyOn(api, 'fetchPresence').mockResolvedValue(overrides.presence ?? {})
  vi.spyOn(api, 'fetchSession').mockResolvedValue(overrides.session ?? null)
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
      presence: { [MAG.steamid64]: { status: 'in-game', game: 'Counter-Strike 2' } },
    })
    renderRoster()

    const card = await waitFor(() => cardFor(MAG.personaName))
    expect(within(card).getByRole('status')).toHaveAccessibleName('Spelar Counter-Strike 2')
    expect(within(card).getByText('Counter-Strike 2')).toBeInTheDocument()
  })

  it('sorts the lineup the way the API returned it', async () => {
    const hiddenCard: PlayerCard = {
      ...MAG_CARD,
      steamid64: HIDDEN.steamid64,
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
      steamid64: HIDDEN.steamid64,
      personaName: HIDDEN.personaName,
      hasStats: false,
      overall: 0,
      tier: 'okänd',
      position: 'OKÄND',
      attributes: [],
      wotAttributes: [],
      comments: ['Steam-profilen är låst.'],
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

  it('falls back to the placeholder lineup when nobody has logged in', async () => {
    stubApi()
    renderRoster()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: members[0].nick })).toBeInTheDocument()
    })
    for (const m of members) {
      const card = cardFor(m.nick)
      expect(within(card).getByText(m.position)).toBeInTheDocument()
      expect(within(card).getByText(String(m.overall))).toBeInTheDocument()
    }
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
    steamid64: '76561198000000003',
    personaName: '[BVS] Rival',
    avatarUrl: null,
    discordName: null, wotNickname: null,
  }

  const RIVAL_CARD: PlayerCard = {
    ...MAG_CARD,
    steamid64: RIVAL.steamid64,
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

  it('works on the placeholder lineup too', async () => {
    const user = userEvent.setup()
    stubApi()
    renderRoster()

    await waitFor(() => cardFor(members[0].nick))
    const card = cardFor(members[0].nick)
    await user.click(within(card).getByRole('button', { name: /TÅL/ }))

    expect(within(card).getByText(/Hur ofta han överlever rundan/)).toBeInTheDocument()
  })
})

describe('the attribute legend', () => {
  it('is collapsed until someone asks for it', async () => {
    stubApi({ members: [MAG], cards: [MAG_CARD] })
    renderRoster()

    await waitFor(() => cardFor(MAG.personaName))
    expect(screen.getByRole('button', { name: 'Hur räknas betyget fram?' })).toHaveAttribute(
      'aria-expanded',
      'false'
    )
    expect(screen.queryByText(MAG_CARD.attributes[0]!.description)).not.toBeInTheDocument()
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
  const session = { steamid64: MAG.steamid64 }

  it('points a signed-in member to the account page', async () => {
    stubApi({ members: [MAG], cards: [MAG_CARD], session })
    renderRoster()

    expect(await screen.findByRole('link', { name: 'Mitt konto' })).toHaveAttribute(
      'href',
      '/mitt-konto',
    )
  })

  it('no longer carries the linking forms itself', async () => {
    stubApi({ members: [MAG], cards: [MAG_CARD], session })
    renderRoster()

    await waitFor(() => cardFor(MAG.personaName))
    expect(screen.queryByRole('button', { name: 'Koppla till kortet' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Länka World of Tanks' })).not.toBeInTheDocument()
  })

  it('says nothing to an anonymous visitor', async () => {
    stubApi({ members: [MAG], cards: [MAG_CARD], session: null })
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
        presence: { [MAG.steamid64]: { status: 'in-game', game: 'Valheim' } },
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
        presence: { [MAG.steamid64]: { status: 'online', game: null } },
      })
    })

    expect(within(card).getByText('84')).toBeInTheDocument()
    expect(within(card).getByText('SMYGARE')).toBeInTheDocument()
  })

  it('ignores an event with nothing useful in it', async () => {
    stubApi({
      members: [MAG],
      cards: [MAG_CARD],
      presence: { [MAG.steamid64]: { status: 'online', game: null } },
    })
    renderRoster()

    const card = await waitFor(() => cardFor(MAG.personaName))
    act(() => emitLiveEvent('presence', null))

    expect(within(card).getByRole('status')).toHaveAccessibleName('Online')
  })
})
