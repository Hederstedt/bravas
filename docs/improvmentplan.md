# Förbättringsplan för Bravas

Senast granskad: 2026-08-20  
Omfattning: den publika sajten på `www.bravas.se`, särskilt `/`, `/kom-igang` och `/manager`, samt den nuvarande React-, Vite-, Express- och nginx-implementationen.

## Mål

Planen ska göra Bravas lättare att hitta, förstå och använda utan att tappa sajtens personlighet. Arbetet prioriteras i denna ordning:

1. Korrekt och trovärdig publik upplevelse.
2. Indexerbara och självständiga sidor.
3. Tillgänglig navigering och tydliga arbetsflöden.
4. Dataminimering, integritet och självbetjäning.
5. Prestanda, robusthet och långsiktig verifiering.

## Sammanfattning av granskningen

Den ursprungliga listan är i stort sett riktig, men några punkter behöver preciseras.

| Område | Bedömning | Viktig precisering |
| --- | --- | --- |
| Unik SEO för undersidor | Bekräftat | Alla klientrutter ärver samma titel, beskrivning, canonical och sociala metadata från `index.html`. Enbart klientstyrda metataggar räcker inte för alla sök- och delningsrobotar; de publika rutterna bör för-renderas. |
| Sitemap och robots | Bekräftat | Filerna saknas i `public/`. Sitemap ska bara innehålla publika, indexerbara rutter. Konto-, ansöknings-, admin- och API-rutter ska inte indexeras. |
| Tangentbord och fokus | Delvis bekräftat | Flera viktiga fokusregler finns redan och attributknapparna har uppläsbara namn. Det som saknas är bland annat hopplänk, komplett global fokusstandard, ruttfokus, fokusfälla i mobilmenyn, kontext för upprepade knappar och tillräckliga pekytor. |
| Manager-förklaring | Bekräftat | Startsidan för Manager förklarar budget och säsongsstart kort, men inte lagstorlek, poäng, omgångar, simulering, transfer/träning eller vem som kan starta nästa säsong. |
| Kom igång-flöde | Bekräftat | Sidan har fem textavsnitt, men ingen status eller tydlig skillnad mellan obligatoriska steg, valfria steg och förklaring. |
| Integritet och kontroll | Bekräftat | Det saknas publik integritetsinformation och självbetjäning för att koppla bort Discord/World of Tanks eller begära borttagning. |
| Låsta profiler | Bekräftat | Kortet förklarar problemet men saknar en direkt, konstruktiv väg till rätt Steam-inställning. |

## Ytterligare fynd

### 1. Demo- och platshållardata visas i produktion under laddning eller API-fel

Startsidan renderar sex fiktiva spelarkort och märkningen `Demo-data` innan de riktiga svaren kommit. Medlemsräknaren börjar därför på 6 och byter sedan till 8. Om API:et misslyckas ligger platshållarna kvar och ser ut som riktigt innehåll. Det gör att ett driftfel kan uppfattas som sajtens korrekta tillstånd och skapar visuella hopp.

Åtgärd: modellera `loading`, `success`, `empty`, `stale` och `error` separat. Visa skelett eller neutral laddning i produktion, aldrig fiktiva namn eller siffror. Demo-data kan behållas för tester och Storybook-liknande utvecklingsvyer.

### 2. Okända adresser blir en osynlig mjuk 404

React-rutten `*` skickar besökaren till startsidan. En felstavad eller gammal URL ser därför ut att fungera och kan indexeras som duplicerat startsidesinnehåll. nginx skickar dessutom `index.html` med status 200 för varje okänd väg.

Åtgärd: skapa en riktig 404-vy som behåller den efterfrågade adressen, har `noindex`, tydlig väg tillbaka och om möjligt returnerar HTTP 404 via nginx eller en liten server-/renderingslösning. Testa både klientnavigering och direktladdning.

### 3. Kom igång-texten beskriver inte ansökningsflödet korrekt

Texten säger i praktiken att Steam-inloggning gör besökaren till medlem. Backend skiljer däremot på allowlistade medlemmar och nya sökande och skickar den senare gruppen till `/ansok`.

