# BVS — Bravas

Klansidan för Bravas. React + TypeScript + Vite i roten, ett Express-API med
SQLite under `server/`. Allt körs på egen järnvara.

## Komma igång

```bash
npm ci && npm run dev
```

Dev-servern startar på <http://localhost:5173> och proxar `/api` mot driften, så
rostern, statistiken och citaten fylls med riktigt innehåll direkt.

**Inloggning fungerar inte den vägen.** Steam skickar tillbaka besökaren till
driftens `PUBLIC_ORIGIN`, alltså `https://bravas.se`, så sessionskakan hamnar där
och localhost förblir utloggat hur många gånger man än loggar in. Kör API:et
lokalt när du behöver vara inloggad — se nedan.

## Lokalt med inloggning

Kräver en egen [Steam Web API-nyckel](https://steamcommunity.com/dev/apikey) och
att ditt SteamID64 finns på allowlistan.

```bash
cp server/.env.example server/.env
```

Fyll i `STEAM_API_KEY` och `SESSION_SECRET` (valfri lång slumpsträng), och sätt:

```
PUBLIC_ORIGIN=http://localhost:5173
```

Det är dev-serverns port, inte API:ets — det är dit webbläsaren går, och Vite
proxar `/api` vidare. Samma värde används både som Steams returadress och som
OpenID-realm.

Seeda allowlistan och starta API:et:

```bash
npm --prefix server ci && npm --prefix server run seed:allowlist && npm --prefix server run dev
```

Starta sedan frontenden i ett andra fönster med proxyn omdirigerad:

```bash
VITE_API_PROXY=http://localhost:3001 npm run dev
```

Nu landar Steam-callbacken på localhost, kakan sätts för rätt värd och
inloggningen sitter kvar mellan omstarter. Sessionen är 30 dagar och förnyas
automatiskt när mer än halva tiden gått, så aktiva besökare loggas aldrig ut.

## Testa

```bash
npm test && npm run lint && npm --prefix server test
```

E2E kräver att webbläsaren hämtats en gång (`npx playwright install chromium`):

```bash
npm run test:e2e
```

E2E stubbar alla `/api`-anrop, så de rör aldrig driften.

## Deploy

Push till `main` → CI → `.github/workflows/deploy.yml` bygger, lägger varje
release i en egen mapp och byter en symlänk. Unit-fil, nginx-snutt och
sudoers-regel ligger i `server/deploy/`.

Hemligheterna bor i `/srv/bravas-api/.env` på servern, utanför release-mapparna,
och rörs inte av en deploy.
