import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TeamForm } from './teamForm'
import * as api from '../../api'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('TeamForm', () => {
  it('creates the team and hands control back', async () => {
    const user = userEvent.setup()
    const created = vi.fn()
    const spy = vi
      .spyOn(api, 'createTeam')
      .mockResolvedValue({ ok: true, data: { team: { id: 1, name: 'FC Träklubban' } } })

    render(<TeamForm onCreated={created} />)

    await user.type(screen.getByLabelText('Lagnamn'), 'FC Träklubban')
    await user.click(screen.getByRole('button', { name: 'Skapa laget' }))

    expect(spy).toHaveBeenCalledWith('FC Träklubban')
    expect(created).toHaveBeenCalled()
  })

  // Kapplöpning mellan två flikar: laget skapades i den andra. Förklara och
  // hämta om vyn så laget syns, i stället för att lämna ett dött formulär.
  it('explains already_has_team and still reloads the view', async () => {
    const user = userEvent.setup()
    const created = vi.fn()
    vi.spyOn(api, 'createTeam').mockResolvedValue({
      ok: false,
      error: 'already_has_team',
      message: null,
    })

    render(<TeamForm onCreated={created} />)

    await user.type(screen.getByLabelText('Lagnamn'), 'FC Träklubban')
    await user.click(screen.getByRole('button', { name: 'Skapa laget' }))

    expect(await screen.findByText(/Du har redan ett lag/)).toBeInTheDocument()
    expect(created).toHaveBeenCalled()
  })

  it('shows a generic error when the request fails', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'createTeam').mockResolvedValue({ ok: false, error: 'network', message: null })

    render(<TeamForm onCreated={() => {}} />)

    await user.type(screen.getByLabelText('Lagnamn'), 'FC Träklubban')
    await user.click(screen.getByRole('button', { name: 'Skapa laget' }))

    expect(await screen.findByText(/Laget kunde inte skapas/)).toBeInTheDocument()
  })
})