Åtgärd: visa två grenar: “Redan medlem i BVS” och “Vill ansöka”. Beskriv godkännande, vänteläge och vad som blir publikt först efter godkännande.

### 4. World of Tanks-länken kan leda en utloggad besökare till ett API-fel

Den publika Kom igång-sidan länkar direkt till den skyddade `/api/members/wot/login`. För en anonym besökare är den meningsfulla vägen först Steam-inloggning och sedan `Mitt konto`.

Åtgärd: länka anonymt till rätt föregående steg eller `Mitt konto`; visa den riktiga Wargaming-länken först när sessionen är verifierad.

### 5. Publika API-svar exponerar mer identitetsdata än vyn behöver

`GET /api/members` returnerar varje medlems stabila `steamid64` publikt. Frontenden behöver främst en intern nyckel och, för den inloggade användaren, vetskap om vilken rad som är den egna.

Åtgärd: ersätt publika Steam-ID:n med ett opakt medlems-ID eller returnera `mine: true` från ett sessionsmedvetet svar. Dokumentera vilka namn, avatarer, Discord-namn och spelvärden som visas publikt.

### 6. Kontokopplingar kan bytas men inte tas bort

Discord-namnet kan skrivas över och World of Tanks-kontot kan bytas, men båda saknar koppla-bort-flöde. Cachetabeller och historik behöver också en uttalad gallringsregel när en koppling eller medlem tas bort.

Åtgärd: lägg till separata, CSRF-skyddade bortkopplingsåtgärder med bekräftelse, rensa eller anonymisera härledd data enligt vald policy och beskriv vad som händer med historisk Manager- och citatdata.

### 7. Mobilupplevelsen är mycket lång och flera pekytor är för små

Vid cirka 390 px bredd är startsidan över 12 000 px hög. Attributknapparna är cirka 26 px höga och flera expanderknappar cirka 27 px, vilket är betydligt mindre än en robust pekyta. Rostern är sajtens kärna, men åtta fulla kort före resten gör det svårt att snabbt hitta spel, statistik eller Discord på mobil.

Åtgärd: gör hela den visuella raden klickbar utan att minska informationen, sikta på minst 44 × 44 CSS-pixlar och prova en mobil “Visa fler gubbar”-lösning efter de första 3–4 korten. Behåll alla kort i DOM eller gör lösningen indexeringsvänlig.

### 8. Manager-tabellen kan vara svår att tolka även när säsongen är slut

Den publika sluttabellen visar bland annat ett lag med 0 spelade matcher i en avslutad säsong. Utan förklaring ser det ut som ett datalfel. Kolumnerna `S`, `V`, `O`, `F` och `P` saknar synlig förklaring.

Åtgärd: bestäm om lag utan deltagande ska filtreras, märkas “anslöt efter säsongsstart” eller visas i en separat lista. Lägg till tabellbeskrivning och poängregler.

### 9. Klientrutter saknar fokus- och scrollhantering

Hashlänkar hanteras, men vanlig navigering mellan sidor flyttar inte uttryckligen fokus till sidans huvudrubrik eller återställer scroll. Under lazy-laddning av Manager finns tillfälligt inget `<main>`-landmärke.

Åtgärd: inför en gemensam ruttlayout som alltid innehåller `<main>`, flyttar fokus till sidans `h1`, återställer scroll när ingen hash finns och annonserar sidbyte för hjälpmedel.

### 10. Data presenteras som “live” utan synlig aktualitet

Statistik hämtas via cache och bakgrundsjobb men sidan säger “Hämtat live”. Besökaren kan inte se om ett värde är färskt, tillfälligt gammalt eller senaste kända värde efter ett externt API-fel.

Åtgärd: returnera och visa `updatedAt`/`stale` för relevanta datakällor. Skriv “senast uppdaterad” i stället för “live” när uppgiften är cachad.

### 11. Samma grunddata hämtas från flera komponenter

Navigation, roster, räknare och kontosida frågar var för sig efter session och medlemmar. Det ökar antalet anrop, skapar olika laddningstidpunkter och bidrar till att samma sida samtidigt kan visa gammal platshållardata och riktiga värden.

