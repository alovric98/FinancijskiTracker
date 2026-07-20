# AUDIT — Financijski Tracker (v1.8 u produkciji)

Datum: 20.7.2026. · Auditirano: repo `alovric98/FinancijskiTracker` (HEAD `9a4f191`, tag `v1.8` = isti funkcionalni kod) + WordPress PHP snippet (dostavljen ručno, živi u WP Code Snippets pluginu).
Napomena: aplikacija je **React 18 + Vite SPA** (ne Next.js, nema TypeScripta). Backend su tri custom WP REST rute; podaci se spremaju kao JSON blob u `wp_usermeta` (ključ `ft_podaci`), po WP korisniku.

## Sažetak arhitekture

WP shortcode `[financijski_tracker]` renderira mount div s `data-ft-root` (REST root) i `data-ft-nonce`, te učitava bundle **s vanjskog CDN-a** (`rawcdn.githack.com`, tag v1.8). App na mount radi `GET /podaci`, svaku promjenu autosavea (debounce 700 ms) kao **cijeli dataset** na `POST /spremi`, a nonce osvježava svakih 10 min preko `GET /nonce`. Autentikacija je delegirana WP-u (session cookie + `X-WP-Nonce`, `permission_callback: is_user_logged_in`). Izolacija podataka po korisniku ide preko `get_current_user_id()`.

---

## 1. Sigurnost

### 1.1 KRITIČNO — Produkcijski JS servira se s trećeg servisa (rawcdn.githack.com), bez integriteta
- **Gdje:** PHP snippet, `ft_shortcode()` — `$bundle = 'https://rawcdn.githack.com/alovric98/FinancijskiTracker/v1.8/index.js'`.
- **Problem:** Klijentova ulogirana WP sesija izvršava JS koji dolazi iz javnog GitHub repoa preko besplatnog CDN-a bez SLA. Tri neovisna rizika: (a) kompromitacija tvog GitHub računa ili force-push taga `v1.8` mijenja kod koji se izvršava kod klijenta — s pristupom sesiji, nonce-u i svim podacima; ako stranicu otvori WP admin, napadač može preuzeti cijeli WordPress; (b) `<script>` nema SRI (Subresource Integrity) hash pa ni promjena sadržaja na CDN-u ne bi bila detektirana; (c) padne li githack, aplikacija prestaje raditi.
- **Prijedlog:** Samohostati `index.js` na klijentovom WP-u (child theme ili `wp-content/uploads`), verzija u query stringu za cache-busting (`index.js?v=1.8`). Deploy = upload nove datoteke, ne ovisnost o vanjskom servisu.

### 1.2 VISOKO — `POST /spremi` prepisuje cijeli dataset bez ikakve zaštite od gubitka
- **Gdje:** PHP `ft_spremi_podaci()`; frontend `src/App.jsx:184` (`persist`).
- **Problem:** Server bespogovorno zamijeni sve postojeće podatke onim što stigne. Prazan ili krnji payload = trajno brisanje svega, bez povijesti i bez mogućnosti povrata. Nema server-side verzioniranja ni sanity provjere (npr. "novi payload ima 2 unosa, stari 400 — sumnjivo").
- **Prijedlog:** Na serveru čuvati zadnjih N verzija (npr. `ft_podaci_backup_1..3` uz timestamp) prije svakog prepisivanja + odbiti/tražiti potvrdu kad novi payload ima drastično manje unosa od postojećeg.

### 1.3 VISOKO — Server ne validira poslovna pravila payloada
- **Gdje:** PHP `ft_sanitize_list()`.
- **Problem:** Sanitizacija postoji (dobro!), ali: `floatval` prihvaća negativne i ekstremne iznose; `category` nije whitelistana protiv 9 poznatih; `date` se ne validira formatom `d.m.yyyy.`; nema limita broja unosa ni veličine payloada (usermeta može narasti neograničeno). Unos s neispravnim datumom frontend tiho filtrira van (`inMonth`, `App.jsx:144`) — zapis postoji u bazi, a nevidljiv je u svim mjesecima ("osirotjeli" zapis).
- **Prijedlog:** Whitelist kategorija, regex validacija datuma, `amount` u rasponu (0, MAX], limit broja unosa i duljine note polja, odbaciti nevaljane stavke uz logiranje.

### 1.4 SREDNJE — Nema rate limitinga na REST rutama
- **Gdje:** PHP, sve tri rute.
- **Problem:** Ulogirani korisnik može spamati `/spremi` (svaki poziv = DB write). Praktični rizik nizak (mali broj korisnika), ali endpoint je jeftin za zloupotrebu.
- **Prijedlog:** Jednostavan transient-based throttle po korisniku (npr. max 30 spremanja/min) ili Hostinger/LiteSpeed pravilo.

