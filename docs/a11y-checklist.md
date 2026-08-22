# Manuell skärmläsarkontroll

Automatiska verktyg (axe, se `e2e/axe.spec.ts`) hittar bara en bråkdel av det
som spelar roll för fokusordning och begriplighet — de kan inte avgöra om en
sida faktiskt går att *använda* med tangentbord och skärmläsare, bara om
enskilda element bryter mot kända regler. Den här listan är det manuella
komplementet. Kör den inför större releaser, inte vid varje PR.

**Verktyg:** NVDA (gratis, [nvaccess.org](https://www.nvaccess.org/)) +
Chromium, på Windows. Slå på NVDA innan du öppnar sajten.

## Grundnavigering (`/`)

- [ ] Tab från adressfältet: första stoppet är "Hoppa till huvudinnehåll".
      Enter hoppar rakt till Gubbarna, inte till toppen av sidan.
- [ ] Fortsätt Tab genom navigationen — varje länk och knapp läses upp med
      ett begripligt namn, ingen "länk, länk, länk" utan sammanhang.
- [ ] NVDA:s landmärkeslista (`Insert+F7` → Landmarks) visar `main`,
      `navigation`, `contentinfo` — inte fler `main` än en.
- [ ] NVDA:s rubriklista (samma dialog, fliken Headings) speglar sidans
      faktiska struktur: en `h1`, sektionerna som `h2`.

## Gubbarna

- [ ] Ett spelarkorts attributknapp (t.ex. "SIK") läses upp med både
      förkortningen och det fullständiga namnet (skärmläsartext), inte bara
      bokstäverna.
- [ ] Aktivera knappen — NVDA annonserar att panelen fälldes ut
      (`aria-expanded`) och läser upp förklaringen utan att man behöver leta.
- [ ] "Hur räknas betyget fram?" fungerar likadant.

## Mobilmenyn (förminska fönstret eller använd enhetsläge i Chromium)

- [ ] Öppna menyn — fokus hamnar direkt på första länken, inte kvar på
      hamburgarknappen.
- [ ] Tab genom hela menyn och en gång till — fokus stannar inuti dialogen
      (kommer inte ut i sidan bakom).
- [ ] Escape stänger menyn och fokus hamnar tillbaka på hamburgarknappen.

## Kom igång (`/kom-igang`)

- [ ] Anonym: de två vägarna ("Redan medlem" / "Vill du gå med?") läses som
      egna rubriker, inte som en enda lång textmassa.
- [ ] Inloggad medlem: varje steg i checklistan annonserar sin status
      ("Klar" / "Behöver åtgärdas" / "Valfritt") tydligt, inte bara som en
      färgad prick som skärmläsaren inte ser.

## Manager (`/manager`)

- [ ] "Så funkar Manager" fungerar som Gubbarnas motsvarande knapp.
- [ ] Ligatabellen: NVDA:s tabellnavigering (`Ctrl+Alt+piltangenter`) läser
      upp rätt kolumnrubrik för varje cell — testa särskilt en av
      enbokstavskolumnerna (S/V/O/F/P).
- [ ] Om tabellen är bredare än skärmen: Tab till tabellomslaget och skrolla
      med piltangenterna, ingen mus inblandad.
- [ ] Ett lag med "Anslöt efter att serien startat" — texten läses upp som
      en del av raden, inte bara syns visuellt.

## Fel- och laddningslägen

- [ ] Stäng av API:et lokalt (eller strypa nätverket i DevTools) och ladda
      om `/` — felmeddelandet i Gubbarna annonseras automatiskt (`role="alert"`)
      utan att man behöver navigera dit manuellt.
- [ ] "Försök igen"-knappen har ett begripligt namn i sig själv, inte bara
      "knapp".

## Inloggning och Mitt konto

- [ ] "Logga in med Steam" i menyn har ett tydligt namn (inte bara en ikon
      utan text).
- [ ] Efter inloggning (eller simulerat via `/mitt-konto?ny=1`): sidans
      rubrik annonseras efter navigeringen (se `RouteFocus`).
- [ ] Formulären för Discord-namn och bortkoppling har etiketter som läses
      upp korrekt, och felmeddelanden annonseras när de dyker upp.

## Efteråt

Notera datum, NVDA-version och eventuella avvikelser här i PR:en eller i
`docs/PLAN.md` — inte i den här filen, som ska vara återanvändbar oförändrad
nästa gång.
