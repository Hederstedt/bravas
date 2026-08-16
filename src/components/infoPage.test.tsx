import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { InfoPage } from './infoPage'

// Sidan hänvisar till kontosidan med Link, och en Link utan router kraschar.
function renderPage() {
  return render(
    <MemoryRouter>
      <InfoPage />
    </MemoryRouter>,
  )
}

describe('InfoPage', () => {
  it('has a page heading', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Kom igång' })).toBeInTheDocument()
  })

  it('explains that Steam login is required to appear at all', () => {
    renderPage()
    expect(screen.getByText(/dyker du inte upp i Gubbarna-listan alls/)).toBeInTheDocument()
  })

  it('explains that closed game details mean no stats', () => {
    renderPage()
    expect(screen.getByText(/spelinformation är stängd/)).toBeInTheDocument()
  })

  it('explains that the Discord name is entered by hand', () => {
    renderPage()
    expect(screen.getByText(/görs för hand/)).toBeInTheDocument()
  })

  it('explains how to link World of Tanks without sharing credentials', () => {
    renderPage()
    expect(screen.getByRole('link', { name: 'Länka World of Tanks' })).toHaveAttribute(
      'href',
      '/api/members/wot/login',
    )
    expect(screen.getByText(/inget nick eller lösenord skickas/)).toBeInTheDocument()
  })

  // Kopplingarna låg i Gubbarna förut. Står det kvar här skickas den som är
  // minst tekniskt bevandrad till en sektion som inte finns längre.
  it('sends the reader to the account page for both links', () => {
    renderPage()
    const links = screen.getAllByRole('link', { name: 'Mitt konto' })
    expect(links).toHaveLength(2)
    for (const link of links) expect(link).toHaveAttribute('href', '/mitt-konto')
  })

  it('explains how the rating and title are calculated', () => {
    renderPage()
    expect(screen.getByText(/ju fler spelkonton du länkar/)).toBeInTheDocument()
    expect(screen.getByText(/egen rangordning/)).toBeInTheDocument()
  })
})
