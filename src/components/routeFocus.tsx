import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router'

// Flyttar fokus till sidans <h1> efter en vanlig ruttväxling, så en
// skärmläsare annonserar den nya sidan — annars ligger fokus kvar på länken
// som klickades, i den gamla sidans nu borttagna DOM-position.
//
// Ren hash-navigering på samma sida (t.ex. "Gubbarna" i menyn från
// startsidan) rör vi inte: pathname ändras inte då, och ScrollToHash äger
// redan det målet. Den allra första renderingen rörs inte heller — annars
// hade varje direktladdning ryckt fokus från adressfältet.
export function RouteFocus() {
  const location = useLocation()
  const prevPathname = useRef(location.pathname)

  useEffect(() => {
    if (location.pathname === prevPathname.current) return
    prevPathname.current = location.pathname

    const heading = document.querySelector<HTMLElement>('h1')
    if (!heading) return
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1')
    heading.focus()
  }, [location.pathname])

  return null
}
