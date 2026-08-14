import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TransferDesk } from './transferDesk'
import * as api from '../../api'

afterEach(() => {
  vi.restoreAllMocks()
})

const RATINGS: api.ManagerRatings = { SIK: 70, SKA: 65, FRA: 60, TÅL: 55, NYT: 50, TID: 45 }

function player(key: string, name: string, value: number, takenBy: string | null): api.PoolPlayer {
  return { key, source: 'generated', name, ratings: RATINGS, value, takenBy }
}

const SQUAD = [
  player('p:b', 'Bärarn', 6000, 'FC Träklubban'),
  player('p:c', 'Cyklisten', 5000, 'FC Träklubban'),
]

const POOL = [
  ...SQUAD,
  player('p:a', 'Stjärnan', 9000, 'Motståndarna'),
  player('p:d', 'Dundret', 4000, null),
  player('p:e', 'Enstöringen', 3000, null),
]

function view(overrides: Partial<api.ManagerView> = {}): api.ManagerView {
  return {
    season: { id: 1, name: 'Höstserien', starts_at: 1, ends_at: 2, status: 'active' },
    budget: 20_000,
    squadSize: 5,
    locked: true,
    sellRate: 0.7,
    pool: POOL,
    myTeam: {
      id: 2,
      name: 'FC Träklubban',
      squad: SQUAD,
      spent: 11_000,
      funds: 1000,
      transfersLeft: 1,
      trainingLeft: 2,
    },
    teams: [],
    table: [],
    fixtures: [],
    ...overrides,
  }
}

function norm(s: string | null): string {
  return (s ?? '').replace(/\s/g, ' ')
}

describe('TransferDesk', () => {
  it('lists only free agents on the buy side', () => {
    render(<TransferDesk view={view()} onView={() => {}} />)

    const table = screen.getByRole('table', { name: 'Lediga gubbar' })
    expect(within(table).getByText('Dundret')).toBeInTheDocument()
    expect(within(table).queryByText('Stjärnan')).not.toBeInTheDocument()
    expect(within(table).queryByText('Bärarn')).not.toBeInTheDocument()
  })

  it('does the maths for a chosen deal', async () => {
    const user = userEvent.setup()
    render(<TransferDesk view={view()} onView={() => {}} />)

    await user.click(within(screen.getByText('Bärarn').closest('li')!).getByRole('button'))
    await user.click(
      within(screen.getByText('Dundret').closest('tr')!).getByRole('button', { name: 'Köp' }),
    )

    // 1000 + floor(0,7 × 6000) − 4000 = 1200
    expect(
      norm(screen.getByText(/kassa efter/).textContent),
    ).toBe('Säljer Bärarn för 4 200 · köper Dundret för 4 000 · kassa efter: 1 200')
    expect(screen.getByRole('button', { name: 'Genomför affären' })).toBeEnabled()
  })

  it('makes the transfer and hands over the fresh view', async () => {
    const user = userEvent.setup()
    const onView = vi.fn()
    const fresh = view()
    const spy = vi.spyOn(api, 'makeTransfer').mockResolvedValue({ ok: true, data: fresh })

    render(<TransferDesk view={view()} onView={onView} />)

    await user.click(within(screen.getByText('Bärarn').closest('li')!).getByRole('button'))
    await user.click(
      within(screen.getByText('Dundret').closest('tr')!).getByRole('button', { name: 'Köp' }),
    )
    await user.click(screen.getByRole('button', { name: 'Genomför affären' }))

    expect(spy).toHaveBeenCalledWith('p:b', 'p:d')
    expect(onView).toHaveBeenCalledWith(fresh)
  })

  // Spegling av serverns regel: en affär som kassan inte täcker går inte att
  // skicka, och raden visar varför.
  it('refuses a deal the funds do not cover', async () => {
    const user = userEvent.setup()
    render(<TransferDesk view={view({ pool: [...POOL, player('p:f', 'Dyrgripen', 15_000, null)] })} onView={() => {}} />)

    await user.click(within(screen.getByText('Cyklisten').closest('li')!).getByRole('button'))
    await user.click(
      within(screen.getByText('Dyrgripen').closest('tr')!).getByRole('button', { name: 'Köp' }),
    )

    // sv-SE skriver negativa tal med typografiskt minustecken (U+2212).
    expect(norm(screen.getByText(/kassa efter/).textContent)).toContain('kassa efter: −10 500')
    expect(screen.getByRole('button', { name: 'Genomför affären' })).toBeDisabled()
  })

  it('closes the window when the quota is used up', () => {
    render(
      <TransferDesk
        view={view({
          myTeam: { ...view().myTeam!, transfersLeft: 0 },
        })}
        onView={() => {}}
      />,
    )

    expect(screen.getByText(/fönstret öppnar när omgången spelats/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Genomför affären' })).toBeDisabled()
  })

  it("shows the server's verdict when someone got there first", async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'makeTransfer').mockResolvedValue({
      ok: false,
      error: 'invalid_transfer',
      message: 'Någon hann före på gubben. Ladda om och försök igen.',
    })

    render(<TransferDesk view={view()} onView={() => {}} />)

    await user.click(within(screen.getByText('Bärarn').closest('li')!).getByRole('button'))
    await user.click(
      within(screen.getByText('Dundret').closest('tr')!).getByRole('button', { name: 'Köp' }),
    )
    await user.click(screen.getByRole('button', { name: 'Genomför affären' }))

    expect(await screen.findByText(/Någon hann före på gubben/)).toBeInTheDocument()
  })
})
