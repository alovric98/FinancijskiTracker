# PRISTUPI.md — Registar pristupa

Popis svih mjesta kojima projekt pristupa ili o kojima ovisi, tko im je
vlasnik i gdje se prijavljuje.

> **U ovaj dokument se NIKAD ne upisuju lozinke, tokeni ni ključevi.**
> Ovdje stoji samo *gdje* se pristupa i *tko* je vlasnik. Same lozinke idu u
> upravitelj lozinki (1Password, Bitwarden, Apple Passwords ili slično) i
> dijele se kroz njega, nikad porukom ili e-mailom.

Popuniti stupce „Vlasnik" i „Tko ima pristup" i držati ažurnim.

---

## 1. Produkcija

| Mjesto | Adresa | Vlasnik | Tko ima pristup |
|---|---|---|---|
| WordPress admin | `wealth-builder.ai/wp-admin` | | |
| Hostinger hPanel | `hpanel.hostinger.com` | | |
| Baza (phpMyAdmin) | preko hPanela | | |
| Upravitelj datoteka (FTP/File Manager) | preko hPanela | | |
| Registrar domene | | | |
| Cloudflare (ako se koristi) | | | |

---

## 2. Kod i dokumentacija

| Mjesto | Adresa | Vlasnik | Tko ima pristup |
|---|---|---|---|
| Git repozitorij | `github.com/alovric98/FinancijskiTracker` | | |

---

## 3. Vanjski servisi

| Servis | Namjena | Vlasnik | Tko ima pristup |
|---|---|---|---|
| ActiveCampaign | praćenje aktivnosti korisnika (planirano, faza 10) | | |
| | | | |

---

## 4. Ključne postavke unutar WordPressa

| Stavka | Gdje | Napomena |
|---|---|---|
| PHP snippet | WPCode → Snippets → „Financijski Tracker — backend" (ID 8937) | izvor istine je repozitorij |
| Datoteka aplikacije | `wp-content/uploads/ft-tracker/index.js` | mijenja se samo kroz postupak iz `DEPLOY.md` |
| Stranice s alatom | `/moji-troskovi/`, `/app-troskovi/`, `/demo/`, `/app-troskovi-demo/` | vidi `HOSTING.md` |
| Cache | LiteSpeed Cache / Hostinger Cache Manager | čistiti nakon svake objave nove verzije |

---

## 5. Kod prekida ili promjene suradnje

Popis koraka koje treba proći da nitko ne ostane bez pristupa i da nitko ne
zadrži pristup koji mu više ne pripada:

- [ ] Vlasništvo nad Git repozitorijem preneseno ili potvrđeno
- [ ] Novi održavatelj dodan na WordPress admin i Hostinger
- [ ] Uklonjeni pristupi osobama koje više ne rade na projektu
- [ ] Predana zadnja sigurnosna kopija podataka
- [ ] Dokumentacija ažurirana (`HANDOVER.md`, `HOSTING.md`, ovaj dokument)
- [ ] Lozinke prenesene kroz upravitelj lozinki i po potrebi promijenjene
