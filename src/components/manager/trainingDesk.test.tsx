import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TrainingDesk } from './trainingDesk'
import * as api from '../../api'

afterEach(() => {
  vi.restoreAllMocks()
})

function player(key: string, name: string, ratings: api.ManagerRatings): api.PoolPlayer {
  return { key, source: 'generated', name, ratings, value: 5000, takenBy: 'FC Träklubban' }
}

const SQUAD = [
  player('p:b', 'Bärarn', { SIK: 70, SKA: 65, FRA: 60, TÅL: 55, NYT: 50, TID: 45 }),
  player('p:c', 'Cyklisten', { SIK: 90, SKA: 40, FRA: 60, TÅL: 55, NYT: 50, TID: 45 }),
]

function view(overrides: Partial<api.ManagerView> = {}): api.ManagerView {
  return {
    season: { id: 1, name: 'Höstserien', starts_at: 1, ends_at: 2, status: 'active' },
    budget: 20_000,
    squadSize: 5,
    locked: true,
    sellRate: 0.7,
    pointsWin: 3,
    pointsDraw: 1,
    transfersPerMatchday: 1,
    trainingPerMatchday: 2,
    pool: SQUAD,
    myTeam: {
      id: 2,
      name: 'FC Träklubban',
      squad: SQUAD,
      spent: 10_000,
      funds: 1000,
      transfersLeft: 1,
      trainingLeft: 2,
    activity: { hours: { cs2: 0, other: 0 }, training: 0, transfer: 0 },
    },
    lastFinished: null,
    teams: [],
    table: [],
    fixtures: [],
    ...overrides,
  }
}

function attrButton(playerName: string, label: RegExp) {
  return within(screen.getByText(playerName).closest('tr')!).getByRole('button', { name: label })
}

describe('TrainingDesk', () => {
  it('shows the expected gain before the pass is sent', () => {
    render(<TrainingDesk view={view()} onView={() => {}} />)

    // 70 i SIK ger +3 enligt kurvan (round((90−70)/8)).
    expect(attrButton('Bärarn', /^70/)).toHaveTextContent('70+3')
    // 40 i SKA ger +6 — projektgubben växer snabbast.
    expect(attrButton('Cyklisten', /^40/)).toHaveTextContent('40+6')
  })

  it('trains the chosen attribute and hands over the fresh view', async () => {
    const user = userEvent.setup()
    const onView = vi.fn()
    const fresh = view()
    const spy = vi.spyOn(api, 'trainPlayer').mockResolvedValue({ ok: true, data: fresh })

    render(<TrainingDesk view={view()} onView={onView} />)

    await user.click(attrButton('Bärarn', /^70/))

    expect(spy).toHaveBeenCalledWith('p:b', 'SIK')
    expect(onView).toHaveBeenCalledWith(fresh)
  })

  // Vid 90 är det stopp — knappen är död och säger varför.
  it('disables a maxed attribute', () => {
    render(<TrainingDesk view={view()} onView={() => {}} />)

    const maxed = attrButton('Cyklisten', /^90/)
    expect(maxed).toBeDisabled()
    expect(maxed).not.toHaveTextContent('+')
  })

  it('closes the gym when the sessions are used up', () => {
    render(
      <TrainingDesk
        view={view({ myTeam: { ...view().myTeam!, trainingLeft: 0 } })}
        onView={() => {}}
      />,
    )

    // Sedan tvärspelspoängen finns är kvoten inte längre slutgiltig — lirar
    // man CS2 före nästa omgång öppnar fler pass, och beskedet säger det.
    expect(screen.getByText(/lira lite CS2 så öppnar fler/)).toBeInTheDocument()
    expect(attrButton('Bärarn', /^70/)).toBeDisabled()
  })

  it("shows the server's verdict when the pass is refused", async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'trainPlayer').mockResolvedValue({
      ok: false,
      error: 'no_sessions_left',
      message: 'Omgångens pass är gjorda — gubbarna behöver vila före nästa match.',
    })

    render(<TrainingDesk view={view()} onView={() => {}} />)

    await user.click(attrButton('Bärarn', /^70/))

    expect(await screen.findByText(/gubbarna behöver vila/)).toBeInTheDocument()
  })
})