Åtgärd: använd en delad klientcache/context eller ett litet bootstrap-svar för session, publik medlemsöversikt och sajtconfig. Behåll separata, mer sällan använda Manager- och statistikanrop.

### 12. Bilder och tredjepartsdata behöver en uttalad strategi

Steam-avatarerna saknar explicita dimensioner och lazy loading. De laddas direkt från Steam, vilket också innebär att besökarens webbläsare kontaktar Steam.

Åtgärd: reservera bildyta, använd `loading="lazy"` och `decoding="async"` under första skärmen och överväg servercache/proxy av avatarer. Om direktladdning behålls ska det framgå i integritetsinformationen.

## Prioriterad genomförandeplan

### Etapp 0 — Baslinje och beslut

Syfte: undvika att efterföljande arbete optimerar mot otydliga mål.

- Dokumentera vilka rutter som ska vara publika och indexerbara:
  - `/`
  - `/kom-igang`
  - `/manager`
  - eventuellt publika matchreferat, om de ska kunna delas och leva över tid
- Markera `/mitt-konto`, `/ansok`, `/admin` och API-rutter som privata/icke indexerbara.
- Bestäm om publika rutter ska för-renderas vid build eller serverrenderas. Rekommendation för nuvarande storlek: för-rendera de få publika rutterna vid build och låt dynamiska delar ta över i klienten.
- Bestäm datalivscykel för Steam, Discord, World of Tanks, citat, Manager-historik och aktivitetsprover.
- Mät nuläge för Lighthouse på mobil och desktop och spara värden för LCP, CLS, INP, tillgänglighet och SEO.

Klart när: beslut om indexerbara rutter och datalivscykel finns dokumenterade och ett reproducerbart baslinjetest kan köras lokalt/CI.

### Etapp 1 — Korrekt laddning, fel och rutter (P0)

Berör främst `src/components/roster.tsx`, `src/components/sections.tsx`, `src/App.tsx`, `src/api.ts` och nginx-konfigurationen.

- Ta bort produktionsfallback till fiktiva medlemmar och statistik.
- Inför explicita tillstånd för laddning, tom data, fel och senaste kända data.
- Visa stabila skelett med reserverad höjd så att medlemsantal och kort inte hoppar efter laddning.
- Lägg laddnings- och felmeddelanden i ett permanent `<main>` och använd lämplig `aria-live` utan att läsa upp varje liten liveuppdatering.
- Ersätt wildcard-redirecten med en 404-sida.
- Ordna verklig 404-status för okända direktadresser, eller dokumentera en kortsiktig `noindex`-lösning tills renderingslagret kan returnera rätt status.
- Lägg till en synlig “senast uppdaterad”-indikering där data kan vara cachad eller stale.

Acceptanskriterier:

- Inga fiktiva namn, betyg eller “Demo-data” syns i produktionsbygget.
- Ett trasigt `/api/members` ger ett tydligt fel och en försök-igen-knapp, inte sex platshållargubbar.
- Medlemsantalet byter inte från 6 till 8 under normal laddning.
- `/finns-inte` visar en egen 404-vy och indexeras inte som startsidan.
- Manager har ett `<main>` även medan dess kod/data laddas.

### Etapp 2 — Självständiga, indexerbara publika sidor (P0)

Berör främst `index.html`, Vite/buildskript, en ny central ruttmetadatafil, `public/robots.txt`, sitemap-generering och sidkomponenterna.

- Ge varje publik sida en riktig `h1`:
  - Startsida: `Bravas`
  - Kom igång: `Kom igång med Bravas`
  - Manager: `Bravas CS Manager`
- Definiera per rutt:
  - unik `<title>`
  - unik metabeskrivning
  - canonical med konsekvent `https://www.bravas.se`
  - `og:url`, `og:title`, `og:description` och vid behov unik delningsbild
  - Twitter/X-metadata
- För-rendera publika rutter så rubrik, introduktion och metadata finns i det första HTML-svaret. En klientbaserad head-komponent kan fortfarande hålla metadata rätt efter SPA-navigering.
- Skapa sitemap från samma ruttlista som metadata, så nya publika sidor inte glöms bort.
- Skapa `robots.txt` med sitemapreferens och blockera inte CSS/JS som behövs för rendering.
- Lägg `noindex` på konto-, ansöknings-, admin-, fel- och andra privata vyer.
- Lägg till enkel JSON-LD av typen `WebSite` om uppgifterna kan hållas korrekta; hoppa över dekorativ schema-markup utan tydligt sökvärde.

