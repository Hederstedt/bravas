import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { LeagueTable } from './leagueTable'
import type { TableRow } from '../../api'

const ROWS: TableRow[] = [
  {
    teamId: 1,
    name: 'FC Gubbarna',
    played: 3,
    won: 2,
    drawn: 1,
    lost: 0,
    roundsFor: 35,
    roundsAgainst: 20,
    diff: 15,
    points: 7,
  },
  {
    teamId: 2,
    name: 'Träklubborna',
    played: 3,
    won: 0,
    drawn: 1,
    lost: 2,
    roundsFor: 20,
    roundsAgainst: 35,
    diff: -15,
    points: 1,
  },
]

describe('LeagueTable', () => {
  it('renders the teams in server order with their points', () => {
    render(<LeagueTable table={ROWS} />)

    const rows = within(screen.getByRole('table', { name: 'Ligatabellen' }))
      .getAllByRole('row')
      .slice(1)

    expect(within(rows[0]).getByText('FC Gubbarna')).toBeInTheDocument()
    expect(within(rows[0]).getByText('7')).toBeInTheDocument()
    expect(within(rows[0]).getByText('+15')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Träklubborna')).toBeInTheDocument()
    expect(within(rows[1]).getByText('-15')).toBeInTheDocument()
  })

  it('explains an empty table instead of rendering headers over nothing', () => {
    render(<LeagueTable table={[]} />)
    expect(screen.getByText(/Tabellen fylls på/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  // Datorstyrt motstånd ska gå att skilja från gubbarnas egna lag.
  it('marks the computer-run teams', () => {
    render(<LeagueTable table={ROWS} botTeams={new Set([2])} />)

    const rows = within(screen.getByRole('table', { name: 'Ligatabellen' }))
      .getAllByRole('row')
      .slice(1)

    expect(within(rows[0]).queryByText('BOT')).not.toBeInTheDocument()
    expect(within(rows[1]).getByText('BOT')).toBeInTheDocument()
  })

  it('marks nothing when the league has no bots', () => {
    render(<LeagueTable table={ROWS} />)
    expect(screen.queryByText('BOT')).not.toBeInTheDocument()
  })

  // Enbokstavsrubrikerna (S, V, O, F, P) säger ingenting uppläst utan en
  // förklaring — en caption ger tabellen en textbeskrivning en skärmläsare
  // hittar utan att behöva gissa på varje kolumn för sig.
  it('explains the column abbreviations in a caption', () => {
    render(<LeagueTable table={ROWS} />)
    expect(screen.getByText(/S spelade, V vunna, O oavgjorda, F förlorade/)).toBeInTheDocument()
  })
})
