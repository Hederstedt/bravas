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

**Blockerad — kräver admin på Discord-servern.** Mikaels konto saknar Manage
Server-behörighet (vänstermenyn i Server Settings visar bara Server
Profile/Engagement/Boost Perks/Emoji m.m., ingen Widget-sida). Vem som helst
med admin behöver:

- [ ] Fråga admin: hämta server-ID:t i Discord: **Server Settings → Widget →
      Server ID**, och skicka det till oss
- [ ] Fråga admin: slå på **Enable Server Widget** på samma skärm
- [ ] Sätt `DISCORD_SERVER_ID` i `/srv/bravas-api/.env`
- [ ] Starta om API:et

Missar man andra punkten svarar Discord `403` och sajten fortsätter visa bara
inbjudningsknappen — vilket är ett giltigt läge, inte ett fel.

**Kolla att det tog:** `curl -s https://www.bravas.se/api/discord` ska svara
`"available": true`.

---

## 2. Berätta för gubbarna att sidan finns

Sajten har roster med riktiga spelarkort, statistik från CS2 och Valheim,
citatvägg, serverstatus, Discord-närvaro och ett managerspel med botlag och
säsonger. Ingen av dem vet om den.

- [ ] Dela `https://www.bravas.se` i Discorden

Delningskortet är byggt för just det — länken renderas med logga, rubrik och
spelbrickor i stället för som en naken URL.

Tre saker blir bättre av att fler loggar in:

- **Statistiken** hämtas bara för den som har öppen spelinformation på sin
  Steam-profil. Fler öppna profiler ger fler riktiga rekord och färre
  demo-kort.
- **World of Tanks-statistik** kräver att var och en klickar "Länka World of
  Tanks" på sitt eget kort i rostern (inloggad med Steam) — ingen samlar in
  nick åt någon annan längre.
- **Managern** fyller i dag ut ligan med botlag eftersom du är ensam. Skapar
  fler gubbar lag håller sig datorn undan, och serien blir er egen.

---

## Gjort och i drift

Kvitteras här så listan inte blandar ihop det som väntar med det som redan
rullar:

- [x] nginx `try_files`-blocket för SPA-rutter (`server/deploy/nginx-spa-location.conf`)
- [x] `DISCORD_INVITE_URL` satt — hero-knappen och Discord-sektionen visas
- [x] Valheim-uppgifterna kontrollerade — `VALHEIM_SERVER_NAME` och
      `VALHEIM_PASSWORD` satta i `/srv/bravas-api/.env`, kortet går att vända
      för inloggade
- [x] Valheim-schemat kollat — `GetSchemaForGame` gav `availableGameStats: {}`,
      alltså varken räknare eller achievements. Gissningen i `PLAN.md` (bara
      achievements, inga räknare) var för optimistisk — spelet exponerar
      inget av vare sig sorten. Se `docs/PLAN.md`, "Kvar att bygga".
- [x] Wargaming `application_id` skaffat och satt i `/srv/bravas-api/.env` —
      gubbarna länkar sina egna WoT-konton via en knapp i rostern, ingen
      manuell nickinsamling behövs längre.
