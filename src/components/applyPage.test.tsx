import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import * as api from '../api'
import { ApplyPage } from './applyPage'

const APPLICANT = '76561190000000000'

afterEach(() => {
  vi.restoreAllMocks()
})

// Sökande loggar in med Steam först och ansöker sedan — sessionen finns, men
// ingen rad i rostern.
function stubApi(overrides: { session?: api.Session | null; mine?: api.MyApplication | null } = {}) {
  vi.spyOn(api, 'fetchSession').mockResolvedValue(
    overrides.session === undefined
      ? { steamid64: APPLICANT, isMember: false, isAdmin: false }
      : overrides.session,
  )
  vi.spyOn(api, 'fetchMyApplication').mockResolvedValue(
    overrides.mine === undefined
      ? { status: 'none', personaName: 'Ny Gubbe', avatarUrl: 'https://avatars.example/ny.jpg' }
      : overrides.mine,
  )
}

function renderPage() {
  render(
    <MemoryRouter>
      <ApplyPage />
    </MemoryRouter>,
  )
}

describe('ApplyPage', () => {
  it('has a page heading', async () => {
    stubApi()
    renderPage()
    expect(await screen.findByRole('heading', { name: 'Ansök om att vara med' })).toBeInTheDocument()
  })

  // Att logga in först är hela poängen: då vet vi vilket Steam-konto ansökan
  // gäller, och ingen kan ansöka i någon annans namn.
  it('asks an anonymous visitor to log in with Steam first', async () => {
    stubApi({ session: null, mine: null })
    renderPage()

    const link = await screen.findByRole('link', { name: /logga in med steam/i })
    expect(link).toHaveAttribute('href', api.STEAM_LOGIN_URL)
    expect(screen.queryByRole('button', { name: 'Skicka ansökan' })).not.toBeInTheDocument()
  })

  it('shows which Steam account the application would be for', async () => {
    stubApi()
    renderPage()

    expect(await screen.findByText('Ny Gubbe')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Ny Gubbe' })).toHaveAttribute(
      'src',
      'https://avatars.example/ny.jpg',
    )
  })

  it('sends the message and confirms that it went in', async () => {
    const user = userEvent.setup()
    stubApi()
    const apply = vi.spyOn(api, 'applyForMembership').mockResolvedValue(true)

    renderPage()

    await user.type(await screen.findByLabelText(/Berätta vem du är/), 'Jag lirar med Mag ibland')
    await user.click(screen.getByRole('button', { name: 'Skicka ansökan' }))

    expect(apply).toHaveBeenCalledWith('Jag lirar med Mag ibland')
    expect(await screen.findByText(/ligger inne och väntar/)).toBeInTheDocument()
  })

  it('says so when the application could not be sent', async () => {
    const user = userEvent.setup()
    stubApi()
    vi.spyOn(api, 'applyForMembership').mockResolvedValue(false)

    renderPage()

    await user.type(await screen.findByLabelText(/Berätta vem du är/), 'Släpp in mig')
    await user.click(screen.getByRole('button', { name: 'Skicka ansökan' }))

    expect(await screen.findByText(/kunde inte skickas/)).toBeInTheDocument()
  })

  it('will not send an empty message', async () => {
    const user = userEvent.setup()
    stubApi()
    const apply = vi.spyOn(api, 'applyForMembership').mockResolvedValue(true)

    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Skicka ansökan' }))

    expect(apply).not.toHaveBeenCalled()
  })

  // Ett tomt formulär på återbesöket ser ut som att ansökan slukats.
  it('reports a pending application instead of an empty form', async () => {
    stubApi({ mine: { status: 'pending', personaName: 'Ny Gubbe', avatarUrl: null } })
    renderPage()

    expect(await screen.findByText(/ligger inne och väntar/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Skicka ansökan' })).not.toBeInTheDocument()
  })

  // Godkänd men ännu inte inloggad igen: medlemsraden skapas först vid nästa
  // inloggning, så beskedet måste säga just det.
  it('tells an approved applicant to log in again', async () => {
    stubApi({ mine: { status: 'approved', personaName: 'Ny Gubbe', avatarUrl: null } })
    renderPage()

    expect(await screen.findByText(/logga in med Steam igen/)).toBeInTheDocument()
  })

  it('lets someone who was turned down write a new application', async () => {
    stubApi({ mine: { status: 'rejected', personaName: 'Ny Gubbe', avatarUrl: null } })
    renderPage()

    expect(await screen.findByText(/blev avslagen/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Skicka ansökan' })).toBeInTheDocument()
  })

  it('sends a member who is already in to their account page', async () => {
    stubApi({
      session: { steamid64: APPLICANT, isMember: true, isAdmin: false },
      mine: { status: 'none', personaName: 'Ny Gubbe', avatarUrl: null },
    })
    renderPage()

    expect(await screen.findByRole('link', { name: 'Mitt konto' })).toHaveAttribute(
      'href',
      '/mitt-konto',
    )
    expect(screen.queryByRole('button', { name: 'Skicka ansökan' })).not.toBeInTheDocument()
  })
})
