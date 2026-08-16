import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { InfoPage } from './infoPage'

describe('InfoPage', () => {
  it('has a page heading', () => {
    render(<InfoPage />)
    expect(screen.getByRole('heading', { name: 'Kom igång' })).toBeInTheDocument()
  })

  it('explains that Steam login is required to appear at all', () => {
    render(<InfoPage />)
    expect(screen.getByText(/dyker du inte upp i Gubbarna-listan alls/)).toBeInTheDocument()
  })

  it('explains that closed game details mean no stats', () => {
    render(<InfoPage />)
    expect(screen.getByText(/spelinformation är stängd/)).toBeInTheDocument()
  })

  it('explains that the Discord name is entered by hand', () => {
    render(<InfoPage />)
    expect(screen.getByText(/görs för hand/)).toBeInTheDocument()
  })

  it('explains how to link World of Tanks without sharing credentials', () => {
    render(<InfoPage />)
    expect(screen.getByRole('link', { name: 'Länka World of Tanks' })).toHaveAttribute(
      'href',
      '/api/members/wot/login',
    )
    expect(screen.getByText(/inget nick eller lösenord skickas/)).toBeInTheDocument()
  })

  it('explains how the rating and title are calculated', () => {
    render(<InfoPage />)
    expect(screen.getByText(/ju fler spelkonton du länkar/)).toBeInTheDocument()
    expect(screen.getByText(/egen rangordning/)).toBeInTheDocument()
  })
})
