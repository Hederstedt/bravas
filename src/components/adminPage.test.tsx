import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import * as api from '../api'
import { AdminPage } from './adminPage'

const ADMIN = '76561190000000009'
const MEMBER = '76561198053832683'
const APPLICANT = '76561190000000000'

const WAITING: api.Application = {
  steamid64: APPLICANT,
  personaName: 'Ny Gubbe',
  avatarUrl: null,
  message: 'Jag lirar med Mag ibland',
  status: 'pending',
  createdAt: 1_700_000_000_000,
}

const MEMBERS: api.AdminMember[] = [
  { steamid64: ADMIN, personaName: '[BVS] Chefen', avatarUrl: null },
  { steamid64: MEMBER, personaName: '[BVS] #Mag', avatarUrl: null },
]

afterEach(() => {
  vi.restoreAllMocks()
})

function stubApi(
  overrides: {
    session?: api.Session | null
    applications?: api.Application[]
    members?: api.AdminMember[]
  } = {},
) {
  vi.spyOn(api, 'fetchSession').mockResolvedValue(
    overrides.session === undefined
      ? { steamid64: ADMIN, isMember: true, isAdmin: true }
      : overrides.session,
  )
  vi.spyOn(api, 'fetchApplications').mockResolvedValue(overrides.applications ?? [WAITING])
  vi.spyOn(api, 'fetchAdminMembers').mockResolvedValue(overrides.members ?? MEMBERS)
  vi.spyOn(api, 'fetchMonthlyStatus').mockResolvedValue({ month: '2026-08', standings: [], lastMonth: null })
}

function renderPage() {
  render(
    <MemoryRouter>
      <AdminPage />
    </MemoryRouter>,
  )
}

function memberRow(name: string) {
  return screen.getByText(name).closest('li')!
}

describe('AdminPage', () => {
  it('lists what is waiting for an answer', async () => {
    stubApi()
    renderPage()

    expect(await screen.findByText('Ny Gubbe')).toBeInTheDocument()
    expect(screen.getByText('Jag lirar med Mag ibland')).toBeInTheDocument()
  })

  it('lists the members with a way to remove them', async () => {
    stubApi()
    renderPage()

    await screen.findByText('[BVS] #Mag')
    expect(within(memberRow('[BVS] #Mag')).getByRole('button', { name: 'Ta bort' })).toBeInTheDocument()
  })

  // Adminen kan inte ta bort sig själv — servern svarar 400, så knappen ska
  // inte ens finnas och lova något den inte kan hålla.
  it('offers no remove button for the admin themselves', async () => {
    stubApi()
    renderPage()

    await screen.findByText('[BVS] Chefen')
    expect(within(memberRow('[BVS] Chefen')).queryByRole('button', { name: 'Ta bort' })).not.toBeInTheDocument()
  })

  it('says so when nothing is waiting', async () => {
    stubApi({ applications: [] })
    renderPage()

    expect(await screen.findByText(/Inga ansökningar just nu/)).toBeInTheDocument()
  })
})

describe('the admin gate', () => {
  // Servern gatear oberoende av vad frontenden ritar. Sidan ska ändå säga vad
  // som gäller i stället för att visa en tom lista som ser trasig ut.
  it('turns away an ordinary member who typed the address', async () => {
    stubApi({ session: { steamid64: MEMBER, isMember: true, isAdmin: false } })
    renderPage()

    expect(await screen.findByText(/bara för admin/)).toBeInTheDocument()
    expect(screen.queryByText('Ny Gubbe')).not.toBeInTheDocument()
  })

  it('turns away an anonymous visitor', async () => {
    stubApi({ session: null })
    renderPage()

    expect(await screen.findByText(/bara för admin/)).toBeInTheDocument()
  })

  it('never asks the API for anything it is not allowed to see', async () => {
    stubApi({ session: { steamid64: MEMBER, isMember: true, isAdmin: false } })
    renderPage()

    await screen.findByText(/bara för admin/)
    expect(api.fetchApplications).not.toHaveBeenCalled()
  })
})

