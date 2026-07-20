# Lokalni setup — Financijski Tracker

Cilj: raditi i testirati sve buduće faze na lokalnoj kopiji, nikad na
produkciji (wealth-builder.ai). Ovo okruženje je izolirano Docker WordPress +
MySQL, s testnim korisnikom i lokalno servisiranim bundleom.

Vidi i `PRD.md` §5.2 i `docs/AUDIT.md` ("Siguran način testiranja").

## Preduvjeti

- Docker Desktop (ili drugi Docker Compose kompatibilan alat)
- Node.js + npm (za `npm run build` / `npm run dev`)

## 1. Podizanje WordPressa

```bash
docker compose up -d
```

Prvi put treba desetak sekundi da MySQL inicijalizira bazu. Provjeri status:

```bash
docker compose logs -f wordpress
```

Kad log prestane bacati greške o spajanju na bazu, otvori
**http://localhost:8080** — pojavit će se WordPress install wizard.

## 2. WordPress install wizard

Popuni podacima **isključivo lokalnim** (ne produkcijske vjerodajnice):
- Site Title: npr. `FT Lokalno`
- Username / Password: lokalni admin račun (npr. `admin` / bilo koja lozinka)
- Email: bilo koji (ne mora biti pravi za lokalni rad)

Prijavi se u `http://localhost:8080/wp-admin`.

## 3. Permalinks — obavezan korak

`Settings → Permalinks` → odaberi **"Post name"** → **Save Changes**.

Svježi WordPress dolazi s "Plain" strukturom (`?p=123`), a s njom
`rest_url()` vraća oblik `http://localhost:8080/?rest_route=/financijski-tracker/v1/`.
App na taj URL nadodaje vlastiti query string (npr. `podaci?_=<timestamp>`
za cache-busting) — drugi `?` u istom URL-u razbije rutu i `GET /podaci`
pada uz "Neuspješno učitavanje podataka". "Post name" struktura daje čisti
`/wp-json/...` URL bez `?rest_route=`, pa app-ov dodani query string radi
normalno.

## 4. Instalacija Code Snippets plugina

`Plugins → Add New` → potraži **Code Snippets** → Install → Activate.

## 5. Ubacivanje backend snippeta

1. `Snippets → Add New`.
2. Naziv: `Financijski Tracker Backend`.
3. Zalijepi **sadržaj `backend/wp-snippet.php`** iz repoa.
   - Code Snippets plugin sam dodaje `<?php` omotač — **ne** kopiraj
     otvorni `<?php` tag s vrha datoteke, samo sve ispod njega (ili ostavi
     plugin da parsira; ako plugin prijavi grešku zbog dvostrukog `<?php`,
     makni prvi redak koji si zalijepio).
4. Run snippet: **"Run snippet everywhere"**.
5. Save Changes and Activate.

## 6. Testni korisnik

`Users → Add New` — kreiraj korisnika koji **nije** admin (npr. rola
`Subscriber` ili `Author`), npr. `test` / `test@example.com`. Ovim se vjerno
oponaša produkcijsko stanje: obični korisnik, per-user izolacija preko
`get_current_user_id()`.

## 7. Stranica sa shortcodeom

`Pages → Add New` → dodaj shortcode blok (ili Elementor shortcode widget) sa
sadržajem:

```
[financijski_tracker]
```

Objavi stranicu. Odjavi se s admin računa, prijavi se kao `test` korisnik i
otvori tu stranicu.

U ovom trenutku app će pokušati učitati bundle s
`rawcdn.githack.com/.../v1.8/index.js` (isto kao produkcija) — radit će, ali
ne testira tvoje lokalne izmjene koda. Za to ide korak 8.

## 8. Spajanje na lokalno izgrađeni bundle

Postoje dvije opcije. **Koristi opciju A** za normalno testiranje (spremanje,
učitavanje, sve REST pozive) — ona najvjernije oponaša produkciju jer je sve
same-origin (bez CORS/cookie komplikacija).

### Opcija A — lokalni build (preporučeno)

