import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Quotes } from './quotes'
import * as api from '../api'
import { emitLiveEvent, installLiveEvents, teardownLiveEvents } from '../test/liveEvents'
import { resetSessionCache } from '../useSession'

beforeEach(() => {
  installLiveEvents()
  resetSessionCache()
})

afterEach(() => {
  teardownLiveEvents()
  vi.restoreAllMocks()
})

const QUOTE: api.Quote = {
  id: 1,
  text: 'Jag hade ju träklubban',
  saidBy: 'Gubbe #6',
  createdAt: 1_700_000_000_000,
  votes: 3,
  mine: false,
}

// Samma citat, fast inskickat av den som tittar — då finns en raderingsknapp.
const MY_QUOTE: api.Quote = { ...QUOTE, id: 2, text: 'Mitt eget citat', mine: true }

describe('Quotes', () => {
  it('lists the quotes with their attribution and vote count', async () => {
    vi.spyOn(api, 'fetchQuotes').mockResolvedValue([QUOTE])
    vi.spyOn(api, 'fetchSession').mockResolvedValue(null)

    render(<Quotes />)

    const card = (await screen.findByText(/Jag hade ju träklubban/)).closest('article')!
    expect(within(card).getByText(/Gubbe #6/)).toBeInTheDocument()
    expect(within(card).getByText('3')).toBeInTheDocument()
  })

  it('invites the visitor to log in instead of showing a form', async () => {
    vi.spyOn(api, 'fetchQuotes').mockResolvedValue([QUOTE])
    vi.spyOn(api, 'fetchSession').mockResolvedValue(null)

    render(<Quotes />)

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Spara citat/ })).not.toBeInTheDocument()
    })
    expect(screen.getByText(/Logga in med Steam för att lägga till/)).toBeInTheDocument()
  })

  it('says the wall is empty rather than showing nothing', async () => {
    vi.spyOn(api, 'fetchQuotes').mockResolvedValue([])
    vi.spyOn(api, 'fetchSession').mockResolvedValue(null)

    render(<Quotes />)

    expect(await screen.findByText(/Inga citat ännu/)).toBeInTheDocument()
  })

  it('lets a signed-in member add a quote and shows it straight away', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'fetchQuotes').mockResolvedValue([])
    vi.spyOn(api, 'fetchSession').mockResolvedValue({ steamid64: '76561198060166361', isMember: true, isAdmin: false })
    const add = vi.spyOn(api, 'addQuote').mockResolvedValue({
      id: 7,
      text: 'Rush B',
      saidBy: 'Kungalv',
      createdAt: 1,
      votes: 0,
      mine: true,
    })

    render(<Quotes />)

    await user.type(await screen.findByLabelText('Citat'), 'Rush B')
    await user.type(screen.getByLabelText('Vem sa det?'), 'Kungalv')
    await user.click(screen.getByRole('button', { name: /Spara citat/ }))

    expect(add).toHaveBeenCalledWith('Rush B', 'Kungalv')
    expect(await screen.findByText(/Rush B/)).toBeInTheDocument()
  })

  it('refuses to submit an empty quote', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'fetchQuotes').mockResolvedValue([])
    vi.spyOn(api, 'fetchSession').mockResolvedValue({ steamid64: '1', isMember: true, isAdmin: false })
    const add = vi.spyOn(api, 'addQuote').mockResolvedValue(null)

    render(<Quotes />)

    await user.click(await screen.findByRole('button', { name: /Spara citat/ }))
    expect(add).not.toHaveBeenCalled()
  })

  it('updates the count when a member votes', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'fetchQuotes').mockResolvedValue([QUOTE])
    vi.spyOn(api, 'fetchSession').mockResolvedValue({ steamid64: '1', isMember: true, isAdmin: false })
    vi.spyOn(api, 'toggleQuoteVote').mockResolvedValue({ votes: 4, voted: true })

    render(<Quotes />)

    await user.click(await screen.findByRole('button', { name: /Rösta/ }))
    expect(await screen.findByText('4')).toBeInTheDocument()
  })

  // Väggen ska inte se trasig ut för att en röst inte gick fram.
  it('leaves the count alone when the vote fails', async () => {
    const user = userEvent.setup()
    vi.spyOn(api, 'fetchQuotes').mockResolvedValue([QUOTE])
    vi.spyOn(api, 'fetchSession').mockResolvedValue({ steamid64: '1', isMember: true, isAdmin: false })
    vi.spyOn(api, 'toggleQuoteVote').mockResolvedValue(null)

    render(<Quotes />)

    await user.click(await screen.findByRole('button', { name: /Rösta/ }))
    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument()
    })
  })

  it('does not offer voting to anonymous visitors', async () => {
    vi.spyOn(api, 'fetchQuotes').mockResolvedValue([QUOTE])
    vi.spyOn(api, 'fetchSession').mockResolvedValue(null)

    render(<Quotes />)

    await screen.findByText(/Jag hade ju träklubban/)
    expect(screen.queryByRole('button', { name: /Rösta/ })).not.toBeInTheDocument()
  })

  // Skriver man ett citat med stavfel ska det gå att ta bort. Servern raderar
  // bara egna citat, och `mine` avgör vilka kort som får knappen.
  describe('removing your own quote', () => {
    it('offers the button only on your own quotes', async () => {
      vi.spyOn(api, 'fetchQuotes').mockResolvedValue([QUOTE, MY_QUOTE])
      vi.spyOn(api, 'fetchSession').mockResolvedValue({ steamid64: '1', isMember: true, isAdmin: false })

      render(<Quotes />)

      const mine = (await screen.findByText('Mitt eget citat')).closest('article')!
      const theirs = screen.getByText(/Jag hade ju träklubban/).closest('article')!
      expect(within(mine).getByRole('button', { name: 'Ta bort' })).toBeInTheDocument()
      expect(within(theirs).queryByRole('button', { name: 'Ta bort' })).not.toBeInTheDocument()
    })

    // Radering går inte att ångra, så första klicket frågar bara.
    it('asks once before actually removing it', async () => {
      const user = userEvent.setup()
      vi.spyOn(api, 'fetchQuotes').mockResolvedValue([MY_QUOTE])
      vi.spyOn(api, 'fetchSession').mockResolvedValue({ steamid64: '1', isMember: true, isAdmin: false })
      const remove = vi.spyOn(api, 'deleteQuote').mockResolvedValue(true)

      render(<Quotes />)

      await user.click(await screen.findByRole('button', { name: 'Ta bort' }))
      expect(remove).not.toHaveBeenCalled()

      await user.click(screen.getByRole('button', { name: 'Säkert?' }))
      expect(remove).toHaveBeenCalledWith(MY_QUOTE.id)
      await waitFor(() => {
        expect(screen.queryByText('Mitt eget citat')).not.toBeInTheDocument()
      })
    })

    it('keeps the quote and says so when the removal fails', async () => {
      const user = userEvent.setup()
      vi.spyOn(api, 'fetchQuotes').mockResolvedValue([MY_QUOTE])
      vi.spyOn(api, 'fetchSession').mockResolvedValue({ steamid64: '1', isMember: true, isAdmin: false })
      vi.spyOn(api, 'deleteQuote').mockResolvedValue(false)

      render(<Quotes />)

      await user.click(await screen.findByRole('button', { name: 'Ta bort' }))
      await user.click(screen.getByRole('button', { name: 'Säkert?' }))

      expect(await screen.findByText(/kunde inte tas bort/)).toBeInTheDocument()
      expect(screen.getByText('Mitt eget citat')).toBeInTheDocument()
    })
  })

  // React escapar automatiskt — testet finns för att fånga om någon senare
  // byter till dangerouslySetInnerHTML.
  it('renders markup in a quote as text, never as HTML', async () => {
    vi.spyOn(api, 'fetchQuotes').mockResolvedValue([
      { ...QUOTE, text: '<img src=x onerror=alert(1)>' },
    ])
    vi.spyOn(api, 'fetchSession').mockResolvedValue(null)

    const { container } = render(<Quotes />)

    expect(await screen.findByText(/<img src=x onerror=alert\(1\)>/)).toBeInTheDocument()
    expect(container.querySelector('img')).toBeNull()
  })
})

