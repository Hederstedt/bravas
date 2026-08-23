# Kvar att göra — Mikaels lista

Sådant som bara går att göra av någon med tillgång till servern, Discord eller
externa konton. Koden är byggd och testad; det här är det som saknas för att
den ska göra nytta i drift.

Roadmapen i övrigt: [PLAN.md](PLAN.md). Speldesignen: [manager.md](manager.md).

> Repot är publikt. Skriv aldrig in nycklar, lösenord, IP-adresser eller
> serverdetaljer här — bara *vilka* variabler som ska sättas, aldrig till vad.

---



## 1. Peka ut vilka som är admin

**Läget nu:** `/admin` finns i koden — godkänna eller avslå ansökningar, ta bort
medlemmar — men ingen är admin förrän någon står i `ADMIN_STEAMIDS`. Tills dess
är sidan osynlig i menyn och svarar `403` för alla, och en ansökan blir liggande
utan att någon kan godkänna den.

- [ ] Sätt `ADMIN_STEAMIDS` i `/srv/bravas-api/.env` — ditt eget steamid64, och
      gärna en till så en enda glömd inloggning inte låser sidan
- [ ] Starta om API:et

Kommaseparerat om ni är flera. Behörigheten bor i env och inte i databasen just
för att en felskrivning i en tabell aldrig ska kunna låsa ut er från er egen
adminsida — och en admin kan därför inte heller ta bort sig själv.

**Kolla att det tog:** logga in och gå till `/admin` — menyn ska visa "Admin"
och sidan ska svara. Gör den inte det står fel id i variabeln.

---

## 2. Säkerhetsheaders i nginx

**Läget nu:** `server/deploy/nginx-security-headers.conf` finns i repot
(CSP, HSTS, X-Content-Type-Options, Referrer-Policy, X-Frame-Options) men är
inte applicerad på servern — samma "kopiera för hand"-mönster som
`nginx-api-location.conf` och `nginx-spa-location.conf`.

- [ ] Klistra in blocket i `/etc/nginx/sites-available/bravas`, utanför
      location-blocken
- [ ] `sudo nginx -t && sudo systemctl reload nginx`
- [ ] Öppna sajten i en riktig webbläsare — kolla att avatarerna (Steam-CDN)
      fortfarande laddar och att konsolen inte visar nya CSP-fel på `/`,
      `/manager` och `/mitt-konto`
- [ ] Kolla om Cloudflare-tunnelns "Always Use HTTPS"/HSTS redan är på innan
      `Strict-Transport-Security`-raden dubbelsätts

**Kolla att det tog:** `curl -sI https://www.bravas.se/` ska visa alla fem
headrarna. CSP:n är en första, oprövad gissning — se kommentaren i filen för
vad som specifikt kan gå sönder (avatarer, inline style på spelarkorten).

---

## 3. Cache-headers i nginx

**Läget nu:** `server/deploy/nginx-cache-headers.conf` finns i repot (lång
cache på Vites hashade JS/CSS-filer, kort cache på index.html/manifest/
sitemap/robots) men är inte applicerad — samma mönster som punkt 2.

- [ ] Klistra in blocket i `location /`-blocket i
      `/etc/nginx/sites-available/bravas`, efter `try_files`
- [ ] `sudo nginx -t && sudo systemctl reload nginx`

**Kolla att det tog:** `curl -sI https://www.bravas.se/assets/<en-hashad-fil>.js`
ska visa `Cache-Control: public, max-age=31536000, immutable`, och
`curl -sI https://www.bravas.se/` ska visa `max-age=0, must-revalidate`.

---

## Gjort och i drift

Kvitteras här så listan inte blandar ihop det som väntar med det som redan
rullar:

- [x] nginx `try_files`-blocket för SPA-rutter (`server/deploy/nginx-spa-location.conf`)
- [x] **Discord-widgeten påslagen** — Magnus slog på Enable Server Widget och
      `DISCORD_SERVER_ID` är satt. `/api/discord` svarar `"available": true`.
      Kvar för gubbarna själva: den som inte fyllt i sitt Discord-namn under
      Mitt konto får inga månadspoäng för tiden i Discorden, för widgeten har
      ingen koppling till Steam. Saknas i skrivande stund för Papa Blue,
      Profellorn och ⛟.
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
