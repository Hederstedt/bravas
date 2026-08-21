import routes from './routeMeta.json'

export interface RouteMeta {
  path: string
  title: string
  description: string
}

// De enda rutterna som ska indexeras. Allt annat — inloggat, ansökan, admin,
// matchrapporter, 404 — får noindex, se komponenten RouteMeta. Delas med
// sitemap.xml/robots.txt-genereringen (scripts/generate-seo-files.mjs) via
// samma JSON-fil, så listorna aldrig kan glida isär.
export const publicRoutes: RouteMeta[] = routes

export function findRouteMeta(pathname: string): RouteMeta | null {
  return publicRoutes.find((r) => r.path === pathname) ?? null
}