describe('the wall keeping itself current', () => {
  it('picks up a quote someone else added, without a reload', async () => {
    const fetchQuotes = vi.spyOn(api, 'fetchQuotes').mockResolvedValue([QUOTE])
    vi.spyOn(api, 'fetchSession').mockResolvedValue(null)

    render(<Quotes />)
    await screen.findByText(/Jag hade ju träklubban/)

    const added = { ...QUOTE, id: 2, text: 'Rush B, tänk inte', saidBy: 'Gubbe #1', votes: 0 }
    fetchQuotes.mockResolvedValue([QUOTE, added])

    act(() => emitLiveEvent('quote', { reason: 'added' }))

    expect(await screen.findByText(/Rush B, tänk inte/)).toBeInTheDocument()
  })

  it('picks up a vote cast in another tab', async () => {
    const fetchQuotes = vi.spyOn(api, 'fetchQuotes').mockResolvedValue([QUOTE])
    vi.spyOn(api, 'fetchSession').mockResolvedValue(null)

    render(<Quotes />)
    const card = (await screen.findByText(/Jag hade ju träklubban/)).closest('article')!
    expect(within(card).getByText('3')).toBeInTheDocument()

    fetchQuotes.mockResolvedValue([{ ...QUOTE, votes: 4 }])
    act(() => emitLiveEvent('quote', { reason: 'voted', id: 1 }))

    await waitFor(() => expect(within(card).getByText('4')).toBeInTheDocument())
  })
})
