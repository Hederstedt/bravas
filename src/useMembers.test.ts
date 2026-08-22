import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import * as api from './api'
import { resetMembersCache, useMembers } from './useMembers'

afterEach(() => {
  resetMembersCache()
  vi.restoreAllMocks()
})

const MAG: api.RosterMember = {
  steamid64: '76561198053832683',
  personaName: '[BVS] #Mag',
  avatarUrl: null,
  discordName: null,
  wotNickname: null,
}

describe('useMembers', () => {
  it('starts as null (loading), then resolves to the ok result', async () => {
    vi.spyOn(api, 'fetchMembersResult').mockResolvedValue({ ok: true, data: [MAG] })
    const { result } = renderHook(() => useMembers())

    expect(result.current.result).toBeNull()
    await waitFor(() => expect(result.current.result).toEqual({ ok: true, data: [MAG] }))
  })

  it('resolves to a not-ok result when the API fails', async () => {
    vi.spyOn(api, 'fetchMembersResult').mockResolvedValue({ ok: false })
    const { result } = renderHook(() => useMembers())

    await waitFor(() => expect(result.current.result).toEqual({ ok: false }))
  })

  // Roster och About behöver samma lista — utan delning hade en vanlig
  // startsidesladdning gjort två identiska anrop till /api/members.
  it('shares a single fetch across components mounted at the same time', async () => {
    const spy = vi.spyOn(api, 'fetchMembersResult').mockResolvedValue({ ok: true, data: [MAG] })
    const first = renderHook(() => useMembers())
    const second = renderHook(() => useMembers())

    await waitFor(() => expect(first.result.current.result).toEqual({ ok: true, data: [MAG] }))
    await waitFor(() => expect(second.result.current.result).toEqual({ ok: true, data: [MAG] }))
    expect(spy).toHaveBeenCalledTimes(1)
  })

  // Roster erbjuder en "Försök igen"-knapp när API:et är nere — reload()
  // hämtar om och sprider det färska svaret till alla monterade konsumenter,
  // inte bara den som råkade trycka.
  it('reload() refetches and notifies every mounted consumer', async () => {
    const spy = vi
      .spyOn(api, 'fetchMembersResult')
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, data: [MAG] })

    const first = renderHook(() => useMembers())
    const second = renderHook(() => useMembers())
    await waitFor(() => expect(first.result.current.result).toEqual({ ok: false }))

    first.result.current.reload()

    await waitFor(() => expect(first.result.current.result).toEqual({ ok: true, data: [MAG] }))
    await waitFor(() => expect(second.result.current.result).toEqual({ ok: true, data: [MAG] }))
    expect(spy).toHaveBeenCalledTimes(2)
  })
})
