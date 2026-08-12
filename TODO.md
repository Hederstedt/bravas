# TODO — åtgärder på servern (körs hemifrån)

## Nginx: peka om till atomiska deployen

Deploy-workflown lägger nu varje release i `/srv/bravas/releases/<tidsstämpel>-<sha>` och pekar symlänken `/srv/bravas/current` på senaste. Nginx serverar dock fortfarande gamla `/srv/bravas`-roten tills detta körs (sajten fortsätter fungera under tiden — noll stress):

1. Kontrollera att minst en ny deploy har kört (mappen finns):

```bash
ls -l /srv/bravas/current
```

2. Hitta nginx-configen som pekar på `/srv/bravas`:

```bash
grep -rn "srv/bravas" /etc/nginx/
```

3. Ändra `root /srv/bravas;` till `root /srv/bravas/current;` i den config-filen (t.ex. med `sudo nano <fil>`).

4. Testa och ladda om:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

5. Verifiera att sajten svarar (nya versionen med Siffrorna-sektionen ska synas) och städa sen bort gamla filer ur roten:

```bash
cd /srv/bravas && ls | grep -v -E "^(releases|current)$" | xargs -r rm -rf --
```

När detta är gjort: bocka av här, committa och pusha — då vet båda datorernas Claude att det är klart.

- [ ] Nginx-flip utförd och gamla root-filer städade
