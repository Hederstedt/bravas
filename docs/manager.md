# CS Manager — speldesign

Varje gubbe managar ett eget lag av klanens spelare (och genererade fria agenter),
bygger trupp inom budget och spelar en serie där alla möter alla. Backend är klar
(#23, #24, #25); UI, transfermarknad och träning byggs härnäst.

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
| GET | `/api/manager/match/:id` | Sparat referat med protokoll och MVP |

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

## Planerat

- **Träning:** två pass per lag och ospelad omgång; ett pass höjer ett attribut på
  en egen spelare med deterministisk, avtagande kurva (cap 90) och räknar om
  spelarens värde. Ingen slump — ett managerbeslut ska vara förutsägbart.
  Tränade spelare blir dyrare att köpa och ger mer vid försäljning.

Uppdatera det här dokumentet när mekanikerna landar.
