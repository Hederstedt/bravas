import { afterEach, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { RouteMeta } from './routeMeta'

// document.head bor utanför RTL:s container och rensas inte av cleanup() —
// varje test måste alltså börja från ett tomt blad självt.
afterEach(() => {
  document.title = ''
  document.head.querySelectorAll('meta[name="description"], meta[name="robots"], link[rel="canonical"]').forEach((el) => el.remove())
})

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <RouteMeta />
    </MemoryRouter>,
  )
}

function description() {
  return document.head.querySelector('meta[name="description"]')?.getAttribute('content')
}

function robots() {
  return document.head.querySelector('meta[name="robots"]')?.getAttribute('content')
}

function canonical() {
  return document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')
}

describe('RouteMeta on a public page', () => {
  it('sets the title, description and canonical for /kom-igang', () => {
    renderAt('/kom-igang')

    expect(document.title).toBe('Kom igång med Bravas | BVS')
    expect(description()).toBe(
      'Så blir du synlig på BVS: Steam-inloggning, öppen spelinformation, Discord-namn för hand och länken till World of Tanks utan att dela lösenord.',
    )
    expect(canonical()).toBe('https://www.bravas.se/kom-igang')
    expect(robots()).toBe('index, follow')
  })

  it('sets the title for /manager', () => {
    renderAt('/manager')
    expect(document.title).toBe('Bravas CS Manager | BVS')
  })
})

describe('RouteMeta on a private or unknown page', () => {
  it('marks the account page noindex', () => {
    renderAt('/mitt-konto')
    expect(robots()).toBe('noindex, nofollow')
  })

  it('marks a match report noindex', () => {
    renderAt('/manager/match/12')
    expect(robots()).toBe('noindex, nofollow')
  })

  it('marks an unknown address noindex', () => {
    renderAt('/finns-inte')
    expect(robots()).toBe('noindex, nofollow')
  })
})

// react-router bara läser initialEntries en gång vid montering, så en riktig
// SPA-navigering går inte att simulera med rerender här. Två separata
// monteringar mot samma document.head visar samma sak: att RouteMeta
// uppdaterar taggarna på plats i stället för att stapla nya.
describe('RouteMeta across mounts', () => {
  it('replaces the previous tag instead of adding a second one', () => {
    renderAt('/kom-igang')
    expect(document.title).toBe('Kom igång med Bravas | BVS')

    renderAt('/manager')
    expect(document.title).toBe('Bravas CS Manager | BVS')
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1)
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1)
  })
})
