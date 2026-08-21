import { describe, expect, it } from 'vitest'
import { findRouteMeta, publicRoutes } from './routeMeta'

describe('publicRoutes', () => {
  it('lists the three indexable pages, each with a title and description', () => {
    const paths = publicRoutes.map((r) => r.path)
    expect(paths).toEqual(['/', '/kom-igang', '/manager'])
    for (const r of publicRoutes) {
      expect(r.title.length).toBeGreaterThan(0)
      expect(r.description.length).toBeGreaterThan(0)
    }
  })
})

describe('findRouteMeta', () => {
  it('finds the metadata for a known public path', () => {
    expect(findRouteMeta('/kom-igang')?.title).toBe('Kom igång med Bravas | BVS')
  })

  // Sökt, inloggat, admin, matchrapporter och 404 ska alla sakna en post här —
  // "inte i registret" är precis den signal RouteMeta använder för noindex.
  it('returns null for anything not in the public route list', () => {
    expect(findRouteMeta('/mitt-konto')).toBeNull()
    expect(findRouteMeta('/ansok')).toBeNull()
    expect(findRouteMeta('/admin')).toBeNull()
    expect(findRouteMeta('/manager/match/12')).toBeNull()
    expect(findRouteMeta('/finns-inte')).toBeNull()
  })
})
