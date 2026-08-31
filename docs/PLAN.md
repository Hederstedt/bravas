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
- [x] **Discord-tid i Månadens BVS:are:** att synas i Discorden ger nu samma sorts poäng som att spela ett av klanens spel, kapat vid samma tak. (Widgeten listar alla som är *online* i Discord, inte bara de som sitter i röst — den skickar med `channel_id` för röstkanaler men vi använder det inte. Vill man att poängen ska betyda röstchatt är det den detaljen som ska plockas upp.) Egen tabell (`discord_samples`) i stället för en rad till i `presence_samples` — den senare har bara plats för "vilket spel", och en gubbe som spelar CS2 medan han sitter i röst hade fått sina Steam- och Discord-spann avbryta varandra i tur och ordning om de delat ström. Kopplingen mellan en gubbe och sin Discord-rad är det handskrivna `discord_name`-fältet (widgeten har ingen stabil id-koppling till Steam), löst matchat mot widgetens användarnamn. Vilar orört tills `DISCORD_SERVER_ID` är satt och widgeten påslagen (se TODO.md) — pollern (`discordPoller.ts`) skriver bara spann när widgeten faktiskt svarar.
- [x] **Mitt konto:** en egen sida (`/mitt-konto`) där kontokopplingarna bor — det inloggade namnet i menyn är vägen dit — och där utloggningen äntligen finns. Backendens `POST /api/auth/logout` hade funnits hela tiden men anropades aldrig från sajten; nu rensar den dessutom både sessions- och CSRF-kakan med samma flaggor de sattes med, i stället för sessionskakan med tomma. Discord- och World of Tanks-kopplingen flyttade hit från Gubbarna, som behåller en hänvisning. Den allra första inloggningen landar på kontosidan i stället för startsidan, med en knuff om att länka World of Tanks — servern vet om det är första gången, så klienten behöver inget eget minne.
- [x] **Ansökan och admin:** den som inte står i allowlisten kastades förut ut till `/?auth=not_allowed` — en query-parameter frontenden aldrig läste — och såg ingenting hända. Nu får hen en session men ingen medlemsrad, och landar på `/ansok` där ansökan skrivs. Namn och avatar hämtas från Steam vid ansökan, aldrig från formuläret, så ingen kan ansöka i någon annans namn. På `/admin` godkänns eller avslås ansökningar och medlemmar kan tas bort; ett godkännande skriver bara allowlisten, medlemsraden skapas av inloggningen som vanligt. Behörigheten är `ADMIN_STEAMIDS` i env och inte i databasen, så en felskrivning i en tabell aldrig kan låsa ut gänget från sin egen adminsida — och en admin kan inte ta bort sig själv. Säkerheten vilar på att `requireAuth` fortsatt kräver en medlemsrad: en sökandes kaka räcker till exakt två saker, en CSRF-token och ansökningsformuläret.
- [x] **Månadens BVS:are:** en viktad poäng, inte rena timmar — speltid per spel i klanens spel med ett tak per spel (`bvsMonth.ts`), så bredd i spelvalet slår att grinda ett enda spel. En egen kröningspoller (`monthlyPoller.ts`) avgör en avslutad månad bara om den saknar en rad i `bvs_month`, vilket gör hela mekaniken omstartssäker — presence_samples är append-only och rensas aldrig, så en förbigången månad går att räkna ut i efterhand. Rör aldrig `activity.ts`; poängen delar bara spann-aritmetiken i `sampleSpans.ts`. Den regerande vinnaren får en guldstjärna på kortet (inte en titel — `position` äger det ordet) och en gyllene ram, plus ett engångsglitter per webbläsarsession, allt med `prefers-reduced-motion` respekterat. `GET /api/stats/month` visar löpande ställning för innevarande månad och förra månadens vinnare, på både kontosidan och admin-sidan. Stängd Steam-profil samplas aldrig och ger noll poäng — det står i förklaringstexten, annars känns tävlingen orättvis utan att någon förstår varför.
- [x] **Loggboken:** vad som hänt i klanen, i tidsordning — nya gubbar, kröningar, citat, spelade matcher och startade säsonger på en och samma rad. Ingenting lagras för vyn: varje rad räknas fram vid anropet ur tabeller som redan finns (`feed.ts` är ren och tar emot raderna, `feedService.ts` läser dem). Det är hela poängen med konstruktionen — en gubbe som slutar anonymiseras i `members` och `season_players` av `removeMember`, och då försvinner hans namn ur loggboken av sig självt. En egen händelsetabell hade behövt städas för hand vid varje utträde, och den städningen hade förr eller senare missats. Rekord hör av samma skäl inte hemma här: "flest inne samtidigt" är ett tillstånd och inte en händelse, och hade legat kvar överst i flödet i evighet — den bor kvar i Siffrorna. Kröningen sparar `steamid64`, som aldrig får ut i ett svar, så namn och opakt id slås upp mot medlemsregistret vid API-gränsen precis som i `/api/members`. Sektionen lyssnar på `quote`- och `league`-händelserna, så ett nytt citat eller en spelad match dyker upp utan omladdning.
- [x] **Delbara kort:** en "Dela kortet"-knapp på varje spelarkort och en "Dela matchen" på matchreferatet, som gör en PNG i delningsformat (1200x630) och lägger den i urklippet — klar att klistra in i Discorden. Layouten är SVG och byggs av en ren modul (`shareCard.ts`) som går att testa utan webbläsare; allt webbläsarberoende ligger i `shareImage.ts`. Typsnittet bäddas in i SVG:n som base64 innan den ritas: en bild som ritas på canvas renderas utanför dokumentet och ser varken sidans `@font-face` eller dess laddade typsnitt, så utan inbäddningen sätts kortet med systemtypsnittet. Steam-avataren är medvetet inte med — den ligger på Steams CDN, och en bild från ett annat ursprung gör canvasen "tainted" så att den inte längre går att läsa ut som PNG. Saknar webbläsaren bildurklipp (eller körs sajten utan HTTPS) blir det en nedladdning i stället, och knappen säger "Nedladdat" och inte "Kopierat". Namn och lagnamn XML-escapas — ett `&` i en persona hade annars gett en trasig SVG, som canvas ritar som en tom ruta utan att säga varför.
- [x] **Klipp-galleriet:** klippen läggs upp av gubbarna själva och röstas på som citaten. Adressen som klistras in sparas aldrig: den tolkas till en leverantör och ett id (`clipUrl.ts`) och kastas, och vyn bygger sin embed-adress ur en fast mall (`clipEmbed.ts`) — det finns alltså ingen väg från något någon skrivit in till ett `src`-attribut. Värdnamnet jämförs helt och hållet och aldrig med "innehåller", eftersom youtube.com.nagonannan.se är trivialt att registrera. **Ingen spelare laddas i förväg:** rutan är tom tills besökaren trycker på spela, och först då hämtas något från YouTube, Twitch eller Medal — inte ens en förhandsbild, för den hade också varit ett anrop dit. Sajten har ingen egen spårning och ska inte bjuda in någon annans i onödan; YouTube bäddas dessutom in via youtube-nocookie.com, och integritetssidan beskriver hela upplägget. CSP:n i `server/deploy/nginx-security-headers.conf` har fått ett `frame-src` med de tre tjänsterna — utan det faller de tillbaka på `default-src 'self'` och rutan blir tom i drift trots att den fungerar lokalt.

