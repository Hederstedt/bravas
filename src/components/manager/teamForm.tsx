import { useState } from 'react'
import { createTeam, MAX_TEAM_NAME } from '../../api'

// Säsongen är igång men managern har inget lag ännu — ett per gubbe och säsong.
export function TeamForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || saving) return

    setSaving(true)
    setError('')
    const result = await createTeam(name.trim())
    setSaving(false)

    if (!result.ok) {
      // Kapplöpning mellan två flikar: laget finns redan — hämta om vyn så
      // syns det, i stället för att lämna managern i ett dött formulär.
      setError(
        result.error === 'already_has_team'
          ? 'Du har redan ett lag i den här säsongen.'
          : (result.message ?? 'Laget kunde inte skapas. Försök igen.'),
      )
      if (result.error === 'already_has_team') onCreated()
      return
    }
    onCreated()
  }

  return (
    <div className="manager-block">
      <h3>Döp ditt lag</h3>
      <form className="quote-form" onSubmit={submit}>
        <label>
          Lagnamn
          <input
            value={name}
            maxLength={MAX_TEAM_NAME}
            onChange={(e) => setName(e.target.value)}
            placeholder="FC Träklubban"
          />
        </label>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Skapar…' : 'Skapa laget'}
        </button>
        {error && <p className="quote-error">{error}</p>}
      </form>
    </div>
  )
}
