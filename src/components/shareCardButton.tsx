import { useEffect, useRef, useState } from 'react'
import { shareCardImage, type ShareResult } from '../shareImage'

// Knappen som gör kortet till en bild man kan klistra in i Discorden. Samma
// mönster som CopyButton på Valheim-kortet: knappen kvitterar i sig själv i
// stället för att lägga en ruta någonstans på sidan, och går tillbaka till
// sitt vanliga jag efter ett par sekunder.
const SETTLE_MS = 2500

const RESULT_LABEL: Record<ShareResult, string> = {
  copied: 'Kopierat ✓',
  // "Kopierat" hade varit en osanning om en fil som ligger i nedladdningar.
  downloaded: 'Nedladdat ✓',
  failed: 'Gick inte',
}

export function ShareCardButton({
  build,
  filename,
  label,
}: {
  build: (fontFace: string) => string
  filename: string
  label: string
}) {
  const [state, setState] = useState<'idle' | 'working' | ShareResult>('idle')
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  async function share() {
    // Bilden tar en stund att rita. Ett andra klick under tiden ska inte
    // starta om jobbet.
    if (state === 'working') return

    setState('working')
    const result = await shareCardImage(build, filename)
    setState(result)

    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setState('idle'), SETTLE_MS)
  }

  const text =
    state === 'idle' ? label : state === 'working' ? 'Gör bilden…' : RESULT_LABEL[state]

  return (
    <button
      type="button"
      className={`btn btn-ghost share-card-btn${state === 'copied' || state === 'downloaded' ? ' done' : ''}`}
      onClick={() => void share()}
      aria-live="polite"
    >
      {text}
    </button>
  )
}