Acceptanskriterier:

- `curl`/View Source för varje publik rutt visar rätt titel, beskrivning, canonical och `h1` utan att JavaScript behöver köras.
- Delning av `/kom-igang` och `/manager` ger respektive sidas rubrik och URL.
- `/robots.txt` och `/sitemap.xml` svarar med rätt innehållstyp och innehåller inte privata rutter.
- Ett automatiskt test jämför sitemap, canonical och den centrala publika ruttlistan.

### Etapp 3 — Tangentbord, mobil och ruttillgänglighet (P0/P1)

Berör främst `src/App.css`, `src/index.css`, `src/App.tsx`, `src/components/sections.tsx`, `src/components/roster.tsx` och Manager-tabellerna.

- Lägg “Hoppa till huvudinnehåll” först i fokusordningen och ge det permanenta `<main>` ett stabilt id.
- Inför en gemensam `:focus-visible`-standard för länkar, knappar, formulärfält, expanderare och tabellåtgärder. Behåll befintliga komponentanpassningar där `clip-path` kräver inset-fokus.
- Gör attribut-, legend- och “Visa alla”-kontroller minst 44 × 44 CSS-pixlar på touch.
- Ge upprepade statistikknappar kontext, till exempel `Visa hela listan för Flest kills` och koppla expanderaren till panelen med `aria-controls`.
- Behåll de redan bra namnen `SIK 75 Sikte` etc.; komplettera med panel-id och en begriplig stängnings-/fokusmodell.
- Förbättra mobilmenyn:
  - flytta fokus till första menylänken vid öppning
  - håll fokus inom dialogen
  - lås bakomliggande scroll
  - återställ fokus vid alla stängningssätt
  - koppla knappen till dialogen med `aria-controls`
- Lägg `aria-current="page"` på aktuell sidlänk.
- Flytta fokus till sidans `h1` efter vanlig ruttväxling och respektera hashmål med `scroll-margin-top` för den klistrade navigationen.
- Ge Manager-tabellen caption/förklaring för förkortningar och säkra läsbar horisontell scroll på små skärmar.
- Utvärdera att visa de första 3–4 spelarkorten på mobil med en tydlig “Visa alla 8”, utan att dölja innehållet för sökrobotar eller tangentbordsanvändare.

Acceptanskriterier:

- Hela sajten kan användas med Tab, Shift+Tab, Enter, Space och Escape utan fokusförlust.
- Mobilmenyn släpper inte fokus till sidan bakom.
- Alla primära touchkontroller möter 44 × 44-målet.
- Det finns inga nya axe-fel på de publika rutterna.
- `prefers-reduced-motion` fortsätter att respekteras.

### Etapp 4 — Kom igång som ett slutförbart flöde (P1)

Berör främst `src/components/infoPage.tsx`, `src/components/accountPage.tsx`, session-/medlems-API och tester.

- Dela innehållet i två vägar:
  - befintlig BVS-medlem
  - ny person som vill ansöka
- Gör huvudflödet till fyra statussteg:
  1. Steam-inloggning eller ansökan/godkännande
  2. öppen spelinformation i Steam
  3. Discord-namn
  4. World of Tanks, tydligt märkt valfritt
- Flytta “Hur betyget räknas” ur stegräknaren till en separat förklaring.
- Visa generisk guide för anonyma besökare och personlig status för inloggade:
  - klar
  - behöver åtgärd
  - valfri/överhoppad
  - väntar på godkännande
- Länka direkt till rätt officiell Steam-inställning eller en kort bildguide och ge en knapp “Kontrollera igen”.
- Låt låsta spelarkort länka till samma guide. För den egna profilen kan knappen säga “Öppna Steam-guiden”; för andra profiler ska tonen vara neutral och inte peka ut personen.
- Skicka anonyma användare till Steam-/kontosteget före Wargaming, inte direkt till ett skyddat API-anrop.

