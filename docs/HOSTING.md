# HOSTING.md — Karta sustava na produkciji

Gdje se točno nalazi svaki dio aplikacije na `wealth-builder.ai`. Ovo je
referentna karta: kad nešto treba naći, promijeniti ili vratiti unatrag,
počinje se odavde.

Vidi i: `DEPLOY.md` (postupak objave izmjena), `BACKUP.md` (podaci),
`LOKALNI_SETUP.md` (kopija za probe), `HANDOVER.md` (pregled cjeline).

---

## 1. Okruženje

| Stavka | Vrijednost |
|---|---|
| Domena | `wealth-builder.ai` |
| Hosting | Hostinger |
| Platforma | WordPress |
| Tema | Astra (+ Astra Addon) |
| Graditelj stranica | Elementor |
| Plugin za PHP kod | WPCode (Code Snippets) |
| Caching | LiteSpeed Cache / Hostinger cache |

---

## 2. Backend kod (PHP snippet)

| Stavka | Vrijednost |
|---|---|
| Naziv snippeta | **Financijski Tracker — backend** |
| ID snippeta | `8937` |
| Gdje se uređuje | WP admin → WPCode → Snippets |
| Izravna poveznica | `/wp-admin/admin.php?page=wpcode-snippet-manager&snippet_id=8937` |
| **Izvor istine** | `backend/wp-snippet.php` u Git repozitoriju |

**Pravilo:** snippet se nikad ne mijenja izravno u WP adminu. Izmjena se prvo
radi u repozitoriju, commita, pa se kopira u WP admin. Inače se repo i
produkcija raziđu i više se ne zna što je gdje.

**Napomena pri kopiranju:** WPCode sam dodaje otvorni `<?php`, pa se prva
linija datoteke (`<?php`) **ne kopira**. Kopira se sve od
`define('FT_BUNDLE_VER', ...)` naniže.

Snippet sadrži:

- tri REST rute (`/podaci`, `/spremi`, `/nonce`)
- sanitizaciju i provjere pri spremanju
- rotaciju sigurnosnih kopija
- dva shortcodea (pravi tracker i demo)
- skriptu za automatsku visinu iframea

---

## 3. Aplikacija (JavaScript bundle)

| Stavka | Vrijednost |
|---|---|
| Putanja na serveru | `public_html/wp-content/uploads/ft-tracker/index.js` |
| Nastaje iz | `npm run build` u repozitoriju (izlaz je `index.js` u korijenu) |
| Verzija | konstanta `FT_BUNDLE_VER` u snippetu |
| URL koji app učitava | `.../uploads/ft-tracker/index.js?v=<FT_BUNDLE_VER>` |

`?v=` je oznaka protiv cachea. Pri svakoj objavi nove verzije aplikacije
**prvo** se uploada nova datoteka, **pa tek onda** podigne `FT_BUNDLE_VER`.
Obrnutim redoslijedom preglednici zakeširaju staru datoteku pod novom
oznakom.

U istoj mapi stoje i prethodne verzije (`index-v2.0.js`, `index-v2.1.js`, …).
To je namjerno — povratak na prethodnu verziju je preimenovanje datoteke i
vraćanje broja u snippetu.

---

## 4. Stranice i kako su povezane

Aplikacija se **ne ubacuje izravno u javnu stranicu**, nego kroz iframe na
zasebnu, golu stranicu. Razlog: CSS aplikacije stilizira `body`, pa bi se pri
izravnom ubacivanju prelio na cijelu stranicu.

```
/moji-troskovi/          javna, zaštićena prijavom i pretplatom
      │  iframe (max-width 480px)
      ▼
/app-troskovi/           gola stranica, sadrži [financijski_tracker]

/demo/                   javna, dostupna svima
      │  iframe (max-width 480px)
      ▼
/app-troskovi-demo/      gola stranica, sadrži [financijski_tracker_demo]
```

| Stranica | Sadržaj | Napomena |
|---|---|---|
| `/moji-troskovi/` | Elementor + iframe | zaštita prijavom i pretplatom |
| `/app-troskovi/` | `[financijski_tracker]` | bez zaglavlja i podnožja |
| `/demo/` | Elementor + iframe | javno, bez registracije |
| `/app-troskovi-demo/` | `[financijski_tracker_demo]` | bez zaglavlja i podnožja |

Visinu iframea aplikacija podešava sama, pa nema unutarnjeg klizača.

---

## 5. Razlika između pravog trackera i demo verzije

| | Pravi tracker | Demo |
|---|---|---|
| Shortcode | `[financijski_tracker]` | `[financijski_tracker_demo]` |
| Sprema podatke | da, po korisniku | **ne, ništa** |
| Poziva server | da | nikad |
| Prijava | obavezna | nije potrebna |
| Unosi nakon osvježavanja | ostaju | nestaju |

Tehnički: demo shortcode ne ispisuje atribute `data-ft-root` i
`data-ft-nonce` na mount element. Bez njih aplikacija ne zna adresu servera i
radi isključivo u memoriji preglednika. **Oba koriste isti bundle** — svaka
izmjena aplikacije mijenja i demo i pravi tracker.

---

## 6. REST rute

Osnovica: `https://wealth-builder.ai/wp-json/financijski-tracker/v1/`

| Ruta | Metoda | Namjena |
|---|---|---|
| `/podaci` | GET | dohvat podataka prijavljenog korisnika |
| `/spremi` | POST | spremanje podataka |
| `/nonce` | GET | osvježavanje sigurnosnog tokena |

Sve tri zahtijevaju prijavljenog korisnika. Otvaranje rute izravno u
pregledniku uvijek vraća `401` jer preglednik ne šalje sigurnosni token —
to nije kvar.

---

## 7. Podaci u bazi

Tablica `wp_usermeta`, po korisniku:

| Ključ | Sadržaj |
|---|---|
| `ft_podaci` | glavni zapis (JSON: prihodi + troškovi) |
| `ft_podaci_ver` | brojač verzije, zaštita od sudara dva uređaja |
| `ft_podaci_bak1` | sigurnosna kopija, najnovija |
| `ft_podaci_bak2` | sigurnosna kopija, starija |
| `ft_podaci_bak3` | sigurnosna kopija, najstarija |
| `ft_podaci_bak_ts` | vremena nastanka triju kopija |

Kopije se rotiraju automatski prije svakog prepisivanja, najviše jednom po
satu po korisniku. Postupak izrade i povrata: `BACKUP.md`.

---

## 8. Cache

Nakon svake promjene `FT_BUNDLE_VER` **obavezno** očistiti cache, inače
stranica poslužuje stari HTML sa starom oznakom verzije:

1. WP admin → LiteSpeed Cache → Toolbox → Purge All
2. Hostinger hPanel → Cache Manager → Purge
3. Cloudflare (ako je u upotrebi) → Caching → Purge Everything

Provjera koja verzija se stvarno poslužuje — konzola preglednika na
`/moji-troskovi/`:

```js
const d = document.querySelector('iframe').contentDocument;
console.log(d.querySelector('script[src*="ft-tracker"]').src);
```

---

## 9. Repozitorij

| Stavka | Vrijednost |
|---|---|
| Git repozitorij | `github.com/alovric98/FinancijskiTracker` |
| Glavna grana | `main` |
| Oznake verzija | `v2.0`, `v2.1`, `v2.2`, … (prate `FT_BUNDLE_VER`) |

Repozitorij je izvor istine i za frontend (`src/`) i za backend snippet
(`backend/wp-snippet.php`).
