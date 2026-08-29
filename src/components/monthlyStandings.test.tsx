import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import * as api from '../api'
import { MonthlyStandings } from './monthlyStandings'

afterEach(() => {
  vi.restoreAllMocks()
})

// Komponenten länkar till Kom igång-sidan, och en Link utan router kastar —
// routern bor i main.tsx, så testet får bära med sig en egen.
function renderStandings() {
  return render(
    <MemoryRouter>
      <MonthlyStandings />
    </MemoryRouter>,
  )
}

describe('MonthlyStandings', () => {
  it('has a heading', async () => {
    vi.spyOn(api, 'fetchMonthlyStatus').mockResolvedValue({
      month: '2026-08',
      standings: [],
      lastMonth: null,
    })
    renderStandings()

    expect(await screen.findByRole('heading', { name: 'Månadens BVS:are' })).toBeInTheDocument()
  })

  it('lists the running standings, ranked', async () => {
    vi.spyOn(api, 'fetchMonthlyStatus').mockResolvedValue({
      month: '2026-08',
      standings: [
        { id: '1', personaName: '[BVS] #Mag', score: 12.4 },
        { id: '2', personaName: '[BVS] Kungalv', score: 3 },
      ],
      lastMonth: null,
    })
    renderStandings()

    const items = await screen.findAllByRole('listitem')
    expect(items[0]).toHaveTextContent('[BVS] #Mag')
    expect(items[0]).toHaveTextContent('12.4')
    expect(items[1]).toHaveTextContent('[BVS] Kungalv')
  })

  it('shows last month\'s winner when there is one', async () => {
    vi.spyOn(api, 'fetchMonthlyStatus').mockResolvedValue({
      month: '2026-08',
      standings: [],
      lastMonth: { month: '2026-07', id: '1', personaName: '[BVS] #Mag', score: 21.7 },
    })
    renderStandings()

    expect(await screen.findByText(/Förra månadens vinnare/)).toBeInTheDocument()
    expect(screen.getByText('[BVS] #Mag', { exact: false })).toBeInTheDocument()
  })

  it('says nothing about a winner before any month has been decided', async () => {
    vi.spyOn(api, 'fetchMonthlyStatus').mockResolvedValue({
      month: '2026-08',
      standings: [],
      lastMonth: null,
    })
    renderStandings()

    await screen.findByRole('heading', { name: 'Månadens BVS:are' })
    expect(screen.queryByText(/Förra månadens vinnare/)).not.toBeInTheDocument()
  })

  it('explains that a closed Steam profile is never sampled, so the race is not unfair', async () => {
    vi.spyOn(api, 'fetchMonthlyStatus').mockResolvedValue({
      month: '2026-08',
      standings: [],
      lastMonth: null,
    })
    renderStandings()

    expect(await screen.findByText(/Stängd Steam-profil/)).toBeInTheDocument()
  })

  it('says so when there is nothing to rank yet', async () => {
    vi.spyOn(api, 'fetchMonthlyStatus').mockResolvedValue({
      month: '2026-08',
      standings: [],
      lastMonth: null,
    })
    renderStandings()

    expect(await screen.findByText(/Ingen ställning att visa än/)).toBeInTheDocument()
  })
})
