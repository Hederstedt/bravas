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
  // h1 — varje publik rutt ska ha en egen sidrubrik, inte bara h2:orna som
  // hör hemma inuti startsidans sektioner. Se docs/improvmentplan.md Etapp 2.
  it('has a single page heading, level 1', () => {
    renderPage()
    const heading = screen.getByRole('heading', { level: 1 })
    expect(heading).toHaveTextContent('Kom igång med Bravas')
    expect(screen.queryAllByRole('heading', { level: 1 })).toHaveLength(1)
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
