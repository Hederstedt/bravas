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

  // Ett lag skrivet på efter att schemat lades (POST /api/manager/team svarar
  // numera 409 season_locked, men äldre rader kan finnas kvar) hade annars
  // sett ut som ett datafel — en rad nollor utan förklaring.
  describe('a team with zero played matches', () => {
    const WITH_LATECOMER: TableRow[] = [
      ...ROWS,
      {
        teamId: 3,
        name: 'Sent ute',
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        roundsFor: 0,
        roundsAgainst: 0,
        diff: 0,
        points: 0,
      },
    ]

    it('notes that the team joined after the schedule was set', () => {
      render(<LeagueTable table={WITH_LATECOMER} />)

      const rows = within(screen.getByRole('table', { name: 'Ligatabellen' }))
        .getAllByRole('row')
        .slice(1)
      expect(within(rows[2]).getByText(/Anslöt efter att serien startat/)).toBeInTheDocument()
    })

    it('says nothing extra about a team that has actually played', () => {
      render(<LeagueTable table={WITH_LATECOMER} />)

      const rows = within(screen.getByRole('table', { name: 'Ligatabellen' }))
        .getAllByRole('row')
        .slice(1)
      expect(within(rows[0]).queryByText(/Anslöt efter/)).not.toBeInTheDocument()
    })
  })
})