### 1.5 NISKO — Javni repo otkriva strukturu API-ja
- **Problem:** Rute i format payloada su javno vidljivi. Uz ispravnu autorizaciju to nije rupa, ali smanjuje "trud" napadaču.
- **Prijedlog:** Razmisliti o privatnom repou (posebno jer je ovo klijentski rad).

### Pozitivni nalazi (bez akcije)
- **XSS:** React automatski escapa sav sadržaj; nema `dangerouslySetInnerHTML`/`innerHTML`; `note` polja prolaze `sanitize_text_field`; shortcode atributi idu kroz `esc_attr`/`esc_url`. Čisto.
- **Autorizacija:** per-user izolacija preko `get_current_user_id()` — korisnik ne može doći do tuđih podataka. `permission_callback` postoji na sve tri rute.
- **CSRF/CORS:** WP nonce mehanizam + default WP CORS ponašanje pokrivaju cross-origin scenarije. (Potvrditi da nijedan plugin ne otvara CORS globalno.)
- **Tajne:** pregledana kompletna git povijest (uključujući izbrisane `netlify.toml` i stare buildove) — nema ključeva, lozinki ni tokena. `.gitignore` uredan.

---

## 2. Financijska ispravnost

### 2.1 SREDNJE — Novac se vodi kao float na cijelom putu
- **Gdje:** `App.jsx:299, 332, 378–379` (`parseFloat`, `reduce` zbrajanje); PHP `floatval`.
- **Problem:** Klasične binarne float greške (0.1 + 0.2 ≠ 0.3). Prikaz kroz `Intl.NumberFormat` na 2 decimale maskira odstupanja, ali zbrojevi ("Potrošeno", "Ostaje", postoci po kategoriji) mogu odstupiti za cent, a spremljene vrijednosti akumuliraju šum. Za osobni tracker nije katastrofa, ali za financijsku aplikaciju je pogrešan temelj.
- **Prijedlog:** Interno voditi iznose kao **cijele centе** (integer), konvertirati samo na prikazu; ili minimalno zaokruživati na 2 decimale pri unosu i nakon svakog zbrajanja. Zahtijeva migraciju postojećih podataka — pažljivo, uz backup.

### 2.2 SREDNJE — ID unosa je `Date.now()` → moguće kolizije
- **Gdje:** `App.jsx:307, 332` (i migracija `:252, :257`).
- **Problem:** Dva unosa u istoj milisekundi dobiju isti `id`; uređivanje/brisanje po `id`-u tada zahvaća oba. Rijetko, ali moguće (Enter + brzi ponovni unos, sinkronizacija između uređaja).
- **Prijedlog:** `crypto.randomUUID()` uz zadržavanje kompatibilnosti sa starim numeričkim id-evima.

### 2.3 SREDNJE — Nema gornje granice iznosa
- **Gdje:** `App.jsx` unos forme; PHP bez limita.
- **Problem:** `1e15` je validan unos; ekstremne vrijednosti razbijaju layout i statistiku, a float gubi preciznost iznad 2^53.
- **Prijedlog:** Razuman max (npr. 1.000.000 €) na frontendu i backendu.

*(Konverzije valuta nema — aplikacija je isključivo EUR.)*

---

## 3. Bugovi i stabilnost

### 3.1 KRITIČNO — Neuspjelo početno učitavanje + autosave = brisanje svih podataka na serveru
- **Gdje:** `App.jsx:228–266` (initial load; `finally(() => setLoaded(true))` na liniji 266) u kombinaciji s autosave efektom `:271–282`.
- **Problem:** Ako `GET /podaci` ne uspije (mobilna mreža, hiccup servera, istekla sesija), app pokaže toast "osvježite stranicu", ali postavi `loaded = true` i **nastavi raditi s praznim stanjem**. Prvi sljedeći korisnikov unos pokreće autosave koji na server pošalje prazan dataset + taj jedan unos — i **trajno prebriše sve klijentove podatke** (vidi 1.2: server nema backup). Ovo je realan, tihi data-loss scenarij i najozbiljniji pojedinačni nalaz u aplikaciji.
- **Prijedlog:** Nakon neuspjelog učitavanja blokirati unos i autosave (read-only stanje s gumbom "Pokušaj ponovno"); autosave dozvoliti tek nakon uspješnog GET-a.

