# DEPLOY.md — Produkcijski deploy (frontend faze)

Ponovljiv postupak za deploy promjena koje diraju bundle (`src/` → `index.js`)
i/ili `backend/wp-snippet.php` na produkciju (wealth-builder.ai). Vrijedi od
Faze 2 nadalje, za svaku buduću frontend fazu — ne samo za ovu.

Ovaj deploy izvodi **isključivo čovjek, ručno**, nikad automatski. Reference:
`PRD.md` §2 (Nulta regresija) i §5.2 (Okruženja i deploy), `docs/BACKUP.md`
(detaljan postupak SQL exporta), `docs/LOKALNI_SETUP.md` (lokalno testiranje
prije nego se dođe dovde).

> ⚠️ Ne kreni na ovaj postupak dok faza nije lokalno testirana i potvrđena
> (PRD §5.1, korak 4). Ovaj dokument pretpostavlja da je taj korak već gotov.

---

## 0. Preduvjeti

- [ ] Sve promjene za ovu fazu su commitane na `main`.
- [ ] `npm run build` je pokrenut i `index.js` u repo rootu odražava zadnji `src/`.
- [ ] Faza je testirana na lokalnom Docker WP-u (`docs/LOKALNI_SETUP.md`) i
      lokalni test je prošao.
- [ ] Zabilježi koji commit/tag se deploya (npr. u ovu checklistu ili commit
      poruku) — to je referenca za rollback i za smoke test poslije.

---

## 1. Svjež backup (PRD §2, stavka 3 — OBAVEZNO prije SVAKOG deploya)

Ne preskačati čak ni ako postoji stariji backup — korisnici su mogli unijeti
nove podatke od tada.

1. **Hostinger ručni backup:** hPanel → **Websites** → wealth-builder.ai →
   **Backups** → **"Create backup"**. Ovo je dodatan, ručni backup neposredno
   prije deploya, uz automatske Hostinger backupe ako su uključeni
   (`docs/BACKUP.md` §8).
2. **phpMyAdmin export `ft_podaci`:** puni postupak (SQL upit, provjera broja
   redaka, imenovanje datoteke) je već dokumentiran u `docs/BACKUP.md` —
   ponovi korake 1–7 odande sada, prije uploada.

---

## 2. Upload bundlea (`index.js`)

1. hPanel → **Files** → **File Manager** → `wp-content/uploads/`.
2. Ako folder `ft-tracker` ne postoji — **prvi put** ga kreiraj: New Folder →
   naziv `ft-tracker`.
3. Upload `index.js` iz repo roota u `wp-content/uploads/ft-tracker/index.js`
   — overwrite ako datoteka već postoji.
4. Provjeri da je datoteka javno čitljiva (File Manager obično postavi ispravne
   permission-e automatski — ne treba ručno mijenjati osim ako upload javi
   grešku permission-a).

---

## 3. Ažuriranje snippeta (`backend/wp-snippet.php`)

1. WP Admin → **Snippets** → **"Financijski Tracker Backend"** → Edit.
2. Zamijeni **cijeli** sadržaj: copy-paste sve OD `define('FT_BUNDLE_VER', ...)`
   naniže iz `backend/wp-snippet.php` u repou.
   - Code Snippets plugin sam dodaje `<?php` omotač — **NE** kopiraj otvoreni
     `<?php` tag s vrha datoteke (dvostruki `<?php` je fatalna greška).
3. **Provjeri cijelost lijepljenja prije snimanja** (poznat problem: prvi
   redak zna otpasti pri copy-pasteu i srušiti stranicu s trackerom dok se
   ne primijeti i ispravi):
   - Zalijepljeni sadržaj mora **počinjati** s `define('FT_BUNDLE_VER', ...)`.
   - Mora **završavati** s `add_shortcode('financijski_tracker', 'ft_shortcode');`.
   - Ako bilo koji rub nedostaje — obriši sve u editoru i zalijepi ponovno,
     umjesto da ručno dopisuješ nedostajući redak.
4. **Provjeri je li `FT_BUNDLE_VER` bumpan** u odnosu na prošli deploy (npr.
   `'1.8'` → `'1.9'`)? Ako nije bumpan, preglednici i hosting cache mogu i
   dalje servirati stari bundle unatoč uploadu iz koraka 2.
5. **Update.** Provjeri da je "Run snippet everywhere" i dalje uključeno.

---

## 4. Smoke test na produkciji (PRD §5.3)

Testiraj na **svom** korisniku, nikad na klijentovom.

- [ ] Hard-refresh (Cmd+Shift+R / Ctrl+Shift+R) prije provjere, da izbjegneš
      stari cache u vlastitom pregledniku.
- [ ] DevTools → Network: bundle request ide na
      `wealth-builder.ai/wp-content/uploads/ft-tracker/index.js?v=<nova verzija>`
      — **ne** githack.
