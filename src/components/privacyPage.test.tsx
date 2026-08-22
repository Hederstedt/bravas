import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { PrivacyPage } from './privacyPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <PrivacyPage />
    </MemoryRouter>,
  )
}

describe('PrivacyPage', () => {
  it('has a single page heading, level 1', () => {
    renderPage()
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent(/integritet/i)
    expect(screen.queryAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('names what comes from Steam and Wargaming', () => {
    renderPage()
    expect(screen.getAllByText(/Steam/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Wargaming/).length).toBeGreaterThan(0)
  })

  it('explains the Discord name is entered by hand, not read from Discord', () => {
    renderPage()
    expect(screen.getByText(/för hand/i)).toBeInTheDocument()
  })

  it('names what is shown publicly', () => {
    renderPage()
    expect(screen.getAllByText(/offentligt|publik/i).length).toBeGreaterThan(0)
  })

  it('states the session length', () => {
    renderPage()
    expect(screen.getByText(/30 dagar/)).toBeInTheDocument()
  })

  it('mentions that Steam avatars load directly from Steam, not through our server', () => {
    renderPage()
    expect(screen.getAllByText(/avatar/i).length).toBeGreaterThan(0)
  })

  it('gives a real way to ask about removal, not a dead promise of self-service', () => {
    renderPage()
    expect(screen.getAllByText(/admin|Discord/i).length).toBeGreaterThan(0)
  })

  it('explains that quotes and Manager history survive leaving, only unlinked from the name', () => {
    renderPage()
    expect(screen.getByText(/Manager-historiken finns kvar/)).toBeInTheDocument()
  })
})