### 3.2 VISOKO — Dva otvorena uređaja/taba: last-write-wins, tihi gubitak unosa
- **Gdje:** arhitektura spremanja (cijeli dataset, `App.jsx:184` + PHP `ft_spremi_podaci`).
- **Problem:** Mobitel i desktop istovremeno → svaki autosave prepisuje tuđe promjene bez upozorenja. Klijent unese trošak na mobitelu, desktop 5 min kasnije autosavea staro stanje — unos nestaje.
- **Prijedlog:** Minimalno: verzijski broj/timestamp u payloadu koji server uspoređuje i odbija zastarjelo spremanje (uz poruku korisniku). Ispravno dugoročno: per-unos operacije umjesto full-blob spremanja.

### 3.3 SREDNJE — Retry ne razlikuje uzrok neuspjeha
- **Gdje:** `App.jsx:199` (`persistWithRetry`).
- **Problem:** 403 (istekli nonce) i mrežni prekid tretiraju se isto — retry s istim noncem ne može uspjeti. Periodični refresh (10 min) to uglavnom pokriva, ali laptop probuđen iz sleepa ima stari nonce do sljedećeg intervala; spremanje u tom prozoru padne uz poruku korisniku iako bi se dalo tiho spasiti.
- **Prijedlog:** Na 403 prvo dohvatiti svjež nonce pa ponoviti spremanje; refresh nonce-a i na `visibilitychange` event.

### 3.4 NISKO — Datum unosa za prošle mjesece je "današnji dan clampan u taj mjesec"
- **Gdje:** `App.jsx:156` (`dateInSelectedMonth`).
- **Problem:** Unos dodan 20.7. za svibanj dobije datum 20.5. — semantički čudno, korisnik ne bira dan. Namjerna odluka, ali vrijedi potvrditi s klijentom.
- **Prijedlog:** Opcionalni date picker ili barem dokumentirati ponašanje.

### Pozitivno
- Rukovanje greškama je uredno: korisnik vidi toast poruke na hrvatskom, nikad sirovu grešku ili stack trace. `res.ok` se ispravno provjerava (commit d78dd3f riješio tihi neuspjeh).

---

## 4. Kvaliteta koda i arhitektura

### 4.1 SREDNJE — Nema TypeScripta; cijela aplikacija u jednoj komponenti
- **Gdje:** `src/App.jsx` (805 linija, ~25 state varijabli).
- **Problem:** Pretpostavka o TS-u iz specifikacije ne stoji — kod je čisti JSX bez tipova (`@types/react` u devDeps je mrtvi teret). Sva logika, ikone, formatiranje i 3 taba UI-ja u jednoj datoteci — svaka izmjena nosi rizik regresije negdje drugdje.
- **Prijedlog:** Postupno razbiti na module (ikone, konstante, API sloj, tabovi) — bez big-bang rewritea; TS migracija opcionalna, niskog prioriteta za ovako malu app.

### 4.2 SREDNJE — PHP backend nije verzioniran u repou
- **Gdje:** WP Code Snippets plugin na klijentovom hostingu.
- **Problem:** Sigurnosno najkritičniji kod živi samo u WP adminu — može se slučajno editirati ili deaktivirati iz sučelja, nema povijesti promjena, a repo ne odražava stvarni sustav (ovaj audit je to i dokazao).
- **Prijedlog:** Dodati snippet u repo (npr. `backend/wp-snippet.php`) kao source of truth; svaka promjena prvo u git, pa copy-paste u WP.

### 4.3 NISKO — Buildani bundle commitan u repo root
- **Gdje:** `index.js` (551 KB) u rootu.
- **Problem:** Nekonvencionalno, ali namjerno (githack deployment). Rizik: zaboravljeni build → `src` i bundle se raziđu. Trenutno su sinkronizirani (v1.8 = HEAD funkcionalno).
- **Prijedlog:** Nakon rješavanja 1.1 (self-hosting) bundle više ne mora biti u repou; do tada — build provjera prije svakog taga.

### 4.4 NISKO — Ranjivosti u ovisnostima: samo dev-dependencies
- **Gdje:** `package-lock.json` — `npm audit`: 2 nalaza (vite HIGH — path traversal u dev serveru; esbuild MODERATE — dev server request leak).
- **Problem:** Obje ranjivosti pogađaju **samo lokalni dev server**, ne isporučeni bundle. Runtime ovisnosti (react, react-dom, recharts) su čiste.
- **Prijedlog:** `npm audit fix` / bump Vite pri sljedećoj dorada-sesiji.

---

## 5. Performanse

### 5.1 SREDNJE — Svako spremanje šalje kompletnu povijest svih mjeseci
- **Gdje:** `App.jsx:184` + PHP.
- **Problem:** Payload raste linearno s korištenjem (nakon 3 godine: tisuće unosa po svakom pritisku tipke — debounce ublažava, ali ne rješava). Isto vrijedi za `get_user_meta` blob na svakom učitavanju.
- **Prijedlog:** Rješava se zajedno s 3.2 (per-unos operacije ili barem spremanje po mjesecu).

