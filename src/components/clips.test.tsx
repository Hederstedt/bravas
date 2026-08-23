import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Clips } from './clips'
import * as api from '../api'
import { installLiveEvents, teardownLiveEvents } from '../test/liveEvents'
import { resetApiOutage } from '../useApiOutage'
import { resetSessionCache } from '../useSession'

const CLIP: api.Clip = {
  id: 1,
  provider: 'youtube',
  videoId: 'dQw4w9WgXcQ',
  title: 'Lasse ess på Mirage',
  createdAt: 1_700_000_000_000,
  votes: 3,
  mine: false,
}

const MY_CLIP: api.Clip = { ...CLIP, id: 2, title: 'Mitt eget klipp', mine: true }

const MEMBER = { steamid64: '76561198060166361', isMember: true, isAdmin: false }

beforeEach(() => {
  installLiveEvents()
  resetApiOutage()
  resetSessionCache()
})

afterEach(() => {
  teardownLiveEvents()
  vi.restoreAllMocks()
})

function renderClips(clips: api.Clip[], session: api.Session | null = null) {
  vi.spyOn(api, 'fetchClipsResult').mockResolvedValue({ ok: true, data: clips })
  vi.spyOn(api, 'fetchSession').mockResolvedValue(session)
  render(<Clips />)
}

describe('Klippen', () => {
  it('visar rubriken och vilken tjänst klippet ligger på', async () => {
    renderClips([CLIP])

    const card = (await screen.findByText('Lasse ess på Mirage')).closest('article')!
    expect(within(card).getByText('YouTube')).toBeInTheDocument()
    expect(within(card).getByText('3')).toBeInTheDocument()
  })

  // Sajten har ingen egen spårning och ska inte bjuda in någon annans i onödan.
  // Ingenting hämtas från YouTube eller Twitch förrän besökaren har bett om det.
  it('laddar ingen spelare förrän någon klickat på spela', async () => {
    const user = userEvent.setup()
    renderClips([CLIP])

    const card = (await screen.findByText('Lasse ess på Mirage')).closest('article')!
    expect(card.querySelector('iframe')).toBeNull()

    await user.click(within(card).getByRole('button', { name: /Spela/ }))

    await waitFor(() => expect(card.querySelector('iframe')).not.toBeNull())
  })

  it('bygger spelarens adress ur leverantör och id', async () => {
    const user = userEvent.setup()
    renderClips([CLIP])

    const card = (await screen.findByText('Lasse ess på Mirage')).closest('article')!
    await user.click(within(card).getByRole('button', { name: /Spela/ }))

    const frame = await waitFor(() => card.querySelector('iframe')!)
    expect(frame.getAttribute('src')).toContain('youtube-nocookie.com/embed/dQw4w9WgXcQ')
    expect(frame.getAttribute('title')).toBe('Lasse ess på Mirage')
  })

  it('säger till att galleriet är tomt i stället för att visa ingenting', async () => {
    renderClips([])

    expect(await screen.findByText(/Inga klipp ännu/)).toBeInTheDocument()
  })

  it('ber den utloggade logga in i stället för att visa formuläret', async () => {
    renderClips([CLIP])

    await screen.findByText('Lasse ess på Mirage')
    expect(screen.queryByRole('button', { name: /Lägg till klipp/ })).not.toBeInTheDocument()
    expect(screen.getByText(/Logga in med Steam för att lägga till/)).toBeInTheDocument()
  })
})

describe('att lägga till ett klipp', () => {
  async function fillAndSubmit(url: string, title: string) {
    const user = userEvent.setup()
    await user.type(await screen.findByLabelText('Länk till klippet'), url)
    await user.type(screen.getByLabelText('Vad händer?'), title)
    await user.click(screen.getByRole('button', { name: /Lägg till klipp/ }))
  }

  it('lägger till klippet och visar det direkt', async () => {
    renderClips([], MEMBER)
    const add = vi
      .spyOn(api, 'addClip')
      .mockResolvedValue({ ok: true, clip: { ...CLIP, title: 'Nytt klipp' } })

    await fillAndSubmit('https://youtu.be/dQw4w9WgXcQ', 'Nytt klipp')

    expect(add).toHaveBeenCalledWith('https://youtu.be/dQw4w9WgXcQ', 'Nytt klipp')
    expect(await screen.findByText('Nytt klipp')).toBeInTheDocument()
  })

  // Felkoden från servern är användbar information — "den tjänsten bäddar vi
  // inte in" och "det ligger redan uppe" är olika problem med olika lösningar.
  it('säger vilken tjänst som går att lägga upp när länken inte dög', async () => {
    renderClips([], MEMBER)
    vi.spyOn(api, 'addClip').mockResolvedValue({ ok: false, error: 'url_unsupported' })

    await fillAndSubmit('https://gubbar.se/klipp.mp4', 'Nytt klipp')

    expect(await screen.findByText(/YouTube, Twitch eller Medal/)).toBeInTheDocument()
  })

  it('säger ifrån när klippet redan ligger uppe', async () => {
    renderClips([], MEMBER)
    vi.spyOn(api, 'addClip').mockResolvedValue({ ok: false, error: 'already_added' })

    await fillAndSubmit('https://youtu.be/dQw4w9WgXcQ', 'Nytt klipp')

    expect(await screen.findByText(/ligger redan uppe/)).toBeInTheDocument()
  })
})

describe('rösta och ta bort', () => {
  it('uppdaterar räknaren när någon röstar', async () => {
    const user = userEvent.setup()
    renderClips([CLIP], MEMBER)
    vi.spyOn(api, 'toggleClipVote').mockResolvedValue({ votes: 4, voted: true })

    await user.click(await screen.findByRole('button', { name: /Rösta/ }))

    expect(await screen.findByText('4')).toBeInTheDocument()
  })

  it('erbjuder bara raderingsknappen på dina egna klipp', async () => {
    renderClips([CLIP, MY_CLIP], MEMBER)

    const mine = (await screen.findByText('Mitt eget klipp')).closest('article')!
    const theirs = screen.getByText('Lasse ess på Mirage').closest('article')!
    expect(within(mine).getByRole('button', { name: 'Ta bort' })).toBeInTheDocument()
    expect(within(theirs).queryByRole('button', { name: 'Ta bort' })).not.toBeInTheDocument()
  })

  // Radering går inte att ångra, så första klicket frågar bara — samma mönster
  // som citatväggen.
  it('frågar en gång innan klippet försvinner', async () => {
    const user = userEvent.setup()
    renderClips([MY_CLIP], MEMBER)
    const remove = vi.spyOn(api, 'deleteClip').mockResolvedValue(true)

    await user.click(await screen.findByRole('button', { name: 'Ta bort' }))
    expect(remove).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Säkert?' }))
    expect(remove).toHaveBeenCalledWith(MY_CLIP.id)
    await waitFor(() => {
      expect(screen.queryByText('Mitt eget klipp')).not.toBeInTheDocument()
    })
  })
})

describe('när API:et inte svarar', () => {
  it('säger att klippen inte gick att hämta, med en väg tillbaka', async () => {
    vi.spyOn(api, 'fetchClipsResult').mockResolvedValue({ ok: false })
    vi.spyOn(api, 'fetchSession').mockResolvedValue(null)

    render(<Clips />)

    expect(await screen.findByText(/Kunde inte hämta klippen/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Försök igen/ })).toBeInTheDocument()
    expect(screen.queryByText(/Inga klipp ännu/)).not.toBeInTheDocument()
  })
})
