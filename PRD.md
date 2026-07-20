# PRD — Financijski Tracker: dorade nakon audita + praćenje aktivnosti

Verzija: 1.0 · Datum: 20.7.2026. · Vlasnik: Toni (alovric98)
Referentni dokumenti: `docs/AUDIT.md` (nalaz audita), PHP snippet u WP Code Snippets pluginu.
Produkcija: https://wealth-builder.ai/moji-troskovi/ — **aktivna, sa živim korisnicima i pravim podacima.**

---

## 1. Cilj projekta

Otkloniti sve nalaze iz audita (2 kritična, 4 visoka, ostali srednji/niski) i dodati praćenje aktivnosti korisnika (WP → Zapier → ActiveCampaign), **bez ijedne promjene u ponašanju aplikacije vidljive korisniku i bez ikakvog rizika za postojeće podatke.**

## 2. Vrhovno pravilo: NULTA REGRESIJA

Aplikacija danas radi i koriste je živi korisnici. Zato za SVAKU fazu bez iznimke vrijedi:

1. **Format podataka u `ft_podaci` se ne mijenja** osim u fazi 7, i to isključivo uz migraciju koja stari format i dalje čita (kao što postojeći kod već radi za v1.3 formate).
2. **Svaka faza se razvija i testira na lokalnoj/staging kopiji** — nikad direktno na produkciji (protokol u §5).
3. **Prije svakog produkcijskog deploya:** svjež export `ft_podaci` svih korisnika + zabilježen točan rollback korak (koju datoteku/snippet vratiti na koju verziju).
4. **Nakon svakog deploya — smoke test na produkciji** (§5.3): učitavanje postojećih podataka, dodavanje i brisanje test-unosa na TVOM korisniku (ne klijentovom), provjera svih 3 tabova i navigacije po mjesecima.
5. **Jedna faza = jedan git commit/tag** — u svakom trenutku se zna koja verzija radi i na što se vraća.
6. Ako faza ne prođe smoke test → **trenutni rollback**, bez "krpanja uživo"; problem se rješava ispravkom baznog prompta u novom chatu.

## 3. Opseg

**U opsegu:** svih 9 koraka iz audit tablice + webhook faza (dnevni sažetak aktivnosti u ActiveCampaign preko Zapiera).
**Izvan opsega:** nove korisničke funkcionalnosti, redizajn, TypeScript migracija, promjena hostinga, višejezičnost, promjene poslovnih pravila (npr. "prihod prije troška" ostaje kako je).

## 4. Arhitektura (sažetak, detalji u AUDIT.md)

React 18 + Vite SPA (`src/App.jsx`), embedana u WordPress (Elementor, Wealth Builder tema) shortcodeom. Backend: 3 custom WP REST rute (`/podaci`, `/spremi`, `/nonce`) u Code Snippets pluginu; podaci su JSON blob u `wp_usermeta.ft_podaci`, po korisniku. Bundle se trenutno servira s rawcdn.githack.com (mijenja se u fazi 2).

## 5. Radni protokol (Claude Code, VS Code)

### 5.1 Po fazi
1. Novi Claude Code chat za SVAKU fazu. U kontekst uvijek ide: `PRD.md`, `docs/AUDIT.md`, i backend snippet (`backend/wp-snippet.php` nakon faze 0).
2. Prompt za fazu daje orkestrator (Cowork chat) — ne improvizira se.
3. Claude Code prvo radi u **Plan modu**: tehnički sažetak (što točno, koje datoteke, što se NE dira, kriterij uspjeha). Kod se piše tek nakon tvog eksplicitnog odobrenja.
4. Nakon implementacije: test na lokalnoj kopiji → tvoja potvrda → commit → deploy po §5.2 → smoke test → tag.