- [x] **Diamantkort till Månadens BVS:are, och taket som orättvist stängde ute halva klanen:** vinnarens kort är isblått i stället för guldkantat — utmärkelsen och betyget är två olika saker, och en guldram kunde läsas som att vinnaren råkar ligga i guld-tiern. Attributstaplarna behåller därför sin tier-färg både på sajten och på det delbara kortet; det är ramen, stjärnraden och glittret som byter färg. Glimten som far över kortet respekterar `prefers-reduced-motion`. Samtidigt rättades en bugg i Discord-poängen: `MAX_LISTED = 12` var ett visningsbeslut, men pollern som delar ut månadspoäng läste samma avkortade lista. Discord sorterar alfabetiskt, så på en server med 24 online kunde bara gubbar tidigt i alfabetet någonsin få en poäng — fem av sex länkade var uteslutna. Kapningen ligger nu vid utgången (`publicDiscordStatus`), och jämförelsen som avgör om något ska sändas ut görs på det besökaren faktiskt ser, så rörelse långt ner i listan inte får varje öppen flik att rita om samma sak.
- [x] **Live-pill i navbaren:** en prick och en siffra bredvid BVS-märket som säger hur många gubbar som är inne just nu, med spelen i sin aria-label och länk till Gubbarna. Ritas inte alls när ingen är inne — "0 inne" i sidhuvudet på varenda sida är ingen puls. Ligger i nav-inner och inte på en egen remsa: en rad till hade gjort den sticky headern högre, och sektionernas scroll-margin-top är räknad mot dess höjd. Närvaron flyttade till en delad cache (usePresence) som Gubbarna och pillen läser tillsammans, precis som useMembers — annars hade varje sidladdning gjort två anrop till /api/presence och kunnat visa två olika sanningar. E2E-vakten mot dubbla anrop täcker nu /api/presence också.

