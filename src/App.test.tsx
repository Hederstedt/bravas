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

  // Manager-rutterna hämtas separat, så de dyker upp först efter att chunken
  // laddats — därav findBy i stället för getBy.
  it('renders the manager page on /manager', async () => {
    renderAt('/manager')
    expect(await screen.findByRole('heading', { name: 'Manager' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Bravas' })).not.toBeInTheDocument()
  })

  it('renders the info page on /kom-igang', () => {
    renderAt('/kom-igang')
    expect(screen.getByRole('heading', { name: 'Kom igång' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Bravas' })).not.toBeInTheDocument()
  })

  // Kontosidan koddelas inte — den är för lätt för en egen chunk, så den finns
  // direkt i stället för efter en Suspense-runda.
  it('renders the account page on /mitt-konto', () => {
    renderAt('/mitt-konto')
    expect(screen.getByRole('heading', { name: 'Mitt konto' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Bravas' })).not.toBeInTheDocument()
  })

  it('redirects unknown paths to the start page', () => {
    renderAt('/finns-inte')
    expect(screen.getByRole('heading', { name: 'Bravas' })).toBeInTheDocument()
  })

  it('keeps nav and footer on every page', async () => {
    renderAt('/manager')
    expect(await screen.findByRole('heading', { name: 'Manager' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /BVS/ })).toBeInTheDocument()
    expect(screen.getByText(/Hostad i ett garage/)).toBeInTheDocument()
  })

  it('the nav links to the manager page', () => {
    renderAt('/')
    const links = screen.getAllByRole('link', { name: 'Manager' })
    expect(links[0]).toHaveAttribute('href', '/manager')
  })

  it('the nav links to the info page', () => {
    renderAt('/')
    const links = screen.getAllByRole('link', { name: 'Kom igång' })
    expect(links[0]).toHaveAttribute('href', '/kom-igang')
  })
})
