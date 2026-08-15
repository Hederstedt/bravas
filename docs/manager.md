# CS Manager — speldesign

Varje gubbe managar ett eget lag av klanens spelare (och genererade fria agenter),
bygger trupp inom budget och spelar en serie där alla möter alla. Är man ensam
fylls serien på med datorstyrda lag, så spelet går att spela från dag ett.

## Matchsimuleringen (#23)

En match spelas runda för runda ur spelarkortens sex attribut, med seedad slump
(`server/src/rng.ts`: FNV-1a + mulberry32) så att samma match alltid går likadant.
Utan determinism blir balansering gissningar och ingen buggrapport går att återskapa.

En runda är en följd av dueller mellan sidorna tills ena laget är utslaget:

- **Vem som tar striden** viktas av frag-betyget — entry-fraggaren dyker upp i fler
  dueller än smygaren, så positionerna syns på protokollet.
- **SIK** och **SKA** avgör om skottet sitter, **TÅL** om han överlever det.
- **NYT** lutar jämna rundor utan att avgöra matcher — skalas ner hårt med flit.

### Duellodds dras mot jämnt

Ett rått styrkeförhållande komponeras brutalt: femton dueller per runda över tretton
rundor gjorde 20 betygspoängs skillnad till 99 % vinstchans. Duellodds som dras mot
jämnt löser det:

| Betygsskillnad | Vinstchans | Oavgjort |
|---|---|---|
| 0 | 43 % | 16 % |
| +4 | 58 % | 16 % |
| +8 | 72 % | 12 % |
| +12 | 85 % | 7 % |
| +16 | 93 % | 4 % |
| +22 | 97 % | 2 % |
| +47 | 100 % | 0 % |

Bättre lag vinner klart oftare, men underdogen kan sno en match — det är det som
gör serien värd att spela.

**Oavgjort är möjligt vid 12–12.** Övertid vore sannare mot CS men gör ligatabellen
krångligare utan att tillföra managerdelen något. Ungefär var sjätte match mellan
jämna lag slutar lika; tabellen prissätter det till en poäng var.

## Säsong och trupp (#24)

### Poolen fryses vid säsongsstart

Spelarpoolen är de riktiga gubbarna **som deras kort stod den dagen**, plus
genererade fria agenter. Frysningen är poängen: betygen kommer från live-statistik
i Steam, och utan den hade en bra kväll i CS2 ändrat en spelares pris mitt i en
pågående serie. Medlemmar med stängd Steam-profil har inga attribut att frysa och
lämnas utanför — de går inte att prissätta.

### Priskurvan är kubisk

Med linjär prissättning hade fem medelgubbar varit det självklara köpet varje gång.
Kubisk gör att en stjärna kostar ungefär två medelgubbar. Budgeten på **20 000**
räcker till fem solida gubbar, eller en stjärna buren av billigare lagkamrater —
men inte fem stjärnor. Det är där valet uppstår.

### Knappheten upprätthålls av databasen

`squads` har primärnyckel på **spelaren**, inte på paret lag-och-spelare — samma
gubbe kan omöjligen vara skriven på två lag. Valideringen kollar först för att ge
ett läsbart meddelande, men databasen har sista ordet vid race.

## Liga och tabell (#25)

Spelschemat läggs med **cirkelmetoden**: ett lag står stilla och resten roterar.
Ingen spelar två matcher samma omgång, hemma/borta växlar mellan omgångarna, och
**dubbelmöte** gör hemmafördelen rättvis över säsongen. Udda antal lag ger
frilottning i stället för en påhittad motståndare.

- Varje match seedas på säsong och match-id — en omgång går att spela om identiskt.
- **Referatet sparas när matchen spelas och simuleras aldrig om** — en rapport kan
  inte säga något annat än resultatet i tabellen. Ett test vaktar just det.
- Lag utan trupp förlorar på **walkover**; rapporten säger varför.
- Tabellen särskiljer på poäng, målskillnad (rundor) och sedan vunna rundor.
- En spelad omgång sänds som `league` på händelseströmmen, så öppna sidor
  uppdaterar sig.

## Botlag — serien går att spela ensam