### 5.2 Okruženja i deploy
- **Lokalno:** LocalWP ili Docker `wordpress:latest` + kopija PHP snippeta + testni WP korisnik + `npm run dev` (ili lokalni build) s `data-ft-root` prema lokalnom WP-u. Po mogućnosti: uvezena kopija produkcijskog `ft_podaci` retka (anonimizirana ako treba) radi realnog testa migracija.
- **Produkcija (Hostinger):** deploy = zamjena `index.js` datoteke i/ili ažuriranje snippeta u Code Snippets pluginu. Uvijek uz backup po §2.3.
- Provjeriti ima li Hostinger plan staging funkciju — ako da, koristiti nju umjesto/uz lokalno.

### 5.3 Smoke test checklist (nakon svakog deploya)
- [ ] Stranica se učita, postojeći podaci vidljivi (ispravni zbrojevi Potrošeno/Ostaje)
- [ ] Dodavanje troška radi + vidljiv u Pregled i Lista tabu
- [ ] Uređivanje i brisanje unosa radi
- [ ] Dodavanje/uređivanje prihoda radi
- [ ] Navigacija na prošli mjesec prikazuje stare podatke
- [ ] Refresh stranice — sve spremljeno je i dalje tu
- [ ] Konzola preglednika bez grešaka

---

## 6. Faze

> Ozbiljnosti i detalji svakog nalaza: `docs/AUDIT.md`. Ovdje: cilj, dirane datoteke, kriterij uspjeha, rollback.

### Faza 0 — Sigurnosna mreža (PREDUVJET, bez koda u appu)
- **Cilj:** Ručni SQL export svih `ft_podaci` redaka; potvrditi/uključiti Hostinger automatske backupe; postaviti lokalno okruženje iz §5.2; dodati PHP snippet u repo kao `backend/wp-snippet.php` (dio audita 4.2 — povučeno naprijed jer je preduvjet za rad).
- **Kriterij uspjeha:** backup datoteka postoji i otvara se; lokalni WP servira app s testnim podacima; repo sadrži backend.
- **Rollback:** n/a (ništa se ne mijenja na produkciji).

### Faza 1 — KRITIČNO: autosave ne smije raditi nakon neuspjelog učitavanja (audit 3.1)
- **Dira:** `src/App.jsx` (initial load effect, autosave effect).
- **Cilj:** Ako `GET /podaci` ne uspije → app ide u read-only stanje s porukom i gumbom "Pokušaj ponovno"; autosave i ručno spremanje blokirani dok učitavanje ne uspije. Ponašanje pri uspješnom učitavanju: apsolutno nepromijenjeno.
- **Kriterij uspjeha:** simuliran pad GET-a (blokiran request u DevTools) → unos nemoguć, ništa se ne šalje na server; nakon "Pokušaj ponovno" i uspješnog GET-a sve radi normalno.
- **Rollback:** vratiti prethodni `index.js`.

### Faza 2 — KRITIČNO: samohostati bundle, maknuti githack (audit 1.1)
- **Dira:** PHP snippet (`ft_shortcode`) + upload `index.js` na Hostinger.
- **Cilj:** `index.js` se servira s wealth-builder.ai (child theme ili uploads), verzija u query stringu (`?v=…`) za cache-busting. Githack URL uklonjen.
- **Kriterij uspjeha:** Network tab pokazuje bundle s vlastite domene; app radi identično; stara githack verzija više se nigdje ne referencira.
- **Rollback:** vratiti stari shortcode (githack URL) — jedan copy-paste.

### Faza 3 — VISOKO: server-side verzije prije prepisivanja (audit 1.2)
- **Dira:** PHP snippet (`ft_spremi_podaci`).
- **Cilj:** Prije svakog `update_user_meta` spremiti prethodno stanje u rotirajuće backup ključeve (`ft_podaci_bak1..3` + timestamp). Dodatno: sanity provjera — ako novi payload ima drastično manje unosa od postojećeg (npr. <50% uz >20 postojećih), spremanje se odbija uz jasan odgovor koji frontend prikaže.
- **Kriterij uspjeha:** normalno spremanje radi bez ikakve razlike za korisnika; namjerno poslan prazan payload biva odbijen; backup ključevi se rotiraju.
- **Rollback:** vratiti prethodnu verziju snippeta.

