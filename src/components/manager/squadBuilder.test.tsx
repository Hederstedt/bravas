import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SquadBuilder } from './squadBuilder'
import * as api from '../../api'

afterEach(() => {
  vi.restoreAllMocks()
})

const RATINGS: api.ManagerRatings = { SIK: 70, SKA: 65, FRA: 60, TÅL: 55, NYT: 50, TID: 45 }

function player(key: string, name: string, value: number, takenBy: string | null): api.PoolPlayer {
  return { key, source: 'generated', name, ratings: RATINGS, value, takenBy }
}

const POOL = [
  player('p:a', 'Stjärnan', 9000, 'Motståndarna'),
  player('p:b', 'Bärarn', 6000, null),
  player('p:c', 'Cyklisten', 5000, null),
  player('p:d', 'Dundret', 4000, null),
  player('p:e', 'Enstöringen', 3000, null),
  player('p:f', 'Fyllnadsgubben', 2000, null),
  player('p:g', 'Gnällspiken', 2500, null),
]

function view(overrides: Partial<api.ManagerView> = {}): api.ManagerView {
  return {
    season: { id: 1, name: 'Höstserien', starts_at: 1, ends_at: 2, status: 'active' },
    budget: 20_000,
    squadSize: 5,
    locked: false,
    sellRate: 0.7,
    pool: POOL,
    myTeam: { id: 2, name: 'FC Träklubban', squad: [], spent: 0, funds: 20_000, transfersLeft: 0, trainingLeft: 0 },
    lastFinished: null,
    teams: [],
    table: [],
    fixtures: [],
    ...overrides,
  }
}

function budgetLine() {
  return screen.getByText((t) => t.replace(/\s/g, ' ').startsWith('Trupp:'))
}

function rowFor(name: string) {
  return screen.getByText(name).closest('tr')!
}

describe('SquadBuilder', () => {
  it('counts picks and cost as players are selected', async () => {
    const user = userEvent.setup()
    render(<SquadBuilder view={view()} onView={() => {}} />)

    await user.click(within(rowFor('Bärarn')).getByRole('button', { name: 'Välj' }))
    await user.click(within(rowFor('Cyklisten')).getByRole('button', { name: 'Välj' }))

    expect(budgetLine().textContent!.replace(/\s/g, ' ')).toBe('Trupp: 2/5 · 11 000 av 20 000')
  })

  it('offers no pick button for a player on another team', () => {
    render(<SquadBuilder view={view()} onView={() => {}} />)

    const row = rowFor('Stjärnan')
    expect(within(row).getByText('Motståndarna')).toBeInTheDocument()
    expect(within(row).queryByRole('button')).not.toBeInTheDocument()
  })

  it('signs exactly five players within budget', async () => {
    const user = userEvent.setup()
    const onView = vi.fn()
    const fresh = view()
    const spy = vi.spyOn(api, 'saveSquad').mockResolvedValue({ ok: true, data: fresh })

    render(<SquadBuilder view={view()} onView={onView} />)

    const save = screen.getByRole('button', { name: 'Skriv på truppen' })
    expect(save).toBeDisabled()

    for (const name of ['Bärarn', 'Cyklisten', 'Dundret', 'Enstöringen', 'Fyllnadsgubben']) {
      await user.click(within(rowFor(name)).getByRole('button', { name: 'Välj' }))
    }

    expect(save).toBeEnabled()
    await user.click(save)

    expect(spy).toHaveBeenCalledWith(['p:b', 'p:c', 'p:d', 'p:e', 'p:f'])
    expect(onView).toHaveBeenCalledWith(fresh)
  })

  // Spegling av serverns regel: en för dyr trupp går inte ens att skicka.
  it('refuses to submit over budget', async () => {
    const user = userEvent.setup()
    render(<SquadBuilder view={view()} onView={() => {}} />)

    for (const name of ['Bärarn', 'Cyklisten', 'Dundret', 'Enstöringen', 'Gnällspiken']) {
      await user.click(within(rowFor(name)).getByRole('button', { name: 'Välj' }))
    }

    expect(budgetLine().textContent!.replace(/\s/g, ' ')).toBe('Trupp: 5/5 · 20 500 av 20 000')
    expect(budgetLine()).toHaveClass('over')
    expect(screen.getByRole('button', { name: 'Skriv på truppen' })).toBeDisabled()
  })

  // Servern har sista ordet — dess besked är skrivet för managern och visas
  // som det är.
  it('shows the server message when someone got there first', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'saveSquad').mockResolvedValue({
      ok: false,
      error: 'invalid_squad',
      message: 'Bärarn är redan skriven på ett annat lag.',
    })

    render(<SquadBuilder view={view()} onView={() => {}} />)

    for (const name of ['Bärarn', 'Cyklisten', 'Dundret', 'Enstöringen', 'Fyllnadsgubben']) {
      await user.click(within(rowFor(name)).getByRole('button', { name: 'Välj' }))
    }
    await user.click(screen.getByRole('button', { name: 'Skriv på truppen' }))

    expect(
      await screen.findByText('Bärarn är redan skriven på ett annat lag.'),
    ).toBeInTheDocument()
  })

  it('starts from the already signed squad', () => {
    const squad = [POOL[1], POOL[2]]
    render(
      <SquadBuilder
        view={view({
          myTeam: { id: 2, name: 'FC Träklubban', squad, spent: 11_000, funds: 9000, transfersLeft: 0, trainingLeft: 0 },
          pool: POOL.map((p) =>
            squad.some((s) => s.key === p.key) ? { ...p, takenBy: 'FC Träklubban' } : p,
          ),
        })}
        onView={() => {}}
      />,
    )

    expect(budgetLine().textContent!.replace(/\s/g, ' ')).toBe('Trupp: 2/5 · 11 000 av 20 000')
    expect(within(rowFor('Bärarn')).getByRole('button', { name: 'Ta bort' })).toBeInTheDocument()
  })
})
