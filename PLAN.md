# BVS (Bravas) — klansida på www.bravas.se, driftad på hemmaservern

> Status v2, 2026-08-10: Planen omskriven — Azure-hosting ersatt av egen hemmaserver. Domänen **www.bravas.se** är registrerad. Vite/React-scaffold finns i repot. Nästa steg: Steg 2 (nätverk) + Steg 3 (Steam-login).

## Kontext

Klansida för BVS/Bravas — "goa gubbar från Västra Götaland" som lirar CS2 via Steam och hänger på Discord. Ursprungsplanen (v1) siktade på Azure Static Web Apps, men Mikael har sedan dess:

- Registrerat **www.bravas.se**
- Byggt en hemmaserver av begagnade delar: **i7-3820, 16 GB DDR3, GTX 1060 6GB, Ubuntu Server** på 500GB SSD (OpenSSH aktivt, lokal IP `192.168.50.123`), **250GB SSD reserverad för hemsidan**, 1TB HDD för backup
- Servern ska även köra spelservrar (Minecraft, Valheim) via **PufferPanel**
- Ny router: **ASUS RT-BE92U**

Sidan driftas därför hemma — Azure utgår. Jobbpotten på $50/mån behövs inte längre (kan ev. användas till offsite-backup i Azure Blob senare).

## Kostnadskalkyl