```bash
npm install
npm run build
```

Ovo prepiše `index.js` u rootu repoa. Zahvaljujući bind-mountu u
`docker-compose.yml`, ta datoteka je odmah dostupna kontejneru na
`http://localhost:8080/wp-content/uploads/ft-tracker/index.js` — bez ručnog
kopiranja.

Sad treba reći shortcodeu da učita **taj** bundle umjesto githacka. To radiš
**samo u lokalnoj kopiji snippeta** (Snippets → Financijski Tracker Backend →
Edit), NE u `backend/wp-snippet.php` u repou:

```php
// LOKALNA IZMJENA — ne kopirati natrag u repo ni u produkcijski WP.
$bundle = 'http://localhost:8080/wp-content/uploads/ft-tracker/index.js?v=' . time();
```

> ⚠️ **Ova linija je isključivo lokalna.** Vraćanje bundle URL-a na vlastitu
> domenu na produkciji je posao **Faze 2** (audit 1.1) i radi se svjesno, uz
> upload na Hostinger — ne kopiranjem ove privremene lokalne linije. Kad
> testiranje završi, lokalna kopija snippeta može ostati ovakva (živi samo u
> tvom Docker WP-u), ali `backend/wp-snippet.php` u repou se ne dira dok ne
> dođe njegov red u Fazi 2.

`?v=' . time()` je samo cache-busting da preglednik uvijek povuče svježi
build tijekom razvoja (ekvivalent ručnom "?v=…" iz Faze 2, ovdje privremeno
i automatski).

Refresh stranice sa shortcodeom (kao `test` korisnik) — sada radi protiv
tvog lokalno izgrađenog `index.js`.

Nakon svake izmjene u `src/`: `npm run build` → refresh stranice u
pregledniku (nije potreban restart kontejnera).

### Opcija B — Vite dev server (napredno, nije nužno za Fazu 0)

`npm run dev` diže Vite na `http://localhost:5173`. Problem: stranica sa
shortcodeom je na `localhost:8080`, pa bi `<script src="http://localhost:5173/...">`
bio cross-origin. WP-ova nonce/cookie autentikacija (`X-WP-Nonce` + session
cookie) je vezana za origin `localhost:8080` — cross-origin fetch prema
`/wp-json/...` treba dodatni CORS setup na WP strani (dozvoljeni origin +
`credentials: include`) koji nije pokriven u ovoj fazi. Za HMR/brzu iteraciju
na izoliranim UI izmjenama može poslužiti (`npm run dev` i gledanje na
`localhost:5173` samostalno, bez WP konteksta), ali za testiranje stvarnog
spremanja/učitavanja podataka koristi Opciju A.

## 9. `data-ft-root` — ništa ne diraš ručno

Shortcode generira `data-ft-root` iz `rest_url('financijski-tracker/v1/')`,
što na lokalnom WP-u automatski daje
`http://localhost:8080/wp-json/financijski-tracker/v1/`. Nema potrebe to
ručno mijenjati — radi "iz kutije" čim je WP podignut na portu 8080.

## 10. Smoke test checklist (ista kao PRD §5.3)

- [ ] Stranica se učita, postojeći podaci vidljivi (ispravni zbrojevi Potrošeno/Ostaje)
- [ ] Dodavanje troška radi + vidljiv u Pregled i Lista tabu
- [ ] Uređivanje i brisanje unosa radi
- [ ] Dodavanje/uređivanje prihoda radi
- [ ] Navigacija na prošli mjesec prikazuje stare podatke
- [ ] Refresh stranice — sve spremljeno je i dalje tu
- [ ] Konzola preglednika bez grešaka

## Reset okruženja

Ako želiš krenuti od nule (npr. testirati migraciju iz Faze 7 na čistoj bazi):

```bash
docker compose down -v   # briše i db_data/wp_data volumene
docker compose up -d
```

`-v` je destruktivno **samo za lokalni Docker volumen**, ne dira produkciju
niti bilo što izvan ovog docker-compose projekta.