Acceptanskriterier:

- En ny besökare förstår skillnaden mellan att logga in och att bli godkänd som medlem.
- En inloggad medlem kan se exakt vilket obligatoriskt steg som återstår.
- Den valfria WoT-kopplingen blockerar aldrig att checklistan betraktas som klar.
- Inga länkar från den publika guiden slutar i ett rått 401/JSON-fel.

### Etapp 5 — Integritet, dataminimering och kontokontroll (P1)

Berör främst en ny integritetssida, footer/navigation, `src/components/accountPage.tsx`, `server/src/routes/members.ts`, databasfunktioner och API-kontrakt.

- Publicera en kort, konkret integritetssida som beskriver:
  - data från Steam och Wargaming
  - manuellt Discord-namn
  - vad som visas publikt
  - lokal lagring, cookies och sessionslängd
  - statistikcache, aktivitetsprov och Manager-historik
  - tredjepartsanrop, inklusive avatarer om de laddas från Steam
  - kontaktväg samt bortkoppling/borttagning
- Länka integritetssidan i footer, Kom igång och Mitt konto.
- Sluta returnera `steamid64` i det publika medlems-API:t om det inte behövs; använd opakt id och/eller `mine`.
- Lägg till “Koppla bort Discord” och “Koppla bort World of Tanks” med tydlig konsekvensbeskrivning och bekräftelse.
- Lägg till en process för att lämna BVS/begära borttagning. Skilj mellan:
  - profil- och kopplingsdata som kan raderas
  - historiska resultat/citat som behöver raderas, anonymiseras eller bevaras för tabellens integritet
- Rensa föräldralösa cacheposter och dokumentera retention för aktivitet/prover.
- Överväg proxy/cache av avatarer för mindre tredjepartsläckage och stabilare laddning.
- Verifiera säkerhetsheaders i drift: CSP, HSTS, `X-Content-Type-Options`, referrer policy och frame-skydd. Lägg dem i den komponent som faktiskt äger HTTP-svaret, sannolikt nginx.

Acceptanskriterier:

- En besökare kan innan inloggning förstå vad som lagras och visas.
- En medlem kan koppla bort båda extrakontona utan adminhjälp.
- Publika API-svar innehåller inga stabila externa identifierare som klienten inte behöver.
- Borttagning och bortkoppling har backendtester som verifierar cache, historik och CSRF-skydd.

### Etapp 6 — Manager som självinstruerande spel (P1)

Berör främst `src/components/manager/managerPage.tsx`, `seasonLobby.tsx`, tabellkomponenter och `docs/manager.md`.

- Lägg ett kompakt, alltid nåbart block “Så funkar Manager” med:
  - vem som får starta en säsong
  - budget 20 000 och antal spelare i truppen
  - hur lag skapas och när truppen låses
  - hur matcher simuleras och av vem
  - poäng för vinst/oavgjort/förlust
  - transfer- och träningsfönster
  - hur nästa säsong startar
- Visa en tydlig säsongsstatus: `Ingen säsong`, `Lagbygge`, `Pågående`, `Avslutad`.
- Lägg en primär nästa handling för varje tillstånd, även för anonym besökare.
- Förklara tabellförkortningar och botmärkning.
- Bestäm och testa hur lag med 0 spelade matcher ska visas i en avslutad säsong.
- Lägg datum/säsongsperiod och gärna länk till senaste matchreferat när data finns.
- Håll den korta on-page-hjälpen synkad med den fullständiga speldesignen i `docs/manager.md`, helst genom delade regler/konstanter där det är möjligt.

Acceptanskriterier:

- En anonym förstagångsbesökare kan beskriva spelets grundloop och poängsystem från sidan ensam.
- Varje säsongsstatus har ett tydligt nästa steg.
- En avslutad tabell innehåller inga oförklarade nollrader.
- Regelförklaringen testas mot centrala serverkonstanter så siffror inte glider isär.

### Etapp 7 — Prestanda och resiliens (P2)

Berör främst klientens datalager, bildrendering, API-svar och deploy/nginx.

