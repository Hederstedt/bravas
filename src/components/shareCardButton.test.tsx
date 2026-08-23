import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShareCardButton } from './shareCardButton'
import * as shareImage from '../shareImage'

afterEach(() => {
  vi.restoreAllMocks()
})

function renderButton() {
  render(<ShareCardButton build={() => '<svg />'} filename="bvs-mag.png" label="Dela kortet" />)
  return screen.getByRole('button', { name: /Dela kortet/ })
}

describe('ShareCardButton', () => {
  it('säger att kortet hamnat i urklippet', async () => {
    const user = userEvent.setup()
    vi.spyOn(shareImage, 'shareCardImage').mockResolvedValue('copied')

    await user.click(renderButton())

    expect(await screen.findByRole('button', { name: /Kopierat/ })).toBeInTheDocument()
  })

  // Utan bildurklipp i webbläsaren blir det en nedladdning i stället — och då
  // ska knappen säga det, inte "Kopierat" om en fil som ligger i en mapp.
  it('säger nedladdat när urklippet inte gick att använda', async () => {
    const user = userEvent.setup()
    vi.spyOn(shareImage, 'shareCardImage').mockResolvedValue('downloaded')

    await user.click(renderButton())

    expect(await screen.findByRole('button', { name: /Nedladdat/ })).toBeInTheDocument()
  })

  it('säger ifrån när bilden inte gick att göra', async () => {
    const user = userEvent.setup()
    vi.spyOn(shareImage, 'shareCardImage').mockResolvedValue('failed')

    await user.click(renderButton())

    expect(await screen.findByRole('button', { name: /Gick inte/ })).toBeInTheDocument()
  })

  it('skickar med filnamnet och kortets byggare', async () => {
    const user = userEvent.setup()
    const share = vi.spyOn(shareImage, 'shareCardImage').mockResolvedValue('copied')

    await user.click(renderButton())

    expect(share).toHaveBeenCalledWith(expect.any(Function), 'bvs-mag.png')
  })

  // Att göra bilden tar en stund. Ett andra klick under tiden ska inte starta
  // om jobbet — kortet blir inte snabbare av att ritas två gånger.
  it('startar inte om jobbet på ett andra klick', async () => {
    const user = userEvent.setup()
    let release: (result: shareImage.ShareResult) => void = () => {}
    const share = vi
      .spyOn(shareImage, 'shareCardImage')
      .mockReturnValue(new Promise((resolve) => (release = resolve)))

    const button = renderButton()
    await user.click(button)
    expect(await screen.findByRole('button', { name: /Gör bilden/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button'))
    expect(share).toHaveBeenCalledTimes(1)

    release('copied')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Kopierat/ })).toBeInTheDocument()
    })
  })
})
