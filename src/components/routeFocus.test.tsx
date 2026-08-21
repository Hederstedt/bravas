import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import { RouteFocus } from './routeFocus'

function Home() {
  return (
    <main>
      <h1>Bravas</h1>
      <Link to="/kom-igang">Kom igång</Link>
    </main>
  )
}

function InfoPage() {
  return (
    <main>
      <h1>Kom igång med Bravas</h1>
    </main>
  )
}

function App() {
  return (
    <>
      <RouteFocus />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/kom-igang" element={<InfoPage />} />
      </Routes>
    </>
  )
}

function renderApp(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>,
  )
}

describe('RouteFocus', () => {
  it('leaves focus alone on the very first render', () => {
    renderApp('/')
    expect(document.activeElement).toBe(document.body)
  })

  // En riktig ruttväxling byter ut hela sidans innehåll. Utan att fokus
  // flyttas ligger det kvar på länken som klickades — i den gamla sidans
  // DOM-position — och en skärmläsare säger aldrig vilken sida som laddats.
  it('moves focus to the new page heading after a route change', async () => {
    const user = userEvent.setup()
    renderApp('/')

    await user.click(screen.getByRole('link', { name: 'Kom igång' }))

    const heading = screen.getByRole('heading', { name: 'Kom igång med Bravas' })
    expect(document.activeElement).toBe(heading)
  })
})
