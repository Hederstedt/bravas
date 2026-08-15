import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { MatchReportPage } from './matchReport'
import * as api from '../../api'

afterEach(() => {
  vi.restoreAllMocks()
})

const REPORT: api.MatchReport = {
  id: 11,
  matchday: 1,
  home: { id: 1, name: 'FC Gubbarna' },
  away: { id: 2, name: 'Träklubborna' },
  homeScore: 13,
  awayScore: 5,
  report: {
    homeScore: 13,
    awayScore: 5,
    winner: 'home',
    rounds: [
      { round: 1, winner: 'home', kills: [] },
      { round: 2, winner: 'away', kills: [] },
    ],
    scoreboard: {
      home: [{ id: 'm:a', name: 'Kungalv', kills: 19, deaths: 12 }],
      away: [{ id: 'g:b', name: 'Fria Agenten', kills: 12, deaths: 19 }],
    },
    mvp: { id: 'm:a', name: 'Kungalv', kills: 19, deaths: 12 },
  },
}

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/manager/match/:id" element={<MatchReportPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('MatchReportPage', () => {
  it('renders score, MVP and both scoreboards', async () => {
    vi.spyOn(api, 'fetchMatchReport').mockResolvedValue(REPORT)

    renderAt('/manager/match/11')

    expect(await screen.findByText('13–5')).toBeInTheDocument()
    expect(screen.getByText(/Matchens gubbe/)).toBeInTheDocument()

    const home = screen.getByRole('table', { name: 'Protokoll för FC Gubbarna' })
    expect(within(home).getByText('Kungalv')).toBeInTheDocument()
    expect(within(home).getByText('19')).toBeInTheDocument()
    expect(
      within(screen.getByRole('table', { name: 'Protokoll för Träklubborna' })).getByText(
        'Fria Agenten',
      ),
    ).toBeInTheDocument()
  })

  // Utan lagnamn står det bara "Hemma" och "Borta", och läsaren har ingen
  // aning om vilka som mötte varandra.
  it('names both teams around the score', async () => {
    vi.spyOn(api, 'fetchMatchReport').mockResolvedValue(REPORT)

    renderAt('/manager/match/11')

    const score = (await screen.findByText('13–5')).closest('p')!
    expect(within(score).getByText('FC Gubbarna')).toBeInTheDocument()
    expect(within(score).getByText('Träklubborna')).toBeInTheDocument()
  })

  it('explains a walkover instead of showing an empty scoreboard', async () => {
    vi.spyOn(api, 'fetchMatchReport').mockResolvedValue({
      ...REPORT,
      report: {
        homeScore: 13,
        awayScore: 0,
        winner: 'home',
        rounds: [],
        scoreboard: { home: [], away: [] },
        mvp: null,
        walkover: 'Träklubborna hade ingen trupp.',
      },
    })

    renderAt('/manager/match/11')

    expect(await screen.findByText(/Träklubborna hade ingen trupp/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('says the report is missing on a 404', async () => {
    vi.spyOn(api, 'fetchMatchReport').mockResolvedValue(null)

    renderAt('/manager/match/999')

    expect(await screen.findByText(/Referatet hittades inte/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Tillbaka till managern/ })).toHaveAttribute(
      'href',
      '/manager',
    )
  })

  // Ett id som inte är siffror kan inte finnas — API:et ska inte ens frågas.
  it('treats a non-numeric id as missing without calling the API', async () => {
    const spy = vi.spyOn(api, 'fetchMatchReport')

    renderAt('/manager/match/apa')

    expect(await screen.findByText(/Referatet hittades inte/)).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })
})