| Post | Kostnad |
|---|---|
| Hosting (hemmaservern) | 0 kr — hårdvaran finns redan |
| El (~70–100 W dygnet runt) | ~50–150 kr/mån beroende på elpris |
| Domän bravas.se | ~150–300 kr/**år** (redan betald) |
| Cloudflare (DNS + Tunnel) | 0 kr (free tier) |
| GitHub privat repo + Actions self-hosted runner | 0 kr |
| **Totalt löpande** | **≈ elkostnaden** |

## Nätverksdesign — flera nät i RT-BE92U (svar på Mikaels fråga)

Ja, det funkar. Funktionen heter **Guest Network Pro (SDN)** i ASUS firmware 3.0.0.6 och låter routern köra flera separata nätverk (egna VLAN + SSID:n). Dessutom finns en **LAN → VLAN**-sida där fysiska LAN-portar binds till ett nätverk (**access mode** = porten tillhör ett VLAN; trunk mode för flera).

Målbild:

| Nät | Typ | Vem/vad |
|---|---|---|
| Huvudnät | Standard-LAN + WiFi | Mikael + familjen |
| **Servernät ("DMZ")** | SDN/VLAN, egen LAN-port i access mode | Hemmaservern (web + spelservrar). Isolerat från huvudnätet — tar servern stryk når angriparen inte familjens enheter |
| Barnens nät | SDN "Kids Network" | Schemaläggning + innehållsfilter per enhet |
| (Ev. IoT/gäst) | SDN | Prylar och besökare |

**Att tänka på:**
- Kör **senaste firmware** först — Guest Network Pro/VLAN rullades ut stegvis till BE-serien och tidiga versioner hade buggar (forumrapporter om att VLAN läckte genom alla portar på BE92U). Verifiera isoleringen efteråt: ping servern från huvudnätet — ska inte svara om isolering är på.
- **Admin-tradeoff:** full isolering betyder att SSH/PufferPanel inte nås från huvudnätet. Pragmatiskt: tillåt intranet-access för servernätet i början, eller lägg en brandväggsregel/extra port i samma VLAN för admin. Skruva åt när allt rullar.
- Port forwarding pekas sedan **enbart in i servernätet** — aldrig mot huvudnätet.

## Exponering mot internet

- **Webben (www.bravas.se): Cloudflare Tunnel** (rekommenderas) — flytta bravas.se:s DNS till Cloudflare free, kör `cloudflared` som tjänst på servern. Inga öppna webbportar, hem-IP:t hålls dolt, TLS automatiskt, och dynamiskt IP är inget problem (ingen DDNS behövs för sajten).
- **Spelservrarna: klassisk port forwarding** (Minecraft 25565/TCP, Valheim 2456–2457/UDP) in i servernätet + routerns inbyggda DDNS (asuscomm.com) så gubbarna ansluter via t.ex. `spel.bravas.se` (CNAME → DDNS-namnet). Tunnel funkar inte för spel-UDP.
- Fallback om tunnel känns fel: port forward 80/443 → Nginx + certbot (Let's Encrypt), DDNS mot bravas.se.

## Arkitektur (ändrad från Azure Functions → Node på servern)

```
Hemmaservern (Ubuntu, servernät-VLAN)
├── cloudflared  → tunnel för www.bravas.se
├── Nginx        → serverar React-buildens statiska filer + reverse proxy /api → Node
├── Node.js API (Express/Fastify, systemd-tjänst) på 250GB-SSD:n
│   ├── /api/auth/steam/login      → redirect till Steam OpenID
│   ├── /api/auth/steam/callback   → verifiera OpenID-svar, sätt HMAC-signerad session-cookie
│   ├── /api/auth/me               → inloggad användare
│   ├── /api/members               → medlemslista
│   ├── /api/members/link          → koppla Discord-namn till inloggat Steam-konto
│   ├── /api/stats/{steamId}       → CS2-stats via Steam Web API (cache 15 min)
│   └── /api/config                → discordServerId m.m.
├── SQLite (better-sqlite3)        → tabell members (steamId, personaname, avatar, discordName, joinedAt)
└── PufferPanel                    → Minecraft + Valheim (separat från webben)
```

**Oförändrade tekniska val från v1:** Steam-login via OpenID 2.0 (egen implementation, HMAC-cookie), Steam Web API-nyckel som miljövariabel (aldrig i repot), CS2-stats-caveat (appid 730 ger CS:GO-era-stats, ingen Premier-rank publikt, kräver publik "Game details"), Discord-serverwidget via iframe, allowlist på SteamID64 så inga randoms hamnar i rostern.

**Ersatt:** Azure Functions → Express/Fastify · Table Storage → SQLite · SWA-deploy → GitHub Actions **self-hosted runner** på servern (ingen exponerad SSH behövs: runnern ringer ut till GitHub, bygger och lägger ut ny version lokalt).

## Genomförande

### Steg 0 — Versionshantering ✅ (klart i och med denna session)
- Privat repo `Hederstedt/bravas` på github.com, första commit pushad.

### Steg 1 — Frontend-scaffold ✅ (delvis klart)
- Vite + React 19 + TS finns. Kvar: sidstruktur enligt Steg 4.

### Steg 2 — Server & nätverk (görs på servern/routern)
1. Uppdatera RT-BE92U till senaste firmware; skapa SDN-näten (server-VLAN med LAN-port i access mode, Kids Network); flytta servern dit och verifiera isolering.
2. Montera 250GB SSD (hemsida) + 1TB HDD (backup) via `fstab`.
3. Installera Nginx + Node LTS + `cloudflared`; flytta bravas.se-DNS till Cloudflare och skapa tunneln (`www` + rot).
4. PufferPanel + spelservrar (eget spår, påverkar inte webben).
5. Grundhärdning: `ufw` (bara det som behövs), `unattended-upgrades`, SSH med nycklar.

### Steg 3 — Steam-login (Node API)
- Express/Fastify-app med `login`/`callback`/`me` enligt arkitekturen ovan. Secrets i `.env` på servern (gitignorerad): `STEAM_API_KEY`, `SESSION_SECRET`, `DISCORD_SERVER_ID`.

### Steg 4 — Landningssida + medlemslista
- Hero med BVS-branding ("Goa gubbar från Västra Götaland", CS2-mörkt tema, orange accent), sektioner Om/Roster/Discord/footer.
- SQLite-seed med gubbarnas SteamID64 (hämtas via `GetFriendList` från Mikaels vänlista — överraskningen hålls intakt, ingen notis skickas).
- Roster-kort: Steam-avatar, namn, Discord-namn, profil-länk, online-status. Inloggad medlem sätter sitt Discord-namn.

### Steg 5 — CS2-stats
- `GetUserStatsForGame` (730) + `GetOwnedGames`; cache; visa kills, HS-%, wins, speltid; hantera privata profiler snyggt.

### Steg 6 — Deploy-pipeline
- GitHub Actions self-hosted runner på servern: på push till `main` → `npm ci && npm run build` (frontend + API) → synka till `/srv/bravas` → `systemctl restart bravas-api`.

## Verifiering
1. **Lokalt (dev-maskinen):** `npm run dev` + API:t lokalt — Steam-login funkar mot localhost.
2. **På servern:** `curl http://192.168.50.123/api/members` från huvudnätet (innan isolering skruvas åt), sedan https://www.bravas.se utifrån (mobilnät): login med eget Steam-konto, Discord-namn, stats, widget.
3. **Nätverket:** från huvudnätet ska familjens enheter inte nås från servernätet; spelservrarna nås utifrån via forwardade portar.
4. **Pipeline:** push till main → ny version live inom någon minut.

## Öppna punkter
- Steam Web API-nyckel + Mikaels SteamID64 (för vänlista-hämtning av gubbarnas ID:n).
- Discord server-ID + aktivera widgeten i serverinställningarna.
- Flytt av bravas.se:s nameservrar till Cloudflare (görs hos registraren).
