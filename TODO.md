# TODO — åtgärder på servern (körs hemifrån)

## Sudoers: låt deployen starta om API:et

Deploy-workflowet bygger och rullar ut API:et atomiskt, men **`Restart API`-steget failar** (`sudo: I'm sorry ghrunner`) tills runnern fått rätt att starta om just den tjänsten. Regeln är utan wildcards — den tillåter exakt ett kommando och ingenting annat.

Frontend-deployen påverkas inte. Tills detta är gjort måste API:et startas om manuellt efter varje deploy som rör `server/`:

```bash
sudo systemctl restart bravas-api.service
```

Installera regeln:

```bash
sudo install -m 440 -o root -g root /srv/bravas-api/current/server/deploy/sudoers-ghrunner-api /etc/sudoers.d/ghrunner-bravas-api && sudo visudo -c
```

Verifiera att den biter (ska svara utan lösenordsprompt):

```bash
sudo -u ghrunner sudo -n /usr/bin/systemctl is-active bravas-api.service
```

- [ ] Sudoers-regel installerad och verifierad

---

## Klart

- [x] Nginx-flip till atomisk deploy utförd och gamla root-filer städade
- [x] API i drift som systemd-tjänst bakom nginx (`/api/` → `127.0.0.1:3001`)
- [x] Allowlist seedad (10 st) och Steam-inloggning verifierad end-to-end
