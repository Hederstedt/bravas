import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import App from './App'

// Routern bor i main.tsx, så App kan renderas i en MemoryRouter med valfri
// startadress — det är hela poängen med uppdelningen.
function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

describe('routing', () => {
  it('renders the section page on /', () => {
    renderAt('/')
    expect(screen.getByRole('heading', { name: 'Bravas' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Gubbarna' })).toBeInTheDocument()
  })

  it('renders the manager page on /manager', () => {
    renderAt('/manager')
    expect(screen.getByRole('heading', { name: 'Manager' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Bravas' })).not.toBeInTheDocument()
  })

  it('redirects unknown paths to the start page', () => {
    renderAt('/finns-inte')
    expect(screen.getByRole('heading', { name: 'Bravas' })).toBeInTheDocument()
  })

  it('keeps nav and footer on every page', () => {
    renderAt('/manager')
    expect(screen.getByRole('link', { name: /BVS/ })).toBeInTheDocument()
    expect(screen.getByText(/Hostad i ett garage/)).toBeInTheDocument()
  })

  it('the nav links to the manager page', () => {
    renderAt('/')
    const links = screen.getAllByRole('link', { name: 'Manager' })
    expect(links[0]).toHaveAttribute('href', '/manager')
  })
})
