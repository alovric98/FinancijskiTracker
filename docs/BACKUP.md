# Backup produkcijskih podataka — `ft_podaci`

> ⚠️ **Ovaj dump sadrži prave financijske podatke živih korisnika.**
> Spremi ga **isključivo izvan ovog repoa** (npr. lokalni folder poput
> `~/ft-backups/`, ili šifrirani cloud storage) i **nikad** ga ne commitaj u
> git/GitHub. Ovaj repo je javan (audit nalaz 1.5) — dump ovdje bi bio curenje
> osobnih financijskih podataka.

Ovo su upute — backup izvršavaš ručno, ništa se ovdje ne pokreće automatski.
Radi se preko Hostinger → hPanel → phpMyAdmin, prije bilo kojeg produkcijskog
deploya (PRD §2, stavka 3), i odmah, kao preduvjet za Fazu 0 (audit 6.1).

## 1. Pronaći bazu u phpMyAdmin

Hostinger hPanel → **Websites** → odaberi wealth-builder.ai → **Databases** →
**phpMyAdmin** (otvara se u novom tabu, već ulogiran preko hPanela).
U lijevom stupcu odaberi WordPress bazu (ime obično `u<broj>_wordpress` ili
slično — vidljivo u hPanelu pod Databases).

## 2. Export SQL upit

`SQL` tab u phpMyAdmin → zalijepi:

```sql
SELECT * FROM wp_usermeta WHERE meta_key = 'ft_podaci';
```

Ovo su svi trenutni podaci svih korisnika (jedan red po korisniku, `ft_podaci`
je JSON blob u `meta_value`).

> Od Faze 3 nadalje (kad snippet počne pisati rotirajuće backup ključeve)
> proširi upit i na njih, radi potpunog snapshotta:
> ```sql
> SELECT * FROM wp_usermeta WHERE meta_key = 'ft_podaci' OR meta_key LIKE 'ft_podaci_bak%';
> ```
> (Ovi ključevi još ne postoje — ništa se ne događa dok se ne pojave nakon Faze 3.)

## 3. Provjera broja redaka prije exporta

Prije exporta, u istom SQL tabu pokreni i zabilježi broj:

```sql
SELECT COUNT(*) FROM wp_usermeta WHERE meta_key = 'ft_podaci';
```

Ovaj broj kasnije uspoređuješ s brojem redaka u exportanoj datoteci — ako se
ne poklapaju, export je nepotpun i treba ga ponoviti.

## 4. Export rezultata

Nakon što upit iz koraka 2 vrati rezultate, na dnu stranice s rezultatima
phpMyAdmin nudi **Export** (ili: klikni "Export" u gornjem meniju dok su
rezultati upita prikazani, pa "Export as displayed" / "custom" na temelju
tog upita — ne export cijele tablice).

Dvije prihvatljive opcije formata:
- **SQL** — najlakše za restore (poznat je i svima jasan format, siguran
  izbor ako ikad zatreba vratiti podatke).
- **CSV** — lakše za brzi vizualni pregled (npr. u Numbers/Excelu), ali
  gubi malo strukture pri restore-u (JSON u `meta_value` polju je tekstualni
  blob pa CSV i dalje radi, samo je manje zgodan za direktan re-import).

Preporuka: exportaj **oba**, SQL kao primarni backup, CSV kao brzi pregled.

## 5. Konvencija imenovanja

```
ft_podaci_backup_YYYY-MM-DD.sql
ft_podaci_backup_YYYY-MM-DD.csv
```

Npr. za danas: `ft_podaci_backup_2026-07-20.sql`.

Ako radiš backup više puta istog dana (npr. neposredno prije deploya, nakon
jutarnjeg rutinskog backupa), dodaj sat: `ft_podaci_backup_2026-07-20_1430.sql`.

## 6. Gdje spremiti

Lokalni folder **izvan** ovog repoa, npr. `~/ft-backups/`. Ako želiš dodatnu
sigurnost, drži kopiju i na drugom mediju (cloud drive, eksterni disk) —
ovo je jedini postojeći safety net za tuđe financijske podatke dok Faza 3
(server-side backup ključevi) ne bude gotova.

## 7. Provjera exporta

1. Otvori exportanu `.sql` datoteku u tekstualnom editoru — provjeri da
   sadrži onoliko `INSERT`/redaka koliko je pokazao `COUNT(*)` iz koraka 3.
2. Nasumično uzmi jedan red i provjeri da `meta_value` sadrži čitljiv JSON
   (`{"incomeEntries":[...],"entries":[...]}` ili slično) — ne prazan string,
   ne `null`, ne skraćen/odsječen tekst.
3. Zabilježi datum i broj redaka backupa negdje gdje ćeš ga naći (npr. naziv
   datoteke + ova checklist je dovoljno ako radiš backup redovito).

## 8. Hostinger automatski backupi — provjera/uključivanje

U hPanelu, za wealth-builder.ai:

- hPanel → **Files** → **Backups** (ili **Websites → [site] → Backups**,
  ovisi o Hostinger planu).
- Provjeri i zapiši:
  - [ ] Postoje li automatski backupi uključeni (da/ne)?
  - [ ] Koliko često se rade (dnevno/tjedno)?
  - [ ] Koliko dugo se čuvaju (retencija)?
  - [ ] Pokrivaju li i bazu podataka (ne samo datoteke)?
  - [ ] Je li restore ikad testiran, makar na stagingu?
- Ako automatski backupi nisu uključeni, a plan ih nudi — uključi ih.
- Ako plan nema automatske backupe (niži paketi ih ponekad nemaju) —
  ručni SQL export iz koraka 1–7 postaje **jedini** safety net do promjene
  plana; vrijedi ponavljati ga prije svakog deploya (PRD §2.3) i po
  razumnom rasporedu inače (npr. tjedno).

Ovo su ista otvorena pitanja iz `docs/AUDIT.md` ("Otvorena pitanja", stavka 2)
— odgovori ovdje popunjavaju taj nalaz.