### Faza 4 — VISOKO: zaštita od last-write-wins (audit 3.2)
- **Dira:** PHP snippet + `src/App.jsx`.
- **Cilj:** `/podaci` vraća i verzijski broj (ili timestamp zadnjeg spremanja); `/spremi` ga prima natrag i odbija spremanje ako se u međuvremenu promijenio — frontend tada ponudi "Učitaj najnovije podatke". Stari bundle (bez verzije u payloadu) mora i dalje moći spremati tijekom prijelaza (verzija opcionalna → obavezna tek kad je novi bundle na produkciji).
- **Kriterij uspjeha:** dva taba otvorena istovremeno — drugi tab pri spremanju dobije upozorenje umjesto tihog prepisivanja; jedan uređaj radi kao i prije.
- **Rollback:** snippet + `index.js` na prethodni tag.

### Faza 5 — VISOKO: server-side validacija payloada (audit 1.3)
- **Dira:** PHP snippet (`ft_sanitize_list`).
- **Cilj:** whitelist 9 kategorija, regex validacija datuma `d.m.yyyy.`, `amount` u (0, 1.000.000], limit duljine note (80) i broja unosa (npr. 10.000), nevaljane stavke se odbacuju uz logiranje. **Prvo provjeriti postojeće produkcijske podatke** — validacija ne smije odbaciti nijedan legitiman postojeći unos.
- **Kriterij uspjeha:** postojeći podaci prolaze bez gubitka; ručno poslan payload sa smeće-datumom/negativnim iznosom/izmišljenom kategorijom biva očišćen.
- **Rollback:** prethodna verzija snippeta.

### Faza 6 — SREDNJE: retry svjestan nonce-a + LiteSpeed exclude (audit 3.3, 6.2)
- **Dira:** `src/App.jsx` + LiteSpeed/hosting konfiguracija.
- **Cilj:** na 403 prvo dohvatiti svjež nonce pa ponoviti spremanje; nonce refresh i na `visibilitychange`. Na hostingu: cache exclude za `/wp-json/financijski-tracker/*`.
- **Kriterij uspjeha:** laptop-iz-sleepa scenarij sprema bez greške; REST odgovori nikad ne dolaze iz cachea (header provjera).
- **Rollback:** prethodni `index.js`; cache pravilo se jednostavno ukloni.

### Faza 7 — SREDNJE: ispravno rukovanje novcem (audit 2.1) — NAJRIZIČNIJA FAZA
- **Dira:** `src/App.jsx` + PHP snippet + **migracija podataka**.
- **Cilj:** iznosi interno kao cijeli centi (integer); konverzija na prikazu. Migracija: postojeći float iznosi → centi zaokruživanjem na 2 decimale, uz obostranu kompatibilnost čitanja (kao postojeće v1.3 migracije). Zbrojevi se moraju poklapati s onim što korisnik danas vidi.
- **Kriterij uspjeha:** na kopiji produkcijskih podataka: svi zbrojevi prije i poslije migracije identični na cent; unos/uređivanje/brisanje radi; stari format se i dalje čita.
- **Rollback:** backup iz faze 3 + prethodni bundle/snippet. **Ova faza se radi zadnja od popravaka i tek kad faze 0 i 3 dokazano rade.**
- Napomena: raditi u fazi 7 tek nakon nekoliko tjedana stabilnog rada faza 1–6, ili preskočiti ako procijenimo da rizik migracije nadmašuje korist (odluka prije početka faze).

### Faza 8 — SREDNJE paket: manji popravci (audit 2.2, 1.4, 2.3)
- **Dira:** `src/App.jsx` + PHP snippet. Svaki podzadatak = zaseban chat/commit:
  - 8a: `crypto.randomUUID()` za nove unose (stari numerički id-evi ostaju validni)
  - 8b: rate limit na `/spremi` (transient, npr. 30/min po korisniku)
  - 8c: max iznos na frontendu (uz backend limit iz faze 5)
