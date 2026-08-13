import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Nav, Games, Stats } from './sections'
import { games, statHighlights } from '../data/clan'

describe('Games', () => {
  it('renders one card per game with title and status', () => {
    render(<Games />)
    for (const g of games) {
      const card = screen.getByRole('heading', { name: g.title }).closest('article')!
      expect(within(card).getByText(g.status)).toBeInTheDocument()
    }
  })
})

describe('Stats', () => {
  it('renders all highlights and the demo badge', () => {
    render(<Stats />)
    expect(screen.getByText('Demo-data')).toBeInTheDocument()
    for (const s of statHighlights) {
      expect(screen.getByText(s.label)).toBeInTheDocument()
    }
  })
})

describe('Nav mobile menu', () => {
  it('opens and closes via the burger button', async () => {
    const user = userEvent.setup()
    render(<Nav />)

    const burger = screen.getByRole('button', { name: 'Öppna menyn' })
    expect(screen.queryByRole('dialog', { name: 'Meny' })).not.toBeInTheDocument()

    await user.click(burger)
    expect(screen.getByRole('dialog', { name: 'Meny' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Stäng menyn' }))
    expect(screen.queryByRole('dialog', { name: 'Meny' })).not.toBeInTheDocument()
  })

  it('closes when a menu link is clicked', async () => {
    const user = userEvent.setup()
    render(<Nav />)

    await user.click(screen.getByRole('button', { name: 'Öppna menyn' }))
    const overlay = screen.getByRole('dialog', { name: 'Meny' })
    await user.click(within(overlay).getByRole('link', { name: 'Spel' }))
    expect(screen.queryByRole('dialog', { name: 'Meny' })).not.toBeInTheDocument()
  })
})