- [ ] Stranica se učita, postojeći podaci vidljivi (ispravni zbrojevi
      Potrošeno/Ostaje).
- [ ] Dodavanje troška radi + vidljiv u Pregled i Lista tabu.
- [ ] Uređivanje i brisanje unosa radi.
- [ ] Dodavanje/uređivanje prihoda radi.
- [ ] Navigacija na prošli mjesec prikazuje stare podatke.
- [ ] Refresh stranice — sve spremljeno je i dalje tu.
- [ ] Konzola preglednika bez grešaka.

Sve prošlo → nastavi na commit/tag (izvan ovog dokumenta, po dogovoru u chatu
za tu fazu). Bilo što od navedenog padne → **odmah rollback** (§5), bez
"krpanja uživo" (PRD §2, stavka 6).

---

## 5. Rollback

Ako smoke test padne: WP Admin → **Snippets** → "Financijski Tracker Backend"
→ Edit → zamijeni **cijeli** sadržaj ovim točnim blokom (stanje prije Faze 2,
githack v1.8 — identično onome što je danas u produkciji) → Update:

```php
// ── 1. REST rute (samo ulogirani) ──────────────────────────────
add_action('rest_api_init', function () {
    register_rest_route('financijski-tracker/v1', '/podaci', array(
        'methods'             => 'GET',
        'callback'            => 'ft_get_podaci',
        'permission_callback' => function () { return is_user_logged_in(); },
    ));
    register_rest_route('financijski-tracker/v1', '/spremi', array(
        'methods'             => 'POST',
        'callback'            => 'ft_spremi_podaci',
        'permission_callback' => function () { return is_user_logged_in(); },
    ));
    register_rest_route('financijski-tracker/v1', '/nonce', array(
        'methods'             => 'GET',
        'callback'            => function () { return rest_ensure_response(array('nonce' => wp_create_nonce('wp_rest'))); },
        'permission_callback' => function () { return is_user_logged_in(); },
    ));
});

function ft_get_podaci() {
    $raw  = get_user_meta(get_current_user_id(), 'ft_podaci', true);
    $data = $raw ? json_decode($raw, true) : null;
    if (!is_array($data)) $data = array();
    return rest_ensure_response($data);
}

// Sanitizacija liste (prihodi nemaju kategoriju, troškovi imaju)
function ft_sanitize_list($arr, $with_category) {
    $out = array();
    if (!empty($arr) && is_array($arr)) {
        foreach ($arr as $e) {
            if (!is_array($e)) continue;
            $item = array(
                'id'     => isset($e['id']) ? sanitize_text_field((string) $e['id']) : '',
                'amount' => isset($e['amount']) ? floatval($e['amount']) : 0,
                'date'   => isset($e['date']) ? sanitize_text_field($e['date']) : '',
            );
            if ($with_category) {
                $item['category'] = isset($e['category']) ? sanitize_text_field($e['category']) : '';
            }
            if (!empty($e['note'])) $item['note'] = sanitize_text_field($e['note']);
            $out[] = $item;
        }
    }
    return $out;
}

function ft_spremi_podaci(WP_REST_Request $req) {
    $body = $req->get_json_params();
    update_user_meta(get_current_user_id(), 'ft_podaci', wp_json_encode(array(
        'incomeEntries' => ft_sanitize_list(isset($body['incomeEntries']) ? $body['incomeEntries'] : array(), false),
        'entries'       => ft_sanitize_list(isset($body['entries']) ? $body['entries'] : array(), true),
    )));
    return rest_ensure_response(array('success' => true));
}

// ── 2. Shortcode [financijski_tracker] ─────────────────────────
function ft_shortcode() {
    $root   = esc_url_raw(rest_url('financijski-tracker/v1/'));
    $nonce  = wp_create_nonce('wp_rest');
    $bundle = 'https://rawcdn.githack.com/alovric98/FinancijskiTracker/v1.8/index.js';
    return '<div id="wb-finance-tracker" data-ft-root="' . esc_attr($root) . '" data-ft-nonce="' . esc_attr($nonce) . '"></div>'
         . '<script type="module" src="' . esc_url($bundle) . '"></script>';
}
add_shortcode('financijski_tracker', 'ft_shortcode');
```

Ovo vraća produkciju točno na stanje koje je bilo aktivno prije ovog deploya
(REST rute su identične u obje verzije — jedino se `ft_shortcode` razlikuje).
Upload bundlea iz koraka 2 ne treba ručno poništavati — čim shortcode opet
gađa githack, lokalna `wp-content/uploads/ft-tracker/index.js` datoteka na
serveru jednostavno više nije referencirana i ne šteti ničemu ako ostane.

Nakon rollbacka: ponovi smoke test (§4) da potvrdiš da je produkcija stvarno
natrag u prijašnjem, poznato ispravnom stanju.
