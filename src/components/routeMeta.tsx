import { useEffect } from 'react'
import { useLocation } from 'react-router'
import { findRouteMeta } from '../routeMeta'

const BASE_URL = 'https://www.bravas.se'

function upsertMeta(name: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute('name', name)
    document.head.appendChild(tag)
  }
  tag.setAttribute('content', content)
}

function upsertCanonical(href: string) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!link) {
    link = document.createElement('link')
    link.setAttribute('rel', 'canonical')
    document.head.appendChild(link)
  }
  link.setAttribute('href', href)
}

// Rättar title/description/canonical/robots i <head> vid varje klientstyrd
// ruttbyte — index.html:s taggar stämmer bara för "/". Rutter som saknas i
// routeMeta.json (inloggat, ansökan, admin, matchrapporter, 404) får noindex
// i stället för egen metadata.
//
// Det här är inte serverrendering: en delningsrobot eller crawler som inte
// kör JavaScript ser fortfarande startsidans metadata i det första svaret,
// se docs/improvmentplan.md Etapp 2.
export function RouteMeta() {
  const location = useLocation()

  useEffect(() => {
    const meta = findRouteMeta(location.pathname)
    if (meta) {
      document.title = meta.title
      upsertMeta('description', meta.description)
      upsertCanonical(`${BASE_URL}${location.pathname}`)
      upsertMeta('robots', 'index, follow')
    } else {
      upsertMeta('robots', 'noindex, nofollow')
    }
  }, [location.pathname])

  return null
}
