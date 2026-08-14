# Bravas (BVS) — projektplan

Klansida för BVS — ett gäng goa gubbar från Västra Götaland som lirar CS2, World of Tanks, Valheim och Satisfactory. Live på [www.bravas.se](https://www.bravas.se).

## Arkitektur

- **Frontend:** React + Vite + TypeScript. Statisk build, självhostade fonter, ingen extern tracking.
- **Backend:** Node-API (Express + SQLite) byggt som **BFF** (Backend-for-Frontend) — skräddarsytt för exakt denna frontend, inga generiska endpoints. Hanterar Steam-inloggning (OpenID 2.0), medlemsdata, statistik-aggregering från externa API:er och manager-spelet. API-nycklar och secrets bor enbart i backend.
- **CI/CD:** GitHub Actions — lint (oxlint), enhetstester (Vitest + React Testing Library), E2E (Playwright, desktop + mobil), typecheck + build. Grön CI krävs innan deploy. Deployen är atomisk (release-mappar + symlänk-swap) så sajten aldrig är trasig under utrullning.
- **Säkerhet:** CodeQL-skanning, Dependabot (3 dagars release-cooldown; minor/patch auto-mergas efter grön CI, majors granskas manuellt), secret scanning, branch protection på main.
- **Licens:** proprietär — se [LICENSE](../LICENSE) i roten. Ingen användning utan skriftligt avtal.

## Status

- [x] Sajtens första version: hero, spel, roster, om oss, Discord-CTA
- [x] CI + CodeQL + Dependabot med auto-merge
- [x] Testsvit: Vitest (data + komponenter) och Playwright smoke (desktop + mobil)
- [x] Atomisk deploy (frontend + API)
- [x] Steam-koppling (BFF-fas 1): inloggning, riktig roster, allowlist, 30-dagarssessioner (#10, #19, #20)
- [x] Riktig statistik (BFF-fas 2): CS2-stats via Steam Web API ersatte demo-datan (#16)
- [x] Vem är online: presence-prickar på rostern (#15)
- [x] Citatvägg med röstning (#17)
- [x] Spelarkort: genererade CS2-attribut, tiers och quips (#19, #21)
- [x] Mobilmeny + atmosfärisk bakgrund (CSS/SVG — ingen upphovsrättsskyddad fan art)
- [x] **CS Manager, backend:** matchsimulering (#23), säsong + trupp (#24), liga + tabell (#25) — se [manager.md](manager.md)

## Roadmap

### Fas 3 — CS Manager (pågår)

Backend klar. Kvar, i ordning:

1. **UI:** React Router in, `/manager`-vyer — säsongslobby, lagbygge, truppbyggare, tabell, spelschema, matchreferat. Live-uppdatering via händelseströmmen. *(byggt — väntar på merge)*
2. **Transfermarknad + lagkassa:** persistent kassa (`funds`), trupplåsning när serien startat, byt-mot-poolen med säljkurs 70 %. *(byggt — väntar på merge)*
3. **Träning:** deterministisk kurva med avtagande avkastning, 2 pass per omgång, höjer spelarens värde.

Speldesignen i detalj: [manager.md](manager.md).

### Senare

- **Spelserver-status:** live-widget — är Minecraft/Valheim-servern uppe, antal spelare inne.
- **Klipp-galleri:** bästa klippen (embeds).
- **Discord-widget:** när server-ID:t är på plats.
- **World of Tanks-statistik:** via Wargaming API.

## Utveckling

```bash
npm install
npm run dev        # dev-server
npm test           # enhetstester (Vitest)
npm run test:e2e   # E2E (Playwright, kräver: npx playwright install chromium)
npm run build      # produktion
```

Deployen sköter sig själv: grön CI på `main` bygger, rullar ut frontend och API atomiskt, startar om API-tjänsten och verifierar att den svarar innan jobbet räknas som lyckat.
