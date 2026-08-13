import { useCallback, useEffect, useState } from 'react'
import {
  addQuote,
  fetchQuotes,
  fetchSession,
  toggleQuoteVote,
  MAX_QUOTE_LENGTH,
  MAX_SAID_BY_LENGTH,
  type Quote,
} from '../api'
import { useLiveEvent } from '../useLiveEvents'
import { TrophyIcon } from './icons'

export function Quotes() {
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [signedIn, setSignedIn] = useState(false)
  const [text, setText] = useState('')
  const [saidBy, setSaidBy] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    void fetchQuotes().then((q) => {
      if (!cancelled) setQuotes(q)
    })
    void fetchSession().then((s) => {
      if (!cancelled) setSignedIn(s !== null)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Någon annan har skrivit, röstat eller raderat. Hämta om väggen så att den
  // som redan har sidan öppen ser det utan att ladda om.
  const reload = useCallback(() => {
    void fetchQuotes().then(setQuotes)
  }, [])
  useLiveEvent('quote', reload)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim() || !saidBy.trim() || saving) return

    setSaving(true)
    setError('')
    const created = await addQuote(text.trim(), saidBy.trim())
    setSaving(false)

    if (!created) {
      setError('Citatet kunde inte sparas. Försök igen.')
      return
    }
    setQuotes((current) => [created, ...current])
    setText('')
    setSaidBy('')
  }

  async function vote(id: number) {
    const result = await toggleQuoteVote(id)
    // Gick rösten inte fram lämnas siffran orörd hellre än att visa en
    // uppräkning som inte finns på servern.
    if (!result) return
    setQuotes((current) => current.map((q) => (q.id === id ? { ...q, votes: result.votes } : q)))
  }

  return (
    <section id="citat">
      <div className="container">
        <div className="section-head">
          <span className="index">04</span>
          <h2>Citatväggen</h2>
        </div>

        {signedIn ? (
          <form className="quote-form" onSubmit={submit}>
            <label>
              Citat
              <input
                value={text}
                maxLength={MAX_QUOTE_LENGTH}
                onChange={(e) => setText(e.target.value)}
                placeholder="Jag hade ju träklubban"
              />
            </label>
            <label>
              Vem sa det?
              <input
                value={saidBy}
                maxLength={MAX_SAID_BY_LENGTH}
                onChange={(e) => setSaidBy(e.target.value)}
                placeholder="Gubbe"
              />
            </label>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Sparar…' : 'Spara citat'}
            </button>
            {error && <p className="quote-error">{error}</p>}
          </form>
        ) : (
          <p className="roster-note">Logga in med Steam för att lägga till och rösta på citat.</p>
        )}

        {quotes.length === 0 ? (
          <p className="roster-note">Inga citat ännu — först till kvarn.</p>
        ) : (
          <div className="quote-grid">
            {quotes.map((q) => (
              <article key={q.id} className="quote-card">
                <blockquote>{q.text}</blockquote>
                <p className="quote-said-by">— {q.saidBy}</p>
                <div className="quote-foot">
                  <span className="quote-votes">
                    <TrophyIcon />
                    {q.votes}
                  </span>
                  {signedIn && (
                    <button type="button" className="quote-vote" onClick={() => void vote(q.id)}>
                      Rösta
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
