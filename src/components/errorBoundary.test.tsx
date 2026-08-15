import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ErrorBoundary } from './errorBoundary'

afterEach(() => {
  vi.restoreAllMocks()
})

function Boom(): never {
  throw new Error('sönder')
}

describe('ErrorBoundary', () => {
  it('lets a working tree through untouched', () => {
    render(
      <ErrorBoundary>
        <p>allt lugnt</p>
      </ErrorBoundary>,
    )
    expect(screen.getByText('allt lugnt')).toBeInTheDocument()
  })

  // Utan gränsen avmonterar React hela trädet och besökaren får en vit skärm.
  it('shows a way out instead of a blank page when rendering throws', () => {
    // React loggar felet självt; tysta det så testutskriften går att läsa.
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('heading', { name: /Något gick sönder/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Ladda om sidan/ })).toBeInTheDocument()
  })
})
