import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import * as api from '../api'
import { MonthlyStandings } from './monthlyStandings'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('MonthlyStandings', () => {
  it('has a heading', async () => {
    vi.spyOn(api, 'fetchMonthlyStatus').mockResolvedValue({
      month: '2026-08',
      standings: [],
      lastMonth: null,
    })
    render(<MonthlyStandings />)

    expect(await screen.findByRole('heading', { name: 'Månadens BVS:are' })).toBeInTheDocument()
  })

  it('lists the running standings, ranked', async () => {
    vi.spyOn(api, 'fetchMonthlyStatus').mockResolvedValue({
      month: '2026-08',
      standings: [
        { steamid64: '1', personaName: '[BVS] #Mag', score: 12.4 },
        { steamid64: '2', personaName: '[BVS] Kungalv', score: 3 },
      ],
      lastMonth: null,
    })
    render(<MonthlyStandings />)

    const items = await screen.findAllByRole('listitem')
    expect(items[0]).toHaveTextContent('[BVS] #Mag')
    expect(items[0]).toHaveTextContent('12.4')
    expect(items[1]).toHaveTextContent('[BVS] Kungalv')
  })

  it('shows last month\'s winner when there is one', async () => {
    vi.spyOn(api, 'fetchMonthlyStatus').mockResolvedValue({
      month: '2026-08',
      standings: [],
      lastMonth: { month: '2026-07', steamid64: '1', personaName: '[BVS] #Mag', score: 21.7 },
    })
    render(<MonthlyStandings />)

    expect(await screen.findByText(/Förra månadens vinnare/)).toBeInTheDocument()
    expect(screen.getByText('[BVS] #Mag', { exact: false })).toBeInTheDocument()
  })

  it('says nothing about a winner before any month has been decided', async () => {
    vi.spyOn(api, 'fetchMonthlyStatus').mockResolvedValue({
      month: '2026-08',
      standings: [],
      lastMonth: null,
    })
    render(<MonthlyStandings />)

    await screen.findByRole('heading', { name: 'Månadens BVS:are' })
    expect(screen.queryByText(/Förra månadens vinnare/)).not.toBeInTheDocument()
  })

  it('explains that a closed Steam profile is never sampled, so the race is not unfair', async () => {
    vi.spyOn(api, 'fetchMonthlyStatus').mockResolvedValue({
      month: '2026-08',
      standings: [],
      lastMonth: null,
    })
    render(<MonthlyStandings />)

    expect(await screen.findByText(/Stängd Steam-profil/)).toBeInTheDocument()
  })

  it('says so when there is nothing to rank yet', async () => {
    vi.spyOn(api, 'fetchMonthlyStatus').mockResolvedValue({
      month: '2026-08',
      standings: [],
      lastMonth: null,
    })
    render(<MonthlyStandings />)

    expect(await screen.findByText(/Ingen ställning att visa än/)).toBeInTheDocument()
  })
})