- Dela session, medlemslista och sajtconfig mellan komponenter med cache/context eller ett bootstrap-anrop.
- Undvik att Home samtidigt hämtar samma medlem/session från flera komponenter.
- Lägg `width`/`height` eller motsvarande stabilt aspect ratio på avatarer; lazy-loada bilder under första skärmen.
- Kontrollera bundle-storlek per rutt och behåll Manager som lazy chunk. Sätt ett CI-budgettak så tillväxt syns.
- Sätt lång immutable-cache för hashade JS/CSS-filer och lämplig kortare cache för HTML, manifest, sitemap och robots.
- Lägg återförsök med backoff endast där det förbättrar upplevelsen; ge alltid användaren manuell “Försök igen”.
- Samla fel per datasektion så ett trasigt statistik-API inte tar bort roster, navigation eller Discord-CTA.
- Överväg `content-visibility` för långt innehåll under första skärmen efter kompatibilitets- och tillgänglighetstest.

Acceptanskriterier:

- Ett normalt anonymt startsidesbesök gör bara ett anrop per grundresurs.
- Inga avatarer under första skärmen laddas eager utan särskilt skäl.
- API-fel i en sektion påverkar inte andra sektioner.
- Lighthouse-regressioner över överenskommet budgettak stoppar CI eller rapporteras tydligt.

### Etapp 8 — Automatiserad kvalitetsgrind (P2)

Berör främst Playwright, Vitest och CI.

- Lägg `@axe-core/playwright` på `/`, `/kom-igang`, `/manager`, 404 och relevanta inloggade vyer.
- Lägg E2E-test för:
  - hopplänk och ruttfokus
  - komplett mobilmeny/fokusfälla
  - minst 44 px primära pekytor
  - inga produktionsplatshållare efter lyckat svar eller fel
  - korrekt 404
  - unik metadata, canonical, robots och sitemap
  - anonym Kom igång utan skyddade direktlänkar
- Lägg kontraktstest för att publika medlems-API:t inte återintroducerar Steam-ID eller andra borttagna privata fält.
- Lägg visuell kontroll av desktop och mobil för de tre publika sidorna, särskilt långa tabeller, expanderade kort och felstatus.
- Kör manuell skärmläsarprovning minst med NVDA + Chromium på Windows för en slutlig kontroll; automatiska tester räcker inte för fokusordning och begriplighet.

Acceptanskriterier:

- Samtliga nya P0/P1-flöden har minst ett regressionsprov.
- CI misslyckas på allvarliga axe-fel, felaktig metadata, saknade indexeringsfiler och läckta publika identifierare.
- Den manuella kontrollistan kan upprepas inför större releaser.

## Rekommenderad leveransordning

Arbetet kan delas i små, granskningsbara pull requests:

1. **Publika tillstånd och 404** — ta bort demo-fallback, stabil laddning, felvyer och wildcard-redirect.
2. **SEO/SSG** — ruttmetadata, `h1`, för-rendering, robots, sitemap och noindex.
3. **Tillgänglig grund** — hopplänk, ruttfokus, fokusstandard, mobilmeny och pekytor.
4. **Kom igång** — medlems-/ansökningsgren, personlig checklista och profilguide.
5. **Integritet och API-minimering** — policy, opaka id:n, unlink och retention.
6. **Manager-hjälp** — regler, status, tabellförklaring och nollmatchade lag.
7. **Delad data och prestanda** — cache/bootstrap, bilder och cacheheaders.
8. **Kvalitetsgrind** — axe, metadata-/API-kontrakt, Lighthouse och manuell checklista.

PR 1–3 bör behandlas som närmast releasekritiska. PR 4–6 ger störst förbättring för nya besökare och medlemmar. PR 7–8 minskar fortsatt underhållsrisk.

## Avgränsningar

- Tonalitet, färgpalett och den tydliga BVS-identiteten bör bevaras.
- Ingen extern analys-/trackingtjänst föreslås som standard. Lighthouse, serverloggar och syntetiska tester räcker tills ett konkret mätbehov finns.
- Integritetspunkterna är produkt- och dataminimeringsrekommendationer, inte en juridisk bedömning.
- Det är bättre att visa “data kunde inte hämtas” än att maskera driftproblem med trovärdig fiktiv data.