Den som är först in i spelet kunde tidigare skriva på sin trupp och sedan inte
göra någonting: en serie kräver motstånd, och att vänta på att resten av klanen
loggar in är inget spel. Därför fylls serien på med **datorstyrda lag** inför
första omgången.

- **Bara den som är helt ensam får sällskap.** Har två gubbar redan skapat lag
  har de valt varandra som motstånd, och då tränger sig datorn inte in. Ett
  ensamt lag fylls upp till **fyra** — dubbelmöten över sex omgångar.
- **Botlagen läggs till när serien startar**, inte vid säsongsstart, så att alla
  som hinner skapa lag under byggfasen får plats före datorn.
- **De draftar som vem som helst:** fem gubbar ur den lediga poolen, inom
  budget, seedat på säsong och lagnamn så draften går att återskapa. Draften
  börjar med de billigaste fem och uppgraderar sedan — en girig draft uppifrån
  kan måla in sig i ett hörn där de sista platserna inte går att fylla.
- **Olika djupa fickor:** varje botlag handlar för 62–100 % av budgeten. Lät man
  alla handla för hela blev serien en mur av maximalt optimerade lag, och den
  som testar spelet första gången fick däng i varje match utan att förstå varför.
- I databasen är ett botlag ett vanligt lag med `manager_steamid64` null och
  `bot` satt. SQLite räknar nullvärden som olika i unikhetskravet, så flera
  botlag ryms per säsong utan att kravet luckras upp för de riktiga gubbarna.
- Tabellen märker ut dem med **BOT**, så ingen undrar vem som managar "Lagg IF".

Botlagen tränar inte och gör inga affärer — de står still medan managern
utvecklar sin trupp. Det är avsiktligt så länge: den som spelar ska kunna
klättra i tabellen. Att låta dem utvecklas är nästa steg om serien känns för lätt.

## Tvärspelspoäng — det du lirar märks i managern

Timmar i klanens spel ger managern mer att göra före nästa omgång. Närvaron
hämtas redan från Steam var 45:e sekund för prickarna på rostern; sparad blir
den underlaget för det här.

**Den hårda regeln: aktiviteten rör aldrig spelarbetygen.** Poolen fryses vid
säsongsstart just för att en bra kväll i CS2 inte ska ändra en gubbes pris mitt
i en pågående serie. Rivs den invarianten faller hela transfermarknaden. Därför
går belöningen till managerns *resurser* — knappheten per omgång är ändå den
skruv spelet vrider på.

| Aktivitet sedan förra omgången | Ger |
|---|---|
| 3 h CS2 | +1 träningspass, max +2 |
| 4 h i klanens andra spel | +1 affär, max +1 |

- **Bonusen räknas fram, den lagras aldrig.** Kvoterna är redan "gräns minus
  använt den här omgången", så en bonus som höjer gränsen kan inte växlas in
  två gånger: timmarna spenderas inte, de bestämmer bara takets höjd i det
  fönster de ligger i. Ingen avstämplingstabell behövs.
- **Fönstret börjar när förra omgången avgjordes.** Spelas en omgång flyttar
  det fram och gamla timmar hamnar utanför — det är samma mekanism som gör
  dubbelväxling omöjlig.
- **Taken** hindrar den som lirar dygnet runt från att göra serien meningslös.
  Som mest dubblas kvoterna.
- **Bara tid i ett spel räknas.** "Online men står i menyn" är inte aktivitet.
- Ett glapp i mätningen räknas inte som speltid, av samma skäl som i
  Valheim-historiken: vi vet inte vad som hände.
- Botlagen har ingen gubbe bakom sig och får aldrig någon bonus.

## Säsongen tar slut — och en ny kan börja

När sista omgången spelats sätts säsongens status till `finished`. Utan det steget
stod den kvar som `active` för alltid: lobbyn kom aldrig tillbaka, och säsong 2
gick inte att starta utan att gå in i databasen för hand.

Den färdigspelade säsongen försvinner inte. `seasonView` lämnar med `lastFinished`
— namn, sluttabell och vilka lag som var datorstyrda — så lobbyn kan visa vem som
vann och hela tabellen bredvid formuläret för nästa säsong. Annars hade
säsongsslutet känts som att allt man spelat fram raderades.

