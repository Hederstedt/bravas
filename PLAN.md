# Bravas (BVS) — projektplan

Klansida för BVS — ett gäng goa gubbar från Västra Götaland som lirar CS2, World of Tanks, Valheim och Satisfactory. Live på [www.bravas.se](https://www.bravas.se).

## Arkitektur

- **Frontend:** React + Vite + TypeScript. Statisk build, självhostade fonter, ingen extern tracking.
- **Backend (kommande):** Node-API byggt som **BFF** (Backend-for-Frontend) — skräddarsytt för exakt denna frontend, inga generiska endpoints. Hanterar Steam-inloggning (OpenID 2.0), medlemsdata och statistik-aggregering från externa API:er. API-nycklar och secrets bor enbart i backend.
- **CI/CD:** GitHub Actions — lint (oxlint), enhetstester (Vitest + React Testing Library), E2E (Playwright, desktop + mobil), typecheck + build. Grön CI krävs innan deploy. Deployen är atomisk (release-mappar + symlänk-swap) så sajten aldrig är trasig under utrullning.
- **Säkerhet:** CodeQL-skanning, Dependabot (3 dagars release-cooldown; minor/patch auto-mergas efter grön CI, majors granskas manuellt), secret scanning, branch protection på main.

## Status

- [x] Sajtens första version: hero, spel, roster, om oss, Discord-CTA
- [x] CI + CodeQL + Dependabot med auto-merge
- [x] Testsvit: Vitest (data + komponenter) och Playwright smoke (desktop + mobil)
- [x] Atomisk deploy
- [x] Stats-sektion med demo-data
- [x] Mobilmeny + atmosfärisk bakgrund (CSS/SVG — ingen upphovsrättsskyddad fan art)

## Roadmap

1. **Steam-koppling (BFF-fas 1):** logga in med Steam, riktig roster med Steam-avatarer och Discord-namn, allowlist för medlemskap.
2. **Riktig statistik (BFF-fas 2):** CS2-vapenstats via Steam Web API, World of Tanks via Wargaming API, speltid per spel. Ersätter demo-datan i Siffrorna-sektionen.
3. **Vem är online:** statusprick på roster-korten (Steam presence).
4. **Spelserver-status:** live-widget — är Minecraft/Valheim-servern uppe, antal spelare inne.
5. **Citatvägg:** minnesvärda citat från voice-chatten, med röstning.
6. **Klipp-galleri:** bästa klippen (embeds).
7. **Discord-widget:** när server-ID:t är på plats.

## Utveckling

```bash
npm install
npm run dev        # dev-server
npm test           # enhetstester (Vitest)
npm run test:e2e   # E2E (Playwright, kräver: npx playwright install chromium)
npm run build      # produktion
```

Serverrelaterade åtgärder som väntar finns i [TODO.md](TODO.md).
