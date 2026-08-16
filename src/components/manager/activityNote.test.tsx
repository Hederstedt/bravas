import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ActivityNote } from './activityNote'
import type { ActivityBonus } from '../../api'

function bonus(over: Partial<ActivityBonus> = {}): ActivityBonus {
  return { hours: { cs2: 0, other: 0 }, training: 0, transfer: 0, ...over }
}

describe('ActivityNote', () => {
  // Utan förklaringen dyker ett extra pass upp ur tomma intet och ser ut som
  // en bugg i stället för en belöning.
  it('explains what the extra sessions came from', () => {
    render(
      <ActivityNote
        activity={bonus({ hours: { cs2: 6.5, other: 0 }, training: 2 })}
      />,
    )

    expect(screen.getByText(/6,5 h CS2/)).toBeInTheDocument()
    expect(screen.getByText(/2 extra pass/)).toBeInTheDocument()
  })

  it('names both games when both were played', () => {
    render(
      <ActivityNote
        activity={bonus({ hours: { cs2: 3, other: 4 }, training: 1, transfer: 1 })}
      />,
    )

    expect(screen.getByText(/3 h CS2/)).toBeInTheDocument()
    expect(screen.getByText(/4 h i klanens andra spel/)).toBeInTheDocument()
    expect(screen.getByText(/ett extra pass och en extra affär/)).toBeInTheDocument()
  })

  // Har man lirat men inte nått en tröskel ska raden säga det rakt ut, inte
  // låtsas att timmarna gav något.
  it('says the hours have not paid off yet', () => {
    render(<ActivityNote activity={bonus({ hours: { cs2: 1.5, other: 0 } })} />)

    expect(screen.getByText(/1,5 h CS2/)).toBeInTheDocument()
    expect(screen.getByText(/Lira lite till/)).toBeInTheDocument()
  })

  it('invites someone who has not played at all', () => {
    render(<ActivityNote activity={bonus()} />)

    expect(screen.getByText(/öppnar fler träningspass/)).toBeInTheDocument()
  })
})
