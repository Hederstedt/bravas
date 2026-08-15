# Bravas (BVS) — projektplan

Klansida för BVS — ett gäng goa gubbar från Västra Götaland som lirar CS2, World of Tanks, Valheim och Satisfactory. Live på [www.bravas.se](https://www.bravas.se).

## Arkitektur

- **Frontend:** React + Vite + TypeScript. Statisk build, självhostade fonter, ingen extern tracking.
- **Backend:** Node-API (Express + SQLite) byggt som **BFF** (Backend-for-Frontend) — skräddarsytt för exakt denna frontend, inga generiska endpoints. Hanterar Steam-inloggning (OpenID 2.0), medlemsdata, statistik-aggregering från externa API:er och manager-spelet. API-nycklar och secrets bor enbart i backend.
- **CI/CD:** GitHub Actions — lint (oxlint), enhetstester (Vitest + React Testing Library), E2E (Playwright, desktop + mobil), typecheck + build. Grön CI krävs innan deploy. Deployen är atomisk (release-mappar + symlänk-swap) så sajten aldrig är trasig under utrullning.
- **Observability:** felhanterande middleware loggar 5xx med metod, väg och stacktrace; långsamma svar (≥1 s) loggas som varning. `GET /api/health` svarar med drifttid — systemd:s `Restart=on-failure` fångar bara krasch, inte en process som lever men inte fungerar. Frontenden har en felgräns så ett renderingsfel ger ett besked i stället för vit skärm.
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
- [x] **CS Manager:** matchsimulering (#23), säsong + trupp (#24), liga + tabell (#25), UI, transfermarknad, träning och botlag — se [manager.md](manager.md)
- [x] **Spelserver-status:** live Valheim-widget med pulserande kort och anslutningsuppgifter för inloggade (#33, #34)
- [x] **Citat går att ta bort** — egna citat, med bekräftelse. `mine`-flaggan avgör vilka kort som får knappen utan att avslöja vem som skrivit någon annans.
- [x] **Discord-namn på spelarkortet** — Steam vet vad du heter i Steam, inte i Discorden, så kopplingen skrivs in för hand.
- [x] **Discord-widget:** vilka som hänger i Discorden just nu. Widgeten hämtas av BFF:en var 60:e sekund, så server-ID:t stannar i backend och besökarna delar på ett anrop. Kräver `DISCORD_SERVER_ID` och att widgeten är påslagen i Discord — annars visas bara inbjudningsknappen som förut.

## Roadmap

### Fas 3 — CS Manager (klar)

- [x] **UI:** React Router in, `/manager`-vyer — säsongslobby, lagbygge, truppbyggare, tabell, spelschema, matchreferat. Live-uppdatering via händelseströmmen.
- [x] **Transfermarknad + lagkassa:** persistent kassa (`funds`), trupplåsning när serien startat, byt-mot-poolen med säljkurs 70 %.
- [x] **Träning:** deterministisk kurva med avtagande avkastning, 2 pass per omgång, höjer spelarens värde.
- [x] **Botlag:** en ensam manager fylls upp till fyra lag med datorstyrt motstånd, så serien går att spela från dag ett.

Speldesignen i detalj: [manager.md](manager.md).

- [x] **Säsongscykel:** serien tar slut när sista omgången spelats, och lobbyn kommer tillbaka med förra sluttabellen kvar så att en ny säsong kan startas.

Nästa steg om serien känns för lätt: låt botlagen träna och göra affärer mellan
omgångarna — i dag står de still medan managern utvecklar sin trupp.

### Senare — Mikaels önskelista (aug 2026)

I prioritetsordning, med underlag utrett:

1. ~~Småfix med färdig backend~~ — klart, se Status ovan.
2. ~~Discord-widget~~ — klart, se Status ovan.
3. **World of Tanks-statistik** via Wargaming API — kräver application ID och att gubbarna anger sina WoT-nick, de går inte att härleda ur SteamID.
4. **Valheim-statistik:** Valheim exponerar **achievements, inte räknare** — "mest dödade troll" går alltså inte att få. Däremot "först i klanen att fälla Bonemass", speltid via `GetOwnedGames`, och egen statistik ur `valheimPoller` (flest timmar inne på servern, kvällen då flest var inne samtidigt). Verifiera först med `GetSchemaForGame` för appid 892970.
5. **Vikingafigurer:** procedurella SVG-figurer per gubbe, seedade på SteamID via `rng.ts` och varierade med attribut och tier. Passar regeln om egen CSS/SVG utan fan art.
6. **Tvärspelspoäng:** verklig speltid ger **managerresurser** (extra träningspass, pengar, transfers) — aldrig ändrade spelarbetyg, eftersom den frysta poolen är invarianten hela transfermarknaden vilar på.

### Senare

- **Klipp-galleri:** bästa klippen (embeds).
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
