import fontUrl from '@fontsource/rajdhani/files/rajdhani-latin-700-normal.woff2?url'
import { SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH } from './shareCard'

// Rasteriseringen: SVG in, PNG ut. Allt webbläsarberoende bor här, så att
// kortens layout (shareCard.ts) går att testa utan canvas och utan nätverk.

export type ShareResult = 'copied' | 'downloaded' | 'failed'

// Typsnittet måste ligga *inuti* SVG:n. En bild som ritas på canvas renderas
// utanför dokumentet och ser varken sidans @font-face eller dess laddade
// typsnitt — utan det här sätts kortet med systemtypsnittet och ser inte alls
// ut som sajten. Filen är samma ursprung (Vite ger den en hashad URL), så
// hämtningen tainter aldrig canvasen.
let fontFacePromise: Promise<string> | null = null

function base64(buffer: ArrayBuffer): string {
  let binary = ''
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte)
  return btoa(binary)
}

async function fontFace(): Promise<string> {
  // Går typsnittet inte att hämta är ett kort med fel typsnitt fortfarande
  // bättre än inget kort alls.
  fontFacePromise ??= fetch(fontUrl)
    .then((res) => res.arrayBuffer())
    .then(
      (buf) =>
        `@font-face{font-family:'Rajdhani';font-weight:600 700;font-style:normal;src:url(data:font/woff2;base64,${base64(buf)}) format('woff2');}`,
    )
    .catch(() => '')
  return await fontFacePromise
}

// Exporterad för testernas skull: cachen är modulnivå och överlever annars
// mellan testfall.
export function resetFontCache(): void {
  fontFacePromise = null
}

function rasterize(svg: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
    const img = new Image()

    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = SHARE_CARD_WIDTH
      canvas.height = SHARE_CARD_HEIGHT
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        URL.revokeObjectURL(url)
        resolve(null)
        return
      }
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      canvas.toBlob(resolve, 'image/png')
    }

    // En SVG som inte går att tolka laddar aldrig, och säger inget om varför.
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }

    img.src = url
  })
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

// Urklipp först: det som ska hända är att kortet klistras in i Discorden, och
// då är en fil i nedladdningsmappen ett extra steg. Firefox och Safari har
// inte alltid bilder i urklippet, och utan HTTPS finns inget urklipp alls —
// då blir det en nedladdning i stället, vilket fortfarande gör jobbet.
//
// Kortet skickas in som en byggare och inte som färdig SVG: typsnittet är
// hämtat asynkront, och shareCard.ts tar redan emot det som argument. Att i
// stället klippa in det i en färdig sträng hade varit en andra väg in för
// samma sak.
export async function shareCardImage(
  build: (fontFace: string) => string,
  filename: string,
): Promise<ShareResult> {
  const blob = await rasterize(build(await fontFace()))
  if (!blob) return 'failed'

  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    return 'copied'
  } catch {
    try {
      download(blob, filename)
      return 'downloaded'
    } catch {
      return 'failed'
    }
  }
}
