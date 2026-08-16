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
- [x] **Tvärspelspoäng:** timmar i klanens spel sedan förra omgången ger extra träningspass och affärer i managern. Rör aldrig de frysta betygen — se [manager.md](manager.md).
- [x] **Valheim-serverrekord:** flest inne samtidigt, längsta uptime, gubbtimmar och primetime — räknat ur vår egen poller, som förut kastade bort varje svar. Ingen tredje part inblandad; det här är statistik om *er* server som inte finns någon annanstans. Serverfrågan ger antal, inte namn, så rekorden är serverns och inte enskilda gubbars.
- [x] **Discord-widget:** vilka som hänger i Discorden just nu. Widgeten hämtas av BFF:en var 60:e sekund, så server-ID:t stannar i backend och besökarna delar på ett anrop. Kräver `DISCORD_SERVER_ID` och att widgeten är påslagen i Discord — annars visas bara inbjudningsknappen som förut.
- [x] **Valheim-statistik, del 2 — spelardelen:** `GetSchemaForGame` gav `availableGameStats: {}` (varken räknare eller achievements), så enda spåret är speltid via `IPlayerService/GetOwnedGames` (`playtime_forever` för appid 892970) — en helt egen Steam-endpoint, cachad i en egen tabell (`valheim_playtime`) med samma TTL-mönster som `cs2_stats`. Highlighten ("Mest speltid i Valheim") döljs helt tills någon faktiskt har registrerad speltid, precis som CS2-korten.
- [x] **World of Tanks-statistik:** kontolänkning via Wargaming.net ID — samma OpenID 2.0-protokoll som Steam, så gubbarna länkar själva med en redirect ut och tillbaka i stället för att skriva in ett nick för hand. Callbacken litar aldrig på sina egna querysträngsparametrar; den kollar access_token mot Wargamings eget `account/info` innan något länkas, annars hade vem som helst kunnat anropa callback-URL:en direkt med ett gissat konto-ID. Statistik (strider, vinstprocent, tillfogad skada) cachas som CS2- och Valheim-statsen: egen tabell, egen TTL, degraderar till senast kända värde.

## Roadmap

### Fas 3 — CS Manager (klar)

- [x] **UI:** React Router in, `/manager`-vyer — säsongslobby, lagbygge, truppbyggare, tabell, spelschema, matchreferat. Live-uppdatering via händelseströmmen.
- [x] **Transfermarknad + lagkassa:** persistent kassa (`funds`), trupplåsning när serien startat, byt-mot-poolen med säljkurs 70 %.
- [x] **Träning:** deterministisk kurva med avtagande avkastning, 2 pass per omgång, höjer spelarens värde.
- [x] **Botlag:** en ensam manager fylls upp till fyra lag med datorstyrt motstånd, så serien går att spela från dag ett.
- [x] **Säsongscykel:** serien tar slut när sista omgången spelats, och lobbyn kommer tillbaka med förra sluttabellen kvar så att en ny säsong kan startas.

Speldesignen i detalj: [manager.md](manager.md).

### Kvar att bygga

I prioritetsordning, med underlaget utrett. Den här listan är **kod**. Det som
i stället väntar på konfiguration, konton eller att någon frågar gubbarna står
i [TODO.md](TODO.md) — listorna överlappar inte.

1. **Klipp-galleri:** bästa klippen som embeds. Inget är byggt.
2. **Låt botlagen utvecklas** — de står still medan managern tränar och
   handlar, så serien blir lättare för varje omgång. Först aktuellt om den
   känns för lätt i praktiken.

**Avfört:** procedurella vikingafigurer per gubbe. Byggdes i PR #40 och
skrotades — de ersatte gubbarnas Steam-avatarer som porträtt, och meningen var
aldrig att byta ut folks profilbilder.

## Utveckling

```bash
npm install
npm run dev        # dev-server
npm test           # enhetstester (Vitest)
npm run test:e2e   # E2E (Playwright, kräver: npx playwright install chromium)
npm run build      # produktion
```

Deployen sköter sig själv: grön CI på `main` bygger, rullar ut frontend och API atomiskt, startar om API-tjänsten och verifierar att den svarar innan jobbet räknas som lyckat.