describe('deciding on an application', () => {
  it('approves and drops it off the waiting list', async () => {
    const user = userEvent.setup()
    stubApi()
    const approve = vi.spyOn(api, 'approveApplication').mockResolvedValue(true)

    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Godkänn' }))

    expect(approve).toHaveBeenCalledWith(APPLICANT)
    await waitFor(() => expect(screen.queryByText('Jag lirar med Mag ibland')).not.toBeInTheDocument())
  })

  it('rejects without touching the allowlist', async () => {
    const user = userEvent.setup()
    stubApi()
    const reject = vi.spyOn(api, 'rejectApplication').mockResolvedValue(true)

    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Avslå' }))

    expect(reject).toHaveBeenCalledWith(APPLICANT)
  })

  it('says so when the decision did not go through', async () => {
    const user = userEvent.setup()
    stubApi()
    vi.spyOn(api, 'approveApplication').mockResolvedValue(false)

    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Godkänn' }))

    expect(await screen.findByText(/gick inte igenom/)).toBeInTheDocument()
  })

  // En godkänd ansökan ger ingen medlemsrad förrän de loggar in igen, och det
  // ska stå på sidan så ingen undrar vart de tog vägen.
  it('explains that an approved applicant appears at their next login', async () => {
    stubApi()
    renderPage()

    expect(await screen.findByText(/nästa gång de loggar in/)).toBeInTheDocument()
  })
})

// Uttryckligen efterfrågat: admin ska se att mätningen fungerar innan
// kröningen faktiskt sker.
describe('the monthly standings', () => {
  it('are shown on the admin page', async () => {
    stubApi()
    renderPage()

    expect(await screen.findByRole('heading', { name: 'Månadens BVS:are' })).toBeInTheDocument()
  })
})

describe('removing a member', () => {
  it('asks for a second click before it removes anyone', async () => {
    const user = userEvent.setup()
    stubApi()
    const remove = vi.spyOn(api, 'removeMember').mockResolvedValue(true)

    renderPage()
    await screen.findByText('[BVS] #Mag')
    await user.click(within(memberRow('[BVS] #Mag')).getByRole('button', { name: 'Ta bort' }))

    expect(remove).not.toHaveBeenCalled()
    await user.click(within(memberRow('[BVS] #Mag')).getByRole('button', { name: 'Säkert?' }))
    expect(remove).toHaveBeenCalledWith(MEMBER)
  })

  it('takes the member off the list once it went through', async () => {
    const user = userEvent.setup()
    stubApi()
    vi.spyOn(api, 'removeMember').mockResolvedValue(true)

    renderPage()
    await screen.findByText('[BVS] #Mag')
    await user.click(within(memberRow('[BVS] #Mag')).getByRole('button', { name: 'Ta bort' }))
    await user.click(within(memberRow('[BVS] #Mag')).getByRole('button', { name: 'Säkert?' }))

    await waitFor(() => expect(screen.queryByText('[BVS] #Mag')).not.toBeInTheDocument())
    expect(screen.getByText('[BVS] Chefen')).toBeInTheDocument()
  })

  it('keeps the member and says so when the removal failed', async () => {
    const user = userEvent.setup()
    stubApi()
    vi.spyOn(api, 'removeMember').mockResolvedValue(false)

    renderPage()
    await screen.findByText('[BVS] #Mag')
    await user.click(within(memberRow('[BVS] #Mag')).getByRole('button', { name: 'Ta bort' }))
    await user.click(within(memberRow('[BVS] #Mag')).getByRole('button', { name: 'Säkert?' }))

    expect(await screen.findByText(/gick inte att ta bort/)).toBeInTheDocument()
    expect(screen.getByText('[BVS] #Mag')).toBeInTheDocument()
  })
})