### 5.2 NISKO — Bundle 551 KB, jedan chunk
- **Problem:** React + Recharts u jednom fajlu; za widget prihvatljivo, `!important` CSS strategija je pragmatičan odgovor na agresivnu temu.
- **Prijedlog:** Ništa hitno; eventualno lazy-load Rechartsa (učitava se i kad korisnik nikad ne otvori Pregled).

*(N+1 upita nema — backend ima po jedan meta upit po requestu.)*

---

## 6. Hosting / deployment

### 6.1 VISOKO — Backup strategija nepoznata/nepotvrđena
- **Problem:** Svi klijentovi podaci su jedan redak u `wp_usermeta`. Ne znamo rade li Hostinger automatski backupi, koliko se čuvaju, ni je li restore ikad testiran. U kombinaciji s nalazima 1.2 i 3.1 ovo je najveći operativni rizik.
- **Prijedlog:** ODMAH (prije bilo kakvih dorada): ručni export `SELECT * FROM wp_usermeta WHERE meta_key='ft_podaci'` + provjeriti/uključiti Hostinger automatske backupe + jednom testirati restore na stagingu.

### 6.2 SREDNJE — LiteSpeed cache već je uzrokovao produkcijske bugove
- **Gdje:** povijest (commit 7d78198): cache je vraćao zamrznute REST odgovore ("0/prazno").
- **Problem:** Riješeno client-side workaroundom (`cache: no-store` + `?_=timestamp`). Ispravnije je isključiti cache za REST na razini servera — workaround ovisi o tome da se nitko ne "počisti" kod.
- **Prijedlog:** LiteSpeed exclude pravilo za `/wp-json/financijski-tracker/*`.

### 6.3 SREDNJE — Ovisnost o githack dostupnosti
- Pokriveno nalazom 1.1 — uz sigurnosni, postoji i čisti availability rizik (servis bez SLA).

---

## Predloženi redoslijed rješavanja

| # | Nalaz | Ozbiljnost | Zašto ovim redom |
|---|-------|-----------|------------------|
| 0 | 6.1 Backup `ft_podaci` + potvrda Hostinger backupa | VISOKO | Preduvjet za SVE ostalo — bez backupa nijedan popravak nije siguran |
| 1 | 3.1 Blokada autosavea nakon neuspjelog učitavanja | KRITIČNO | Realan tihi total-data-loss scenarij |
| 2 | 1.1 Samohostati bundle (maknuti githack) | KRITIČNO | Supply-chain + availability |
| 3 | 1.2 Server-side backup verzija prije prepisivanja | VISOKO | Sigurnosna mreža za sve buduće bugove |
| 4 | 3.2 Zaštita od last-write-wins (verzija/timestamp) | VISOKO | Poznati multi-device scenarij |
| 5 | 1.3 Server-side validacija payloada | VISOKO | Integritet podataka |
| 6 | 4.2 PHP snippet u repo | SREDNJE | Brzo, bez rizika, omogućuje daljnji rad |
| 7 | 2.1 Novac: centi/zaokruživanje (+ migracija) | SREDNJE | Zahtijeva migraciju — tek uz backupe iz koraka 0 i 3 |
| 8 | 2.2, 3.3, 6.2, 1.4, 2.3 | SREDNJE | Pojedinačni fokusirani taskovi |
| 9 | 4.1, 4.3, 4.4, 5.x, 3.4 | NISKO | Kvaliteta života, bez žurbe |

## Siguran način testiranja (obavezno prije dorada)

Nikakvo testiranje na produkcijskoj bazi ni klijentovom WP korisniku. Umjesto toga: lokalni WordPress (LocalWP ili Docker `wordpress:latest`) + copy-paste PHP snippeta + testni korisnik + `npm run dev` s `data-ft-root` prema lokalnom WP-u. Alternativa: Hostinger staging kopija site-a ako je dostupna u klijentovom planu. Produkcijski deploy tek nakon što fix prođe na lokalnoj/staging kopiji, uz svjež backup `ft_podaci` neposredno prije.

## Otvorena pitanja (za tebe/klijenta)

1. Koliko WP korisnika stvarno koristi tracker (utječe na prioritet 3.2 i 1.4)?
2. Postoje li Hostinger automatski backupi i koliko se čuvaju?
3. Je li pravilo "prihod prije troška" klijentov zahtjev?
4. Je li klijent ikad prijavio nestale unose ili krive zbrojeve (simptomi nalaza 3.1/3.2/2.1)?
5. Ima li klijentov Hostinger plan staging okruženje?
