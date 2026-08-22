import { useCallback, useEffect, useState } from 'react'
import {
  addQuote,
  deleteQuote,
  fetchQuotes,
  toggleQuoteVote,
  MAX_QUOTE_LENGTH,
  MAX_SAID_BY_LENGTH,
  type Quote,
} from '../api'
import { useLiveEvent } from '../useLiveEvents'
import { useSession } from '../useSession'
import { TrophyIcon } from './icons'

export function Quotes() {
  const [quotes, setQuotes] = useState<Quote[]>([])
  // Delad med Nav/SteamLogin/Roster i stället för ett eget anrop — se
  // useSession.ts. !! ger false både under laddning (undefined) och för en
  // anonym besökare (null), precis som den gamla lokala useState(false) gjorde.
  const signedIn = !!useSession()
  const [text, setText] = useState('')
  const [saidBy, setSaidBy] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Vilket citat som väntar på en bekräftelse av raderingen.
  const [confirming, setConfirming] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    void fetchQuotes().then((q) => {
      if (!cancelled) setQuotes(q)
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

  // Radering är inte ångerbar, så den kräver ett andra klick i stället för en
  // dialogruta — samma mönster som resten av sajten, och den som råkar nudda
  // knappen på mobilen tappar inte sitt citat.
  async function remove(id: number) {
    if (confirming !== id) {
      setConfirming(id)
      return
    }
    setConfirming(null)
    if (!(await deleteQuote(id))) {
      setError('Citatet kunde inte tas bort. Försök igen.')
      return
    }
    setQuotes((current) => current.filter((q) => q.id !== id))
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
                  {q.mine && (
                    <button
                      type="button"
                      className={`quote-delete${confirming === q.id ? ' confirming' : ''}`}
                      onClick={() => void remove(q.id)}
                      onBlur={() => setConfirming((c) => (c === q.id ? null : c))}
                    >
                      {confirming === q.id ? 'Säkert?' : 'Ta bort'}
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