- [x] **Månadens utmärkelser (serversidan):** träskeden till jumboplatsen plus tre skämtutmärkelser — SOFFLOCKET (mer tid i Discorden än i spelen), ENKELSPÅRET (hela månaden i ett enda spel) och VINDFLÖJELN (flest byten). **Träskeden kräver poäng över noll**, och det är hela designen: en stängd Steam-profil samplas aldrig (`presence.ts` kräver `communityvisibilitystate === 3`) och en semestervecka ger också noll, så en jumboplats på lägst poäng rakt av hade pekat ut den som har fel sekretessinställning i stället för den som sket i att dyka upp. Man måste ha varit där för att kunna komma sist. Vinnaren och träskeden är uteslutna ur skämtutmärkelserna och ingen bär mer än en, så fem utmärkelser hamnar på fem olika kort i stället för att en gubbe samlar alla. VINDFLÖJELN räknar byten *inom* en session (intilliggande spann som möts exakt) — annars hade "CS2 på måndagen, Valheim på lördagen" räknats som ett byte, och utmärkelsen hade mätt att man spelar flera spel i stället för att man aldrig blir klar med något. Uträkningen är en ren modul (`bvsAwards.ts`) utan db-anrop, som `bvsMonth.ts`. Egen tabell `bvs_month_awards` med en rad per utmärkelse i stället för kolumner på `bvs_month`, och en **egen idempotensvakt** i kröningen: delade de vinnarens hade en månad som kröntes innan utmärkelserna fanns aldrig kunnat få några. Utsändningen hänger på faktisk förändring — en månad där ingen kvalade in får aldrig några rader, och utan det villkoret hade vakten varit falsk varje timme och skickat ett SSE-event i timmen om ingenting.

- [x] **Utmärkelserna bakom inloggning:** `GET /api/stats/awards` ligger bakom `requireAuth`, till skillnad från Månadens BVS:are som är publik. Sajten är publik och indexerad, och någons namn kopplat till en bottenplacering på öppna nätet är en annan sak än samma skämt i Discorden. Egen route och inte ett fält på `/api/stats/cards`: det svaret är publikt och cachat, och ett svar som byter form efter session är precis så någon råkar hänga ut en polare. Ett test slår fast att `/cards` aldrig nämner utmärkelserna för vare sig utloggad eller inloggad — regressionen hade annars varit tyst.

- [x] **Kom igång blir den enda förklaringen:** gubbarna tyckte inte att det var glasklart hur poängen räknas, och orsaken var att sajten har **två olika tal som båda kallas poäng** och som aldrig förklarades bredvid varandra — BVS-betyget (skicklighet, all-time, ger rangen) bodde i Gubbarna-legenden, månadspoängen (närvaro, ger utmärkelserna) i en ruta på Mitt konto som de flesta aldrig öppnar. Sidan börjar nu med jämförelsen rakt ut, och räknar ut en månad i en tabell i stället för i prosa: ett tak är svårt att förstå i löptext men självklart när man ser raden där timmarna kapas. Legenden i Gubbarna och rutan på Mitt konto behåller sina korta besked men länkar hit i stället för att var och en bära sin egen halva som kan glida isär från uträkningen.

- [x] **Steam-sekretessen: två inställningar, inte en.** Den gamla texten nämnde bara "Spelinformation". Det räcker inte — `presence.ts` kräver att hela profilen är offentlig (`communityvisibilitystate === 3`) för att man ska samplas alls, och utan det blir månadspoängen noll hur öppen spelinformationen än är. Den kopplingen stod ingenstans på sajten, vilket gjorde tävlingen obegriplig för den som trodde sig ha gjort rätt. Nu står båda med, med Steams etiketter på svenska och engelska (folk kör klienten i båda), det uttryckliga att "Vänner endast" inte räcker eftersom vi frågar Steam som en främling, och kryssrutan "Håll alltid min totala speltid dold" som tar bort Valheim-timmarna för sig.

- [x] **NATTVAKTEN:** femte månadsutmärkelsen — flest timmar loggade mellan midnatt och sex, lokal tid. Kvällsspel räknas inte; då är halva klanen igång, och utmärkelsen ska peka ut den som sitter uppe när alla andra sover. Spann som korsar gränsen **delas** i stället för att räknas helt eller inte alls, så den som loggar ut 00:30 får en halvtimme och inte noll. Dygnsgränserna byggs av lokala datumkomponenter i stället för genom att lägga på 24 h, så ett sommartidsskifte inte förskjuter natten med en timme. Golv på 3 h: en enda sen kväll är inte ett mönster. Ligger **sist** i utdelningskedjan, så de fyra som redan var i drift behåller sin ordning och ingen som fick en utmärkelse förra månaden plötsligt får en annan.
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

1. **Riktiga delningskort per matchreferat** — alltså att en länk till
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
