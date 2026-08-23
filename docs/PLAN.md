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
- [x] **Layoutomgörning (Siffrorna + Gubbarna):** Siffrorna grupperas per spel med egen färg och rubrik i stället för ett enda platt rutnät. Gubbarna gick från sidledsscroll till ett responsivt rutnät. Konto-länkningen flyttades högst upp i sektionen i stället för att ligga osynlig under kortraden. Förklaringen av betyget ligger bakom en utfällbar pil, stängd som standard.
- [x] **Kom igång-sidan:** en egen, statisk sida (`/kom-igang`, länkad i menyn) som förklarar för den som inte är teknisk vad som krävs för att synas på sajten — Steam-inloggning, öppen spelinformation, Discord-namn för hand, hur man länkar World of Tanks utan att dela lösenord, och samma förklaring av betyg och titel som ligger i Gubbarna-legenden.
- [x] **Tvärspelsbetyg:** World of Tanks lägger till ett rejält tillägg (upp till ~15 poäng, klampad vid 99) ovanpå CS2-betyget, aldrig ett avdrag — ju fler spelkonton man länkar, desto högre kan betyget bli, och den som länkar ett svagt WoT-konto tappar inget. Har man bara länkat WoT (stängd CS2-profil) blir WoT-betyget basen i stället för ett tomt kort. Titeln (t.ex. "KAPTEN" eller "GENERAL") kommer från en egen BVS-rangordning (`bvsRank.ts`) styrd enbart av betyget, inte längre lånade attributnamn från CS2 eller WoT. Nya WoT-medvetna kommentarer, inklusive en för den som spelar båda spelen. Rubriken "BVS-BETYG" och en förklaringstext (hur betyg/titel/tier räknas) ersätter det obegripliga "65 ENTRY" ingen förstod.
- [x] **Discord-tid i Månadens BVS:are:** att umgås i röstchatt ger nu samma sorts poäng som att spela ett av klanens spel, kapat vid samma tak. Egen tabell (`discord_samples`) i stället för en rad till i `presence_samples` — den senare har bara plats för "vilket spel", och en gubbe som spelar CS2 medan han sitter i röst hade fått sina Steam- och Discord-spann avbryta varandra i tur och ordning om de delat ström. Kopplingen mellan en gubbe och sin Discord-rad är det handskrivna `discord_name`-fältet (widgeten har ingen stabil id-koppling till Steam), löst matchat mot widgetens användarnamn. Vilar orört tills `DISCORD_SERVER_ID` är satt och widgeten påslagen (se TODO.md) — pollern (`discordPoller.ts`) skriver bara spann när widgeten faktiskt svarar.
- [x] **Mitt konto:** en egen sida (`/mitt-konto`) där kontokopplingarna bor — det inloggade namnet i menyn är vägen dit — och där utloggningen äntligen finns. Backendens `POST /api/auth/logout` hade funnits hela tiden men anropades aldrig från sajten; nu rensar den dessutom både sessions- och CSRF-kakan med samma flaggor de sattes med, i stället för sessionskakan med tomma. Discord- och World of Tanks-kopplingen flyttade hit från Gubbarna, som behåller en hänvisning. Den allra första inloggningen landar på kontosidan i stället för startsidan, med en knuff om att länka World of Tanks — servern vet om det är första gången, så klienten behöver inget eget minne.
- [x] **Ansökan och admin:** den som inte står i allowlisten kastades förut ut till `/?auth=not_allowed` — en query-parameter frontenden aldrig läste — och såg ingenting hända. Nu får hen en session men ingen medlemsrad, och landar på `/ansok` där ansökan skrivs. Namn och avatar hämtas från Steam vid ansökan, aldrig från formuläret, så ingen kan ansöka i någon annans namn. På `/admin` godkänns eller avslås ansökningar och medlemmar kan tas bort; ett godkännande skriver bara allowlisten, medlemsraden skapas av inloggningen som vanligt. Behörigheten är `ADMIN_STEAMIDS` i env och inte i databasen, så en felskrivning i en tabell aldrig kan låsa ut gänget från sin egen adminsida — och en admin kan inte ta bort sig själv. Säkerheten vilar på att `requireAuth` fortsatt kräver en medlemsrad: en sökandes kaka räcker till exakt två saker, en CSRF-token och ansökningsformuläret.
- [x] **Månadens BVS:are:** en viktad poäng, inte rena timmar — speltid per spel i klanens spel med ett tak per spel (`bvsMonth.ts`), så bredd i spelvalet slår att grinda ett enda spel. En egen kröningspoller (`monthlyPoller.ts`) avgör en avslutad månad bara om den saknar en rad i `bvs_month`, vilket gör hela mekaniken omstartssäker — presence_samples är append-only och rensas aldrig, så en förbigången månad går att räkna ut i efterhand. Rör aldrig `activity.ts`; poängen delar bara spann-aritmetiken i `sampleSpans.ts`. Den regerande vinnaren får en guldstjärna på kortet (inte en titel — `position` äger det ordet) och en gyllene ram, plus ett engångsglitter per webbläsarsession, allt med `prefers-reduced-motion` respekterat. `GET /api/stats/month` visar löpande ställning för innevarande månad och förra månadens vinnare, på både kontosidan och admin-sidan. Stängd Steam-profil samplas aldrig och ger noll poäng — det står i förklaringstexten, annars känns tävlingen orättvis utan att någon förstår varför.
- [x] **Loggboken:** vad som hänt i klanen, i tidsordning — nya gubbar, kröningar, citat, spelade matcher och startade säsonger på en och samma rad. Ingenting lagras för vyn: varje rad räknas fram vid anropet ur tabeller som redan finns (`feed.ts` är ren och tar emot raderna, `feedService.ts` läser dem). Det är hela poängen med konstruktionen — en gubbe som slutar anonymiseras i `members` och `season_players` av `removeMember`, och då försvinner hans namn ur loggboken av sig självt. En egen händelsetabell hade behövt städas för hand vid varje utträde, och den städningen hade förr eller senare missats. Rekord hör av samma skäl inte hemma här: "flest inne samtidigt" är ett tillstånd och inte en händelse, och hade legat kvar överst i flödet i evighet — den bor kvar i Siffrorna. Kröningen sparar `steamid64`, som aldrig får ut i ett svar, så namn och opakt id slås upp mot medlemsregistret vid API-gränsen precis som i `/api/members`. Sektionen lyssnar på `quote`- och `league`-händelserna, så ett nytt citat eller en spelad match dyker upp utan omladdning.
- [x] **Delbara kort:** en "Dela kortet"-knapp på varje spelarkort och en "Dela matchen" på matchreferatet, som gör en PNG i delningsformat (1200x630) och lägger den i urklippet — klar att klistra in i Discorden. Layouten är SVG och byggs av en ren modul (`shareCard.ts`) som går att testa utan webbläsare; allt webbläsarberoende ligger i `shareImage.ts`. Typsnittet bäddas in i SVG:n som base64 innan den ritas: en bild som ritas på canvas renderas utanför dokumentet och ser varken sidans `@font-face` eller dess laddade typsnitt, så utan inbäddningen sätts kortet med systemtypsnittet. Steam-avataren är medvetet inte med — den ligger på Steams CDN, och en bild från ett annat ursprung gör canvasen "tainted" så att den inte längre går att läsa ut som PNG. Saknar webbläsaren bildurklipp (eller körs sajten utan HTTPS) blir det en nedladdning i stället, och knappen säger "Nedladdat" och inte "Kopierat". Namn och lagnamn XML-escapas — ett `&` i en persona hade annars gett en trasig SVG, som canvas ritar som en tom ruta utan att säga varför.

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
2. **Riktiga delningskort per matchreferat** — alltså att en länk till
   `/manager/match/12` klistrad i Discorden *själv* visar resultatet, utan att
   någon trycker på "Dela matchen". Bilden går redan att göra (`shareCard.ts`),
   men embedden kräver två saker till, och båda är beslut om driften snarare
   än kod:
   - **Meta-taggar per rutt.** Discords crawler kör ingen JavaScript och ser
     bara `index.html`. Rutten måste alltså serveras av API:et med rätt
     `og:`-taggar i stället för av SPA-fallbacken — ett nytt location-block i
     nginx, samma "kopiera för hand"-mönster som resten av `server/deploy/`.
   - **En PNG som servern kan skapa.** `scripts/og-image.mjs` renderar med
     Playwright, vilket är ett bygg-steg och inte något garageservern har.
     Antingen en rasteriserare i backend (`@resvg/resvg-js`, en förbyggd
     nativemodul på tiotalet MB) eller en huvudlös webbläsare på servern.
     Inget av dem ska smygas in — det är en storlek på beroende som är värd
     ett eget beslut.
3. **Låt botlagen utvecklas** — de står still medan managern tränar och
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
