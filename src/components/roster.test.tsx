import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import * as api from '../api'
import type { PlayerCard, RosterMember } from '../api'
import { members } from '../data/clan'
import { Roster } from './roster'

afterEach(() => {
  vi.restoreAllMocks()
})

const MAG: RosterMember = {
  steamid64: '76561198053832683',
  personaName: '[BVS] #Mag',
  avatarUrl: 'https://avatars.example/mag.jpg',
  discordName: 'mag',
}

const HIDDEN: RosterMember = {
  steamid64: '76561198000000002',
  personaName: '[BVS] Hemlig',
  avatarUrl: null,
  discordName: null,
}

const MAG_CARD: PlayerCard = {
  steamid64: MAG.steamid64,
  personaName: MAG.personaName,
  hasStats: true,
  overall: 84,
  tier: 'guld',
  position: 'SMYGARE',
  attributes: [
    { key: 'SIK', label: 'Sikte', rating: 80 },
    { key: 'SKA', label: 'Skallar', rating: 71 },
    { key: 'FRA', label: 'Frag', rating: 55 },
    { key: 'TÅL', label: 'Tålighet', rating: 92 },
    { key: 'NYT', label: 'Nytta', rating: 64 },
    { key: 'TID', label: 'Tid', rating: 88 },
  ],
  comments: ['Smyger runt mest. Dyker upp när röken lagt sig.'],
}

// Standardläget för varje test: inget API svarar. Enskilda tester stubbar om
// bara det de bryr sig om.
function stubApi(overrides: {
  members?: RosterMember[]
  cards?: PlayerCard[]
  presence?: api.PresenceMap
} = {}) {
  vi.spyOn(api, 'fetchMembers').mockResolvedValue(overrides.members ?? [])
  vi.spyOn(api, 'fetchCards').mockResolvedValue(overrides.cards ?? [])
  vi.spyOn(api, 'fetchPresence').mockResolvedValue(overrides.presence ?? {})
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
  it('is reachable and labelled for anyone scrolling it with a keyboard', async () => {
    stubApi({ members: [MAG], cards: [MAG_CARD] })
    render(<Roster />)

    const lineup = await screen.findByRole('group', { name: /gubbarna/i })
    expect(lineup).toHaveAttribute('tabindex', '0')
  })
})
