import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

function cardFor(name: string) {
  return screen.getByRole('heading', { name }).closest('article')!
}

describe('Roster with live members', () => {
  it('renders a card per member with rating, position and every attribute', async () => {
    stubApi({ members: [MAG], cards: [MAG_CARD] })
    render(<Roster />)

    const card = await waitFor(() => cardFor(MAG.personaName))
    expect(within(card).getByText('84')).toBeInTheDocument()
    expect(within(card).getByText('SMYGARE')).toBeInTheDocument()
    for (const attr of MAG_CARD.attributes) {
      expect(within(card).getByText(attr.key)).toBeInTheDocument()
    }
  })

  it('prints the generated comment on the card', async () => {
    stubApi({ members: [MAG], cards: [MAG_CARD] })
    render(<Roster />)

    const card = await waitFor(() => cardFor(MAG.personaName))
    expect(within(card).getByText(MAG_CARD.comments[0])).toBeInTheDocument()
  })

  it('shows the Steam avatar when there is one', async () => {
    stubApi({ members: [MAG], cards: [MAG_CARD] })
    render(<Roster />)

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
    render(<Roster />)

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
    render(<Roster />)

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
      comments: ['Steam-profilen är låst.'],
    }
    stubApi({ members: [HIDDEN], cards: [locked] })
    render(<Roster />)

    const card = await waitFor(() => cardFor(HIDDEN.personaName))
    expect(within(card).getByText('OKÄND')).toBeInTheDocument()
    expect(within(card).getByText('Steam-profilen är låst.')).toBeInTheDocument()
    expect(within(card).queryByText('SIK')).not.toBeInTheDocument()
  })

  it('renders the card shell when the stats endpoint gives nothing back', async () => {
    // Medlemmarna laddade men statistiken inte — namnet ska synas ändå.
    stubApi({ members: [MAG], cards: [] })
    render(<Roster />)

    const card = await waitFor(() => cardFor(MAG.personaName))
    expect(within(card).getByText(/statistik/i)).toBeInTheDocument()
  })

  it('falls back to the placeholder lineup when nobody has logged in', async () => {
    stubApi()
    render(<Roster />)

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
    render(<Roster />)

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
    render(<Roster />)

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
    render(<Roster />)

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
    render(<Roster />)

    await waitFor(() => cardFor(members[0].nick))
    const card = cardFor(members[0].nick)
    await user.click(within(card).getByRole('button', { name: /TÅL/ }))

    expect(within(card).getByText(/Hur ofta han överlever rundan/)).toBeInTheDocument()
  })
})

describe('the attribute legend', () => {
  it('is collapsed until someone asks for it', async () => {
    stubApi({ members: [MAG], cards: [MAG_CARD] })
    render(<Roster />)

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
    render(<Roster />)

    await waitFor(() => cardFor(MAG.personaName))
    await user.click(screen.getByRole('button', { name: 'Hur räknas betyget fram?' }))

    for (const attr of MAG_CARD.attributes) {
      expect(screen.getByText(attr.description)).toBeInTheDocument()
    }
  })
})

// Steam vet vad du heter i Steam, inte i Discorden. Backenden har kunnat spara
// kopplingen hela tiden — den gick bara inte att nå från sajten.
describe('linking a Discord name', () => {
  const session = { steamid64: MAG.steamid64 }

  it('shows the name on the card once it is set', async () => {
    stubApi({ members: [MAG], cards: [MAG_CARD] })
    render(<Roster />)

    const card = await waitFor(() => cardFor(MAG.personaName))
    expect(within(card).getByText('mag')).toBeInTheDocument()
  })

  it('leaves the card clean for someone who has not linked one', async () => {
    stubApi({ members: [HIDDEN], cards: [] })
    render(<Roster />)

    const card = await waitFor(() => cardFor(HIDDEN.personaName))
    expect(within(card).queryByText('mag')).not.toBeInTheDocument()
  })

  it('hides the form from anonymous visitors', async () => {
    stubApi({ members: [MAG], cards: [MAG_CARD], session: null })
    render(<Roster />)

    await waitFor(() => cardFor(MAG.personaName))
    expect(screen.queryByRole('button', { name: /Koppla till kortet/ })).not.toBeInTheDocument()
  })

  it('saves the name and refreshes the roster so the card updates', async () => {
    const user = userEvent.setup()
    stubApi({ members: [{ ...MAG, discordName: null , wotNickname: null}], cards: [MAG_CARD], session })
    const link = vi.spyOn(api, 'linkDiscord').mockResolvedValue(true)

    render(<Roster />)

    await user.type(await screen.findByLabelText(/Vad heter du i Discorden/), 'magge')
    await user.click(screen.getByRole('button', { name: 'Koppla till kortet' }))

    expect(link).toHaveBeenCalledWith('magge')
    expect(await screen.findByText(/Sparat — namnet syns på ditt kort/)).toBeInTheDocument()
  })

  it('says so when the name could not be saved', async () => {
    const user = userEvent.setup()
    stubApi({ members: [MAG], cards: [MAG_CARD], session })
    vi.spyOn(api, 'linkDiscord').mockResolvedValue(false)

    render(<Roster />)

    await user.type(await screen.findByLabelText(/Byt Discord-namn/), 'magge')
    await user.click(screen.getByRole('button', { name: 'Koppla till kortet' }))

    expect(await screen.findByText(/kunde inte sparas/)).toBeInTheDocument()
  })
})

// Ingen egen inloggning eller formulär att fylla i — bara en länk ut till
// Wargaming och tillbaka, så testerna kollar länken snarare än ett anrop.
describe('linking a World of Tanks account', () => {
  const session = { steamid64: MAG.steamid64 }

  it('offers to link an account for a signed-in member who has not linked one', async () => {
    stubApi({ members: [MAG], cards: [MAG_CARD], session })
    render(<Roster />)

    const link = await screen.findByRole('link', { name: 'Länka World of Tanks' })
    expect(link).toHaveAttribute('href', api.WOT_LOGIN_URL)
  })

  it('shows the linked nickname instead of the invitation once linked', async () => {
    stubApi({ members: [{ ...MAG, wotNickname: 'GubbeIRL' }], cards: [MAG_CARD], session })
    render(<Roster />)

    expect(await screen.findByText(/Länkad mot World of Tanks som/)).toBeInTheDocument()
    expect(screen.getByText('GubbeIRL')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Länka World of Tanks' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Byt konto' })).toHaveAttribute('href', api.WOT_LOGIN_URL)
  })

  it('hides the link from anonymous visitors', async () => {
    stubApi({ members: [MAG], cards: [MAG_CARD], session: null })
    render(<Roster />)

    await waitFor(() => cardFor(MAG.personaName))
    expect(screen.queryByRole('link', { name: /World of Tanks/ })).not.toBeInTheDocument()
  })
})

describe('live presence updates', () => {
  it('moves the dot when the server says someone started a game', async () => {
    stubApi({ members: [MAG], cards: [MAG_CARD] })
    render(<Roster />)

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
    render(<Roster />)

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
    render(<Roster />)

    const card = await waitFor(() => cardFor(MAG.personaName))
    act(() => emitLiveEvent('presence', null))

    expect(within(card).getByRole('status')).toHaveAccessibleName('Online')
  })
})
