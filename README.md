# 💰 Troškovi – Osobne Financije

Jednostavna aplikacija za praćenje osobnih troškova po kategorijama i mjesecima.

## Značajke

- Unos prihoda i troškova po kategorijama
- Prikaz potrošnje kao pie chart
- Navigacija po mjesecima
- Uređivanje i brisanje unosa
- Podaci se čuvaju u `localStorage` (bez servera)

## Pokretanje

```bash
npm install
npm run dev
```

Aplikacija se otvara na `http://localhost:5173`.

## Build za produkciju

```bash
npm run build
```

Generirani statički fajlovi nalaze se u `dist/` folderu – mogu se hosati na GitHub Pages, Netlify, Vercel i sl.

## Tech stack

- [React 18](https://react.dev/)
- [Vite](https://vitejs.dev/)
- [Recharts](https://recharts.org/)
