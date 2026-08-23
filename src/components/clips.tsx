import { useCallback, useEffect, useState } from 'react'
import {
  addClip,
  deleteClip,
  fetchClipsResult,
  toggleClipVote,
  MAX_CLIP_TITLE_LENGTH,
  type Clip,
} from '../api'
import { clipEmbedUrl, providerLabel } from '../clipEmbed'
import { useSectionStatus } from '../useApiOutage'
import { useLiveEvent } from '../useLiveEvents'
import { useSession } from '../useSession'
import { TrophyIcon } from './icons'

// Felkoderna från servern är användbar information och inte bara ett nej: den
// som klistrat in en Streamable-länk ska få veta vilka tjänster som går, och
// den som lagt upp ett klipp någon annan redan lagt upp ska få veta det.
const ADD_ERRORS: Record<string, string> = {
  url_unsupported: 'Länken går inte att bädda in. Det måste vara YouTube, Twitch eller Medal.',
  already_added: 'Det klippet ligger redan uppe.',
  title_required: 'Skriv en rubrik så folk vet vad de klickar på.',
  title_too_long: 'Rubriken är för lång.',
}

// Ingenting hämtas från YouTube, Twitch eller Medal förrän besökaren klickat.
// Sajten har ingen egen spårning, och då ska den inte bjuda in någon annans i
// onödan heller — inte ens en förhandsbild, som också är ett anrop dit.
function Player({ clip }: { clip: Clip }) {
  const [playing, setPlaying] = useState(false)
  const src = playing ? clipEmbedUrl(clip.provider, clip.videoId, window.location.hostname) : null

  if (!src) {
    return (
      <button type="button" className="clip-poster" onClick={() => setPlaying(true)}>
        <span className="clip-play" aria-hidden="true">
          ▶
        </span>
        <span className="clip-play-label">Spela klippet</span>
        <span className="clip-provider-note">Laddas först när du klickar</span>
      </button>
    )
  }

  return (
    <iframe
      className="clip-frame"
      src={src}
      title={clip.title}
      allow="autoplay; fullscreen; encrypted-media"
      allowFullScreen
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  )
}

export function Clips() {
  const [clips, setClips] = useState<Clip[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [retryTick, setRetryTick] = useState(0)
  const signedIn = !!useSession()

  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [confirming, setConfirming] = useState<number | null>(null)

  // Samma val som citatväggen: statusen går aldrig tillbaka till 'loading', så
  // en laddningstext blinkar inte förbi varje gång någon annan röstar.
  useEffect(() => {
    let cancelled = false
    void fetchClipsResult().then((result) => {
      if (cancelled) return
      if (result.ok) {
        setClips(result.data)
        setStatus('ready')
      } else {
        setStatus('error')
      }
    })
    return () => {
      cancelled = true
    }
  }, [retryTick])

  const reload = useCallback(() => setRetryTick((t) => t + 1), [])
  useLiveEvent('clip', reload)

  const covered = useSectionStatus('klippen', status === 'error', reload)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim() || !title.trim() || saving) return

    setSaving(true)
    setError('')
    const result = await addClip(url.trim(), title.trim())
    setSaving(false)

    if (!result.ok) {
      setError(ADD_ERRORS[result.error] ?? 'Klippet kunde inte sparas. Försök igen.')
      return
    }
    setClips((current) => [result.clip, ...current])
    setUrl('')
    setTitle('')
  }

  async function vote(id: number) {
    const result = await toggleClipVote(id)
    // Gick rösten inte fram lämnas siffran orörd hellre än att visa en
    // uppräkning som inte finns på servern.
    if (!result) return
    setClips((current) => current.map((c) => (c.id === id ? { ...c, votes: result.votes } : c)))
  }

  async function remove(id: number) {
    if (confirming !== id) {
      setConfirming(id)
      return
    }
    setConfirming(null)
    if (!(await deleteClip(id))) {
      setError('Klippet kunde inte tas bort. Försök igen.')
      return
    }
    setClips((current) => current.filter((c) => c.id !== id))
  }

  return (
    <section id="klippen">
      <div className="container">
        <div className="section-head">
          <span className="index">05</span>
          <h2>Klippen</h2>
        </div>

        {signedIn ? (
          <form className="quote-form clip-form" onSubmit={submit}>
            <label>
              Länk till klippet
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://youtu.be/…"
              />
            </label>
            <label>
              Vad händer?
              <input
                value={title}
                maxLength={MAX_CLIP_TITLE_LENGTH}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Lasse ess på Mirage"
              />
            </label>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Sparar…' : 'Lägg till klipp'}
            </button>
            {error && <p className="quote-error">{error}</p>}
          </form>
        ) : (
          <p className="roster-note">
            Logga in med Steam för att lägga till och rösta på klipp.
          </p>
        )}

        {status === 'loading' && (
          <p className="roster-note route-loading" role="status">
            Hämtar klippen…
          </p>
        )}

        {status === 'error' &&
          (covered ? (
            <p className="roster-note">Kunde inte hämta klippen just nu.</p>
          ) : (
            <div className="roster-error">
              <p className="roster-note" role="alert">
                Kunde inte hämta klippen just nu. Kika in igen om en stund.
              </p>
              <button type="button" className="btn btn-ghost" onClick={reload}>
                Försök igen
              </button>
            </div>
          ))}

        {status === 'ready' && clips.length === 0 && (
          <p className="roster-note">
            Inga klipp ännu — lägg upp det där ess:et innan någon hinner glömma det.
          </p>
        )}

        {clips.length > 0 && (
          <div className="clip-grid">
            {clips.map((clip) => (
              <article key={clip.id} className="clip-card">
                <Player clip={clip} />
                <h3 className="clip-title">{clip.title}</h3>
                <div className="clip-foot">
                  <span className="clip-provider">{providerLabel(clip.provider)}</span>
                  <span className="quote-votes">
                    <TrophyIcon />
                    {clip.votes}
                  </span>
                  {signedIn && (
                    <button type="button" className="quote-vote" onClick={() => void vote(clip.id)}>
                      Rösta
                    </button>
                  )}
                  {clip.mine && (
                    <button
                      type="button"
                      className={`quote-delete${confirming === clip.id ? ' confirming' : ''}`}
                      onClick={() => void remove(clip.id)}
                      onBlur={() => setConfirming((c) => (c === clip.id ? null : c))}
                    >
                      {confirming === clip.id ? 'Säkert?' : 'Ta bort'}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
