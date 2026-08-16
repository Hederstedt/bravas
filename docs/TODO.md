# Kvar att göra — Mikaels lista

Sådant som bara går att göra av någon med tillgång till servern, Discord eller
externa konton. Koden är byggd och testad; det här är det som saknas för att
den ska göra nytta i drift.

Roadmapen i övrigt: [PLAN.md](PLAN.md). Speldesignen: [manager.md](manager.md).

> Repot är publikt. Skriv aldrig in nycklar, lösenord, IP-adresser eller
> serverdetaljer här — bara *vilka* variabler som ska sättas, aldrig till vad.

---

## 1. Slå på Discord-widgeten

**Läget nu:** `/api/discord` svarar `"available": false` i drift — koden är på
plats men hittar ingen widget att fråga efter, så sektionen "Häng med i
Discorden" ser ut precis som förut.

- [ ] Hämta server-ID:t i Discord: **Server Settings → Widget → Server ID**
- [ ] Slå på **Enable Server Widget** på samma skärm
- [ ] Sätt `DISCORD_SERVER_ID` i `/srv/bravas-api/.env`
- [ ] Starta om API:et

Missar man andra punkten svarar Discord `403` och sajten fortsätter visa bara
inbjudningsknappen — vilket är ett giltigt läge, inte ett fel.

**Kolla att det tog:** `curl -s https://www.bravas.se/api/discord` ska svara
`"available": true`.

---

## 2. Kontrollera Valheim-uppgifterna

Går inte att se utifrån: namn och lösenord lämnas bara ut till inloggade
medlemmar, så en utloggad kontroll säger ingenting. Logga in på sajten och
titta på Valheim-kortet.

- [ ] Går kortet att vända? Då är det klart — hoppa över resten.
- [ ] Står det *"Serverns namn och lösenord är inte ifyllda än"*: sätt
      `VALHEIM_SERVER_NAME` och `VALHEIM_PASSWORD` i `/srv/bravas-api/.env`
      och starta om API:et.

Se `server/src/routes/valheim.ts`. Själva serverstatusen fungerar oavsett —
den svarade `online: true` senast den kollades.

---

## 3. Kolla vad Valheim faktiskt exponerar

Avgör om spelarstatistik för Valheim går att bygga, och i så fall vilken.
Gissningen är att spelet bara har achievements och inga räknare — men det är
en gissning, och schemat svarar på fem sekunder.

- [ ] Kör mot Steam med den skarpa nyckeln (körs där nyckeln finns, klistra
      bara in **svaret** — det innehåller ingen nyckel):

```bash
curl -s "https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/?key=$STEAM_API_KEY&appid=892970" | jq '{stats: [.game.availableGameStats.stats[]?.name], antalAchievements: ([.game.availableGameStats.achievements[]?] | length), exempel: [.game.availableGameStats.achievements[]?.displayName][0:10]}'
```

Kommer `stats` tillbaka med namn → "mest dödade troll" går att bygga.
Kommer den tom → det blir "först i klanen att fälla Bonemass" i stället.

Serverrekorden (flest inne samtidigt, uptime, gubbtimmar, primetime) finns
redan och påverkas inte av det här.

---

## 4. Wargaming-konto för World of Tanks-statistik

**Utan det här:** "Siffrorna" visar CS2 och Valheim, aldrig WoT.

- [ ] Skaffa ett **application ID** på Wargamings utvecklarportal
- [ ] Samla in gubbarnas WoT-nick — de går **inte** att härleda ur SteamID,
      så någon måste fråga dem

Först när båda finns går integrationen att bygga.

---

## 5. Berätta för gubbarna att sidan finns

Sajten har roster med riktiga spelarkort, statistik från CS2 och Valheim,
citatvägg, serverstatus, Discord-närvaro och ett managerspel med botlag och
säsonger. Ingen av dem vet om den.

- [ ] Dela `https://www.bravas.se` i Discorden

Delningskortet är byggt för just det — länken renderas med logga, rubrik och
spelbrickor i stället för som en naken URL.

Två saker blir bättre av att fler loggar in:

- **Statistiken** hämtas bara för den som har öppen spelinformation på sin
  Steam-profil. Fler öppna profiler ger fler riktiga rekord och färre
  demo-kort.
- **Managern** fyller i dag ut ligan med botlag eftersom du är ensam. Skapar
  fler gubbar lag håller sig datorn undan, och serien blir er egen.

---

## Gjort och i drift

Kvitteras här så listan inte blandar ihop det som väntar med det som redan
rullar:

- [x] nginx `try_files`-blocket för SPA-rutter (`server/deploy/nginx-spa-location.conf`)
- [x] `DISCORD_INVITE_URL` satt — hero-knappen och Discord-sektionen visas
