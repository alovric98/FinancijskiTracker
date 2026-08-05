# 💰 Financijski Tracker — Wealth Builder

Aplikacija za praćenje osobnih prihoda i troškova po kategorijama i mjesecima,
ugrađena u platformu Wealth Builder (`wealth-builder.ai`).

> **Novi na projektu?** Kreni od [`docs/HANDOVER.md`](docs/HANDOVER.md) — to je
> ulazni dokument s pregledom cjeline i poveznicama na sve ostalo.

## Značajke

- Unos prihoda i troškova po devet kategorija
- Mjesečni pregled: potrošeno, preostalo, raspodjela po kategorijama
- Grafički prikaz potrošnje
- Uređivanje i brisanje unosa, kretanje po mjesecima
- Automatsko spremanje po korisniku preko WordPress REST API-ja
- Tri rotirajuće sigurnosne kopije podataka po korisniku
- Javna demo inačica bez spremanja (`[financijski_tracker_demo]`)

## Arhitektura ukratko

React (Vite) aplikacija gradi se u jednu datoteku `index.js` koja se poslužuje
s WordPress hostinga. Backend su tri REST rute u PHP snippetu
(`backend/wp-snippet.php`), a podaci se čuvaju po korisniku u `wp_usermeta`.

Kad mount element nema atribut `data-ft-root` (demo shortcode), aplikacija radi
isključivo u memoriji preglednika — bez ijednog poziva prema serveru.

Detaljna karta sustava: [`docs/HOSTING.md`](docs/HOSTING.md).

## Razvoj

```bash
npm install
npm run dev
```

Dev server radi bez WordPressa, u memorijskom načinu (kao demo) — dovoljno za
rad na sučelju. Za provjeru spremanja i cjelovitog toka koristi se lokalna
WordPress kopija: [`docs/LOKALNI_SETUP.md`](docs/LOKALNI_SETUP.md).

## Build

```bash
npm run build
```

Izlaz je `index.js` u korijenu repozitorija (ne u `dist/` — vidi
`vite.config.js`). Ta datoteka se postavlja na hosting po postupku iz
[`docs/DEPLOY.md`](docs/DEPLOY.md).

## Dokumentacija

| Dokument | Sadržaj |
|---|---|
| [`docs/HANDOVER.md`](docs/HANDOVER.md) | ulazna točka, pregled cjeline |
| [`docs/HOSTING.md`](docs/HOSTING.md) | gdje je što na hostingu i u bazi |
| [`docs/DEPLOY.md`](docs/DEPLOY.md) | objava izmjena i povratak unatrag |
| [`docs/BACKUP.md`](docs/BACKUP.md) | sigurnosne kopije i oporavak |
| [`docs/LOKALNI_SETUP.md`](docs/LOKALNI_SETUP.md) | lokalna kopija (Docker) |
| [`docs/AUDIT.md`](docs/AUDIT.md) | sigurnosni pregled s nalazima |
| [`docs/PRISTUPI.md`](docs/PRISTUPI.md) | registar pristupa |
| [`PRD.md`](PRD.md) | plan razvoja i pravila rada |

## Tech stack

- [React 18](https://react.dev/)
- [Vite](https://vitejs.dev/)
- [Recharts](https://recharts.org/)
- WordPress REST API (PHP snippet)