- **Rollback:** po podzadatku, prethodna verzija.

### Faza 9 — NISKO paket: kvaliteta (audit 4.1, 4.3, 4.4, 5.2, 3.4)
- Razbijanje `App.jsx` na module (bez promjene ponašanja — snapshot usporedba UI-ja), `npm audit fix` (samo dev deps), odluka o buildu u repou, eventualni date picker (3.4 — samo ako klijent potvrdi da želi). Svaki podzadatak zaseban chat.

### Faza 10 — NOVO: praćenje aktivnosti korisnika (WP → Zapier → ActiveCampaign)

**Poslovni cilj:** uvid u to koliko je koji korisnik aktivan u trackeru, unutar ActiveCampaigna.

**Privatnost (zaključano):** šalju se ISKLJUČIVO metapodaci o aktivnosti. **Iznosi, kategorije, napomene i bilo kakvi financijski podaci NIKAD ne napuštaju server.** Ovo je uvjet, ne preporuka — radi se o financijskim podacima živih korisnika i GDPR obvezama. Klijenta upozoriti da korisnici trebaju biti pokriveni privacy policyjem za ovakvu obradu.

**Mehanizam (zaključano):** dnevni WP Cron event na serveru — ne dira frontend, ne usporava spremanje, troši 1 Zapier task dnevno po korisniku s aktivnošću (a ne po svakom autosaveu).

**Specifikacija:**
- PHP snippet dobiva: (a) bilježenje `ft_last_saved` timestampa pri svakom spremanju (jedan `update_user_meta`, zanemariv trošak); (b) dnevni cron koji za svakog korisnika s `ft_podaci` izračuna payload i POST-a ga na Zapier Catch Hook.
- Payload po korisniku: `email`, `user_id`, `total_entries` (broj troškova), `total_income_entries`, `entries_last_24h` (po `date` polju), `active_months` (broj mjeseci s barem 1 unosom), `last_saved_at`, `last_sent_at`.
- Zapier webhook URL u `wp_options` (ne hardkodiran u snippetu koji ide u javni repo!).
- Zapier: Catch Hook → ActiveCampaign "Update Contact" (match po emailu) s custom poljima (`FT_LAST_ACTIVE`, `FT_TOTAL_ENTRIES`, `FT_ENTRIES_24H`, `FT_ACTIVE_MONTHS`).
- Slanje samo za korisnike s promjenom od zadnjeg slanja (štedi Zapier taskove).
- Greška pri slanju: tiho logirati, NIKAD ne smije utjecati na rad aplikacije.
- **Kriterij uspjeha:** testni korisnik na lokalnom WP-u → ručno okinut cron → kontakt u AC ažuriran ispravnim brojkama; u payloadu dokazano nema financijskih vrijednosti; produkcijska app radi identično.
- **Rollback:** deaktivacija cron hooka — aplikacija ni ne primjećuje.
- **Otvoreno prije početka faze:** ima li klijent postojeće AC custom fieldove/tagove koje želi koristiti; treba li i tag "aktivan/neaktivan" (npr. bez unosa 14 dana) za automatizacije.

## 7. Redoslijed i ovisnosti

Faza 0 → 1 → 2 → 3 → 4 → 5 → 6 → (pauza, stabilizacija) → 7 (opcionalno/odluka) → 8 → 9 → 10.
Faza 10 smije početi i ranije (nakon faze 3) ako zatreba klijentu — neovisna je o popravcima 4–9, ali NE prije faza 0–3 (backup infrastruktura).

## 8. Kriterij završetka projekta

Svi nalazi iz AUDIT.md riješeni ili svjesno odgođeni uz zabilježenu odluku; webhook u produkciji; smoke test checklist prolazi; klijent potvrdio da korisnici nemaju prijavljenih problema 2 tjedna nakon zadnjeg deploya; repo sadrži frontend + backend + dokumentaciju sinkroniziranu sa stanjem produkcije.
