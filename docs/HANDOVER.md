# HANDOVER.md — Primopredaja projekta

Ulazni dokument za svakoga tko preuzima ili nadzire ovaj projekt. Ako čitaš
samo jedan dokument, čitaj ovaj — ostali su ovdje popisani i objašnjeni.

---

## 1. Što je ovo

Alat za praćenje osobnih prihoda i troškova, ugrađen u platformu Wealth
Builder (`wealth-builder.ai`). Korisnik upisuje mjesečne prihode i troškove
po kategorijama, vidi koliko je potrošio i koliko mu ostaje, te pregledava
prošla razdoblja.

Alat postoji u dvije inačice:

- **Pravi tracker** — za prijavljene korisnike s pretplatom, podaci se trajno
  spremaju na server, po korisniku.
- **Javni demo** — dostupan svima bez registracije, ništa se ne sprema, unosi
  nestaju osvježavanjem stranice.

Obje inačice pokreće ista aplikacija; razlikuju se samo po tome je li
uključeno spremanje.

---

## 2. Kako je posloženo

```
React aplikacija (izvorni kod u src/)
        │  npm run build
        ▼
   index.js  ──────────►  wp-content/uploads/ft-tracker/index.js
                                        │
                                        │ učitava ga
                                        ▼
PHP snippet (WPCode)  ─────────►  shortcode na goloj stranici
        │                                │
        │ REST rute                      │ iframe
        ▼                                ▼
  wp_usermeta (podaci)            javna stranica
```

Tri sastavna dijela:

1. **Aplikacija** — React, izvorni kod u `src/`, gradi se u jednu datoteku
   `index.js` koja se postavlja na hosting.
2. **Backend** — PHP snippet u WordPressu. Sadrži tri REST rute, provjere pri
   spremanju, sigurnosne kopije i shortcodeove.
3. **Podaci** — JSON zapis po korisniku u tablici `wp_usermeta`, uz tri
   rotirajuće sigurnosne kopije.

Detaljna karta s točnim putanjama, nazivima stranica i ključevima u bazi:
**`HOSTING.md`**.

---

## 3. Dokumentacija — što je gdje

| Dokument | Sadržaj |
|---|---|
| `HANDOVER.md` | ovaj dokument — ulazna točka i pregled |
| `HOSTING.md` | karta sustava: gdje je što na hostingu i u bazi |
| `DEPLOY.md` | postupak objave izmjena i povratka na prethodnu verziju |
| `BACKUP.md` | izrada sigurnosne kopije podataka i oporavak |
| `LOKALNI_SETUP.md` | podizanje lokalne kopije za probe (Docker) |
| `AUDIT.md` | sigurnosni pregled s popisom nalaza i prioriteta |
| `PRISTUPI.md` | registar pristupa — tko je vlasnik čega |
| `../PRD.md` | plan razvoja, faze i pravila rada |
| `../README.md` | kratak opis aplikacije i pokretanje |

---

## 4. Prvi koraci za nekoga tko preuzima

1. Pročitati ovaj dokument i `HOSTING.md` — daje potpunu sliku u petnaestak
   minuta.
2. Podići lokalnu kopiju po `LOKALNI_SETUP.md`. Sve probe idu tamo, nikad na
   produkciji.
3. Pročitati `PRD.md` §2 (Nulta regresija) i §5 (Radni protokol) prije nego se
   dirne ijedna linija koda.
4. Prije prve objave izmjene pročitati `DEPLOY.md` u cijelosti i napraviti
   svježu sigurnosnu kopiju po `BACKUP.md`.

---

## 5. Pravila rada koja se ne preskaču

Aplikaciju koriste stvarni korisnici i u njoj su njihovi financijski podaci.
Zato vrijedi:

- **Ništa se ne testira na produkciji.** Svaka izmjena prvo prolazi lokalnu
  kopiju.
- **Prije svake objave — svježa sigurnosna kopija podataka** i zapisan
  postupak povratka unatrag.
- **Nakon svake objave — provjera osnovnih funkcija** po popisu iz `PRD.md`
  §5.3.
- **Jedna izmjena = jedan zapis u repozitoriju s oznakom verzije**, da se u
  svakom trenutku zna na što se vraća.
- **Ako provjera padne — povratak na prethodnu verziju**, bez popravljanja
  uživo.
- **Format spremljenih podataka se ne mijenja** bez migracije koja i dalje
  čita stari oblik.

---

## 6. Stanje projekta

**Objavljeno i u upotrebi:**

- Aplikacija sa svim funkcijama unosa, pregleda i uređivanja
- Spremanje po korisniku, automatsko, bez ručnog potvrđivanja
- Tri rotirajuće sigurnosne kopije po korisniku
- Zaštita od brisanja podataka pogrešnim spremanjem
- Zaštita od sudara kad je alat otvoren na dva uređaja
- Prepoznavanje i prijenos podataka iz starijih oblika zapisa
- Javna demo verzija bez spremanja
- Trenutna verzija aplikacije: **v2.2**

**Provedeno iz sigurnosnog pregleda:** faze 0 do 4 (sigurnosna mreža, zaštita
od gubitka podataka pri prekidu veze, prebacivanje na vlastiti poslužitelj,
sigurnosne kopije na serveru, zaštita od sudara dva uređaja).

**Otvoreno:** faze 5 do 10 iz `PRD.md` — provjera podataka na serveru,
pametniji ponovni pokušaj spremanja, rukovanje novcem bez zaokruživanja,
manji popravci, kvaliteta koda, praćenje aktivnosti korisnika. Prioriteti i
obrazloženja su u `AUDIT.md`.

---

## 7. Poznata ograničenja

Zabilježena namjerno, da ih se ne otkriva iznova:

- Iznosi se vode kao decimalni brojevi s pomičnim zarezom, pa su moguća
  odstupanja u zadnjoj lipi kod dugih nizova zbrajanja (audit 2.1, faza 7).
- Provjera verzije pri spremanju drastično smanjuje, ali ne uklanja potpuno
  mogućnost da dva istovremena zahtjeva prebrišu jedan drugoga.
- Nema ograničenja broja zahtjeva prema REST rutama (audit 1.4).
- Cijela aplikacija je jedna velika komponenta bez tipova; radi pouzdano, ali
  otežava veće nadogradnje (audit 4.1).

---

## 8. Kontakt

Razvoj i održavanje: Antonio Lovrić — `lovrictoni5@gmail.com`

Za prijavu kvara korisno je priložiti: koju stranicu si otvorio, jesi li bio
prijavljen, što si pokušao napraviti, i snimku zaslona konzole preglednika
ako je moguće.