Träning och affärer svarar `no_active_season` när säsongen är slut, eftersom det
då inte finns någon aktiv säsong att göra dem i.

## API

Alla mutationer kräver Steam-inloggning och går genom CSRF-skydd och rate limiting.
Läsvyn är öppen — man ska kunna titta på tabellen utan att logga in.

| Metod | Väg | |
|---|---|---|
| GET | `/api/manager` | Säsong, pool med ägare, egen trupp, tabell, spelschema |
| POST | `/api/manager/season` | Startar säsongen, eller lämnar tillbaka den pågående |
| POST | `/api/manager/team` | Ett lag per manager och säsong |
| PUT | `/api/manager/squad` | Skriver hela truppen |
| POST | `/api/manager/matchday` | Spelar nästa ospelade omgång, 409 när serien är slut |
| GET | `/api/manager/match/:id` | Sparat referat med lagnamn, protokoll och MVP |

## Transfermarknad och lagkassa

Säsongen har två faser. **Byggfasen** varar från säsongsstart tills första
omgången spelats: truppen byggs om fritt och kassan sätts till budgeten minus
truppens kostnad. **Seriefasen** börjar med första spelade omgången: truppen
låses och all förändring går via marknaden.

- **Byt-mot-poolen**, inte lag-till-lag: en truppgubbe säljs till poolen och en
  ledig köps, atomiskt — truppen är alltid exakt fem. En såld gubbe är
  omedelbart köpbar för andra lag, så lag-till-lag finns indirekt.
- **Köp kostar fullt värde, försäljning ger 70 %.** Rabatten är invarianten mot
  pengamaskiner: varje köp-sälj-rundtur förlorar pengar, och kassan kan aldrig
  gå under noll. Ett test vaktar att kassa plus truppvärde aldrig ökar av en
  affär.
- **En affär per lag och ospelad omgång.** Omgångar spelas när någon trycker,
  så kvoten är det som hindrar total trupp-churn — inte något tidsfönster.
- **Racet avgörs av databasen:** primärnyckeln i `squads` ligger på spelaren,
  så två lag som köper samma gubbe i samma ögonblick ger exakt en vinnare.
- Affärer sänds som `transfer` på händelseströmmen — öppna sidor ser att
  poolen ändrats.

| Metod | Väg | |
|---|---|---|
| POST | `/api/manager/transfer` | `{ sell, buy }` — 409 i byggfasen, vid slut kvot och när serien är slut |

`PUT /api/manager/squad` svarar 409 `squad_locked` i seriefasen.

## Träning

Ett pass riktar sig mot **ett attribut på en spelare i egna truppen**. Betygen
uppdateras direkt i säsongspoolen, så matchsimuleringen plockar upp dem via
truppen utan att veta att träning finns — och sparade rapporter simuleras
aldrig om, så determinismen bryts inte.

- **Ingen slump.** Seedad rng finns i kodbasen för att kunna återskapa matcher;
  ett träningspass är ett managerbeslut vars effekt ska vara förutsägbar.
  Kurvan ger balansen, inte tärningen.
- **Avtagande avkastning:** `gain = clamp(1, 6, round((90 − betyg) / 8))`. En
  40-spelare får +6, en 82-spelare +1, vid 90 är det stopp.
- **Två pass per lag och ospelad omgång** — samma kvotmekanik som marknaden,
  räknad ur träningsloggen. Med ~10 omgångar blir det ~20 pass på hela truppen:
  ingen kan maxa allt, och det är poängen.
- **Värdet räknas om** med samma kubiska kurva i samma transaktion. Tränade
  spelare blir dyrare att köpa och ger mer vid försäljning —
  utvecklingsstrategin *köp billigt, träna, sälj dyrare* är avsiktligt spel,
  eftersom passen är den knappa resursen, inte pengarna.
- Bara i seriefasen, och passen sänds som `training` på händelseströmmen.

| Metod | Väg | |
|---|---|---|
| POST | `/api/manager/training` | `{ player, attr }` — 409 i byggfasen, vid slut kvot och när serien är slut |

Uppdatera det här dokumentet när mekanikerna landar.
