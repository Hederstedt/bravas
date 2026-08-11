# BVS (Bravas) — klansida på www.bravas.se, driftad på hemmaservern

> Status v3, 2026-08-11: Sajtens första utkast byggt och pushat. Repot publikt med CodeQL + Dependabot + CI. Kvar: server-bootstrap (Tailscale), serverbas + runner, Cloudflare Tunnel. Steam-sync = senare fas.

## Kontext

Klansida för BVS/Bravas — "goa gubbar från Västra Götaland" som lirar CS2, Valheim, Satisfactory m.m. Sajten driftas på egen hemmaserver (Ubuntu Server, ominstallerad aug 2026), domänen **www.bravas.se** är registrerad och ligger tillfälligt på registrarens webbhotell tills tunneln är uppe. ASUS RT-BE92U är beställd men inte levererad — inget hinder: Cloudflare Tunnel kräver ingen port forwarding.

## Läge per steg

### Steg 1 — Fjärråtkomst (pågår, Mikael vid tangentbordet)
Tailscale på servern (`curl -fsSL https://tailscale.com/install.sh | sh` → `tailscale up`) + på Windows-datorn. SSH-nyckel över, lösenordslogin av. Därefter sköts allt serverarbete via SSH över tailnet.

### Steg 2 — Klansidans första utkast ✅
- Mörkt esport-tema (research: NAVI/Vitality-stuk — nästan svart bas, orange accent, kondenserade versaler, vinklade kort).
- Sektioner: Hero ("Bravas — goa gubbar…"), Vad vi lirar (CS2/Valheim/Satisfactory/Minecraft-kort), Gubbarna (placeholder-roster i `src/data/clan.ts`), Om BVS + stats, Discord-CTA, footer.
- Rajdhani-font självhostad via fontsource — inga externa anrop. Responsiv. Statisk build, ingen backend.

### Steg 3 — GitHub-kedjan ✅ (deploy-delen kvar)
- Repot **publikt**: CodeQL (default setup), Dependabot alerts + security fixes, fork-PR:s kräver approval (`all_external_contributors`).
- CI (`.github/workflows/ci.yml`): oxlint + tsc + vite build på push/PR.
- **Kvar:** self-hosted runner på servern + `deploy.yml` (push till main → build → `/srv/bravas`) — läggs när Steg 1 är klart.

### Steg 4 — Serverbas + Cloudflare Tunnel (blockeras av Steg 1)
- `apt upgrade`, `unattended-upgrades`, `ufw`, Node LTS, nginx, `cloudflared`, runner-användare utan sudo.
- Cloudflare-konto, nameserver-flytt av bravas.se (hos registraren), tunnel → `localhost:80`, DNS-route `www` + rot. Webbhotellets cert slutar användas av sig självt.

### Steg 5 — När ASUS-routern kommit
SDN/VLAN-segmentering (servernät/"DMZ", Kids Network med föräldrakontroll), port forwarding för spelservrar, PufferPanel + Minecraft/Valheim.

### Steg 6 — Steam-sync (senare fas, design från v2)
Node API (Express/Fastify) + SQLite bakom nginx: Steam OpenID 2.0-login med HMAC-signerad cookie, `/api/members` med SteamID64-allowlist, CS2-stats via `GetUserStatsForGame` (appid 730 — ingen Premier-rank i publika API:t, kräver publika "Game details"), Discord-widget med server-ID. Gubbarnas SteamID64 hämtas via `GetFriendList` från Mikaels vänlista (ingen notis — överraskningen håller).

## Kostnad
Drift ≈ elkostnaden (~50–150 kr/mån). Domän ~150–300 kr/år. Cloudflare, GitHub (publikt repo), CodeQL, Tailscale: 0 kr.

## Öppna punkter
- Tailscale-bootstrap på servern (Mikael) → låser upp allt serverarbete.
- Registrarens namn för nameserver-flytten.
- Discord server-ID + invite-länk (sajten har placeholder).
- Gubbarnas riktiga nick till rostern (Steam-sync tar över sen).
