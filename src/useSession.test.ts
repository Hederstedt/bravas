import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import * as api from './api'
import { resetSessionCache, useSession } from './useSession'

afterEach(() => {
  resetSessionCache()
  vi.restoreAllMocks()
})

const SESSION: api.Session = { steamid64: '76561198053832683', isMember: true, isAdmin: false }

describe('useSession', () => {
  it('starts as loading (undefined), then resolves to the session', async () => {
    vi.spyOn(api, 'fetchSession').mockResolvedValue(SESSION)
    const { result } = renderHook(() => useSession())

    expect(result.current).toBeUndefined()
    await waitFor(() => expect(result.current).toEqual(SESSION))
  })

  it('resolves to null for an anonymous visitor, distinct from the loading state', async () => {
    vi.spyOn(api, 'fetchSession').mockResolvedValue(null)
    const { result } = renderHook(() => useSession())

    await waitFor(() => expect(result.current).toBeNull())
  })

  // Navens hamburgarmeny renderar SteamLogin två gånger samtidigt (desktop +
  // mobilöverlägg) — utan delning hade det räckt att öppna en sida för att
  // dubbla antalet sessionsanrop.
  it('shares a single fetch across components mounted at the same time', async () => {
    const spy = vi.spyOn(api, 'fetchSession').mockResolvedValue(SESSION)
    const first = renderHook(() => useSession())
    const second = renderHook(() => useSession())

    await waitFor(() => expect(first.result.current).toEqual(SESSION))
    await waitFor(() => expect(second.result.current).toEqual(SESSION))
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
