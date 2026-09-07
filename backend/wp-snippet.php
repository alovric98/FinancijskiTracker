<?php
/**
 * Financijski Tracker — backend snippet (WP Code Snippets plugin)
 *
 * Verzija: v2.0 (App bundle: v2.0 — self-hosted, vidi FT_BUNDLE_VER niže)
 * Datum: 2026-07-25
 *
 * SOURCE OF TRUTH: ova datoteka je izvor istine za backend. Svaka promjena
 * se prvo radi ovdje (commit u repo), tek onda copy-paste u WP admin
 * (Snippets → Financijski Tracker Backend → Update).
 * NIKAD ne mijenjaj direktno u WP adminu bez da promjena prvo prođe kroz repo.
 *
 * NAPOMENA pri copy-pasteu u WP Code Snippets: taj plugin sam dodaje
 * `<?php` omotač oko snippeta, pa se otvorni tag s vrha OVE datoteke NE
 * kopira zajedno s ostatkom koda (dvostruki `<?php` je fatalna greška).
 * Kopira se sve OD `define('FT_BUNDLE_VER', ...)` naniže.
 *
 * Per-user spremanje + gating (WordPress REST)
 */

// Verzija bundlea za cache-busting (?v=...). BUMPAJ ovaj broj pri SVAKOM
// produkcijskom deployu novog index.js (svaka frontend faza) — inače
// preglednik/hosting cache može poslužiti stari bundle unatoč uploadu.
define('FT_BUNDLE_VER', '2.1');

// Minimalni razmak između dvije backup rotacije po korisniku (audit 1.2).
// Autosave sprema svakih ~0.7s — bez ovog praga sve tri bak verzije bi
// unutar sekundi postale jednako (beskorisno) svježe.
define('FT_BACKUP_THROTTLE', HOUR_IN_SECONDS);

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
    $user_id = get_current_user_id();
    $raw  = get_user_meta($user_id, 'ft_podaci', true);
    $data = $raw ? json_decode($raw, true) : null;
    if (!is_array($data)) $data = array();
    // Faza 4 (audit 3.2): verzijski brojač za detekciju konflikta dva uređaja.
    // Stari bundle (prije Faze 4) ovaj dodatni ključ jednostavno ignorira.
    $data['version'] = (int) get_user_meta($user_id, 'ft_podaci_ver', true); // '' → 0
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

// Ukupan broj unosa (prihodi + troškovi) u dekodiranom ft_podaci nizu.
// Prepoznaje i pred-migracijske oblike prihoda ('prihodi' mapa / 'prihod'
// skalar) da se ne podcijeni korisnik čiji redak backend još nije prepisao
// u kanonski 'incomeEntries' oblik (vidi migraciju u App.jsx).
function ft_ukupno_unosa($data) {
    if (!is_array($data)) return 0;
    if (isset($data['incomeEntries']) && is_array($data['incomeEntries'])) {
        $income = count($data['incomeEntries']);
    } elseif (isset($data['prihodi']) && is_array($data['prihodi'])) {
        $income = count($data['prihodi']);
    } elseif (isset($data['prihod']) && floatval($data['prihod']) > 0) {
        $income = 1;
    } else {
        $income = 0;
    }
    $entries = (isset($data['entries']) && is_array($data['entries'])) ? count($data['entries']) : 0;
    return $income + $entries;
}

// Odbij spremanje koje izgleda kao brisanje postojećih podataka (audit 1.2).
// Pražnjenje na 0 kod >2 postojeća unosa odbija se uvijek (kroz UI se briše
// jedan-po-jedan, pa legitimno pražnjenje s 1-2 unosa na 0 mora proći);
// drastičan pad kod većih setova odbija se po postotnom pragu.
function ft_je_sumnjiv_pad($existing_total, $new_total) {
    if ($existing_total > 2 && $new_total === 0) return true;
    if ($existing_total > 20 && $new_total < $existing_total * 0.5) return true;
    return false;
}

// Rotira ft_podaci_bak1..3 PRIJE prepisivanja ft_podaci (audit 1.2). bak1/2/3
// čuvaju SIROVI ft_podaci JSON — identičan obliku glavnog ključa, spreman za
// izravan copy-paste natrag kod ručnog oporavka. Vrijeme nastanka svake
// verzije čuva se odvojeno u ft_podaci_bak_ts (mapa "1"/"2"/"3" → unix
// timestamp; 0 = ta kopija još ne postoji). Throttle: nova rotacija najviše
// jednom po FT_BACKUP_THROTTLE (autosave sprema svakih ~0.7s).
function ft_rotiraj_backup($user_id, $existing_raw) {
    if (empty($existing_raw)) return; // prvi ikad save — nema postojećeg stanja za čuvanje

    $ts = json_decode(get_user_meta($user_id, 'ft_podaci_bak_ts', true), true);
    if (!is_array($ts)) $ts = array();
    $ts1 = (isset($ts['1']) && is_numeric($ts['1'])) ? (int) $ts['1'] : 0;

    if ($ts1 > 0 && (time() - $ts1) < FT_BACKUP_THROTTLE) return; // bak1 još svjež

    $bak1_raw = get_user_meta($user_id, 'ft_podaci_bak1', true);
    $bak2_raw = get_user_meta($user_id, 'ft_podaci_bak2', true);
    $ts2      = (isset($ts['2']) && is_numeric($ts['2'])) ? (int) $ts['2'] : 0;

    if ($bak2_raw !== '') update_user_meta($user_id, 'ft_podaci_bak3', $bak2_raw);
    if ($bak1_raw !== '') update_user_meta($user_id, 'ft_podaci_bak2', $bak1_raw);
    update_user_meta($user_id, 'ft_podaci_bak1', $existing_raw);

    update_user_meta($user_id, 'ft_podaci_bak_ts', wp_json_encode(array(
        '1' => time(),
        '2' => $ts1,
        '3' => $ts2,
    )));
}

function ft_spremi_podaci(WP_REST_Request $req) {
    $user_id = get_current_user_id();
    $body    = $req->get_json_params();

    $existing_raw   = get_user_meta($user_id, 'ft_podaci', true);
    $existing       = $existing_raw ? json_decode($existing_raw, true) : array();
    $existing_total = ft_ukupno_unosa($existing);
    $current_ver    = (int) get_user_meta($user_id, 'ft_podaci_ver', true); // '' → 0

    // Zaštita od last-write-wins kod dva istovremeno otvorena taba/uređaja (audit 3.2).
    // array_key_exists (ne isset!) jer 0 je valjana vrijednost verzije — mora se
    // razlikovati "stari bundle uopće nije poslao version" (preskoči provjeru —
    // tranzicijsko razdoblje dok su stari i novi bundle istovremeno u prometu) od
    // "novi bundle je namjerno poslao version: 0" (provjeri kao svaku drugu vrijednost).
    // POZNATO OGRANIČENJE: čitanje trenutne verzije, provjera i zapis niže nisu
    // atomarni (read → check → write) — dva zahtjeva koja gotovo istovremeno pročitaju
    // istu (staru) verziju teoretski mogu oba proći ovu provjeru prije nego ijedan
    // stigne zapisati novu (prozor od par ms). Drastično smanjuje, ne uklanja potpuno,
    // last-write-wins scenarij — prihvatljivo poboljšanje u odnosu na današnje
    // bezuvjetno prepisivanje. Puno rješenje (atomski uvjetni upit / per-unos model)
    // izvan je opsega ove faze.
    if (is_array($body) && array_key_exists('version', $body)) {
        $client_ver = (int) $body['version'];
        if ($client_ver !== $current_ver) {
            return new WP_Error(
                'ft_verzija_zastarjela',
                'Spremanje odbijeno: podaci su u međuvremenu promijenjeni na drugom uređaju ili tabu.',
                array('status' => 409, 'current_version' => $current_ver)
            );
        }
    }

    $income    = ft_sanitize_list(isset($body['incomeEntries']) ? $body['incomeEntries'] : array(), false);
    $entries   = ft_sanitize_list(isset($body['entries']) ? $body['entries'] : array(), true);
    $new_total = count($income) + count($entries);

    if (ft_je_sumnjiv_pad($existing_total, $new_total)) {
        return new WP_Error(
            'ft_sumnjivo_smanjenje',
            'Spremanje odbijeno: novi podaci imaju znatno manje unosa nego postojeći.',
            array('status' => 409, 'existing_total' => $existing_total, 'new_total' => $new_total)
        );
    }

    ft_rotiraj_backup($user_id, $existing_raw);

    update_user_meta($user_id, 'ft_podaci', wp_json_encode(array(
        'incomeEntries' => $income,
        'entries'       => $entries,
    )));
    $new_ver = $current_ver + 1;
    update_user_meta($user_id, 'ft_podaci_ver', $new_ver);

    // Faza 10: bilježenje metapodataka o aktivnosti (dana, akcija) — vidi
    // odjeljak 4 niže. Ne dira ništa iznad ove linije.
    ft_zabiljezi_aktivnost($user_id, $existing, $income, $entries);

    return rest_ensure_response(array('success' => true, 'version' => $new_ver));
}

// ── 2. Shortcode [financijski_tracker] ─────────────────────────

// Zajednički bundle URL za sve shortcodeove (produkcijski i demo) — jedno
// mjesto istine za putanju i cache-busting verziju, da se ne duplicira.
// Self-hosted (audit 1.1 — githack maknut). content_url() je portabilan:
// ista linija radi i lokalno (localhost:8080) i na produkciji.
function ft_bundle_url() {
    return content_url('uploads/ft-tracker/index.js') . '?v=' . FT_BUNDLE_VER;
}

// Auto-visina iframea. Obje stranice s appom (/app-troskovi/ i
// /app-troskovi-demo/) učitavaju se kroz iframe s iste domene, pa skript
// IZNUTRA smije podesiti visinu samog iframe elementa (window.frameElement).
// Posljedica: nema scrolla unutar alata — scrolla se cijela stranica.
// Ako stranica nije u iframeu (izravan otvor), skript ne radi ništa.
// min-height:0 poništava .root { min-height:100vh } iz app.css — bez toga
// bi iframe mogao samo rasti, nikad se smanjiti pri prelasku na kraći tab.
// !important je OBAVEZAN: vite.config.js (plugin forceImportant) pri buildu
// stavlja !important na svaku deklaraciju, pa i na min-height:100vh, a CSS
// se ubrizgava iz JS-a NAKON ovog stila. Bez !important override gubi, .root
// ostaje 100vh (= visina iframea) i mjerenje ulazi u beskonačnu petlju rasta.
// Specifičnost #wb-finance-tracker .root nadjačava .root i kad su oba !important.
// Dodatne zaštite u skripti: prag od 2px protiv titranja i gornja granica
// visine — i da override ikad opet padne, petlja se ne može razbježati.
function ft_autoheight() {
    return '<style>#wb-finance-tracker .root{min-height:0 !important}body{margin:0}</style>'
         . '<script>(function(){'
         . 'var fe=window.frameElement; if(!fe) return;'
         . 'fe.setAttribute("scrolling","no");'
         . 'var last=0;'
         . 'var fit=function(){'
         . 'var h=document.body.scrollHeight;'
         . 'if(h<=0||h>6000) return;'
         . 'if(Math.abs(h-last)<2) return;'
         . 'last=h; fe.style.height=h+"px";};'
         . 'if(window.ResizeObserver){new ResizeObserver(fit).observe(document.body);}'
         . 'window.addEventListener("load",fit);'
         . 'setTimeout(fit,300); setTimeout(fit,1200);'
         . '})();</script>';
}

function ft_shortcode() {
    $root   = esc_url_raw(rest_url('financijski-tracker/v1/'));
    $nonce  = wp_create_nonce('wp_rest');
    $bundle = ft_bundle_url();
    return '<div id="wb-finance-tracker" data-ft-root="' . esc_attr($root) . '" data-ft-nonce="' . esc_attr($nonce) . '"></div>'
         . '<script type="module" src="' . esc_url($bundle) . '"></script>'
         . ft_autoheight();
}
add_shortcode('financijski_tracker', 'ft_shortcode');

// ── 3. Shortcode [financijski_tracker_demo] — javni demo ───────
// Isti mount div i isti bundle kao gore, ali BEZ data-ft-root i
// data-ft-nonce. Bez tih atributa main.jsx ne postavlja window.ftSettings,
// pa App radi potpuno in-memory: nula poziva na REST rute, unosi žive samo
// dok je stranica otvorena i nestaju na refresh/odlazak.
// Namjerno: nema registracije, nema spremanja (eksplicitan zahtjev klijenta).
// Demo i pravi tracker dijele isti bundle — svaka promjena u src/ mijenja
// sučelje na oba mjesta i traži bump FT_BUNDLE_VER pri deployu.
// Bez ikakvog natpisa o demo verziji unutar alata — zahtjev klijenta.
// Vanjski omotač centrira demo neovisno o Elementor postavkama containera.
function ft_shortcode_demo() {
    return '<div style="max-width:560px;margin:0 auto;">'
         . '<div id="wb-finance-tracker"></div>'
         . '<script type="module" src="' . esc_url(ft_bundle_url()) . '"></script>'
         . '</div>'
         . ft_autoheight();
}
add_shortcode('financijski_tracker_demo', 'ft_shortcode_demo');

// ── 4. Faza 10: praćenje aktivnosti korisnika (WP → Zapier → ActiveCampaign) ──
//
// Cilj: klijent treba uvid koliko je koji korisnik aktivan u trackeru, radi
// segmentacije u ActiveCampaignu. PRIVATNOST JE UVJET, NE PREPORUKA: sa
// servera izlaze ISKLJUČIVO metapodaci o aktivnosti (brojevi, datumi) —
// amount/category/note ili bilo koji financijski podatak NIKAD ne napuštaju
// server. Greška pri slanju se tiho bilježi i nikad ne smije utjecati na rad
// aplikacije ni usporiti spremanje (poziv iz ft_spremi_podaci je samo dva
// jeftina update_user_meta upisa — sam HTTP poziv prema Zapieru događa se
// isključivo u cronu, nikad u /spremi zahtjevu).
//
// Brojači (ft_aktivnih_dana, ft_broj_akcija) kreću od nule za postojeće
// korisnike — retroaktivne brojke se ne popunjavaju unatrag.
//
// WP-Cron nije pravi cron (okida se tek na posjet stranici) — za pouzdano
// dnevno pokrivanje svih korisnika treba pravi sistemski cron na hostingu;
// upute u docs/HOSTING.md.

define('FT_CRON_BATCH_SIZE', 40);   // korisnika po satnom prolazu (self-healing serije, dopuna 3)
define('FT_INAKTIVAN_DANA', 14);    // prag (dana bez spremanja) za status "neaktivan" u payloadu
define('FT_AKTIVNOST_CRON_HOOK', 'ft_aktivnost_cron');

// Broj prihoda uz podršku za stare oblike zapisa (ista logika kao u
// ft_ukupno_unosa — namjerno ponovljena, a ne izvučena u zajedničku
// funkciju, da se ft_ukupno_unosa ne dira nakon audita).
function ft_broj_prihoda($data) {
    if (!is_array($data)) return 0;
    if (isset($data['incomeEntries']) && is_array($data['incomeEntries'])) {
        return count($data['incomeEntries']);
    }
    if (isset($data['prihodi']) && is_array($data['prihodi'])) {
        return count($data['prihodi']);
    }
    if (isset($data['prihod']) && floatval($data['prihod']) > 0) {
        return 1;
    }
    return 0;
}

// "d.m.yyyy." (bez vodećih nula, vidi dateInSelectedMonth u App.jsx) → "yyyy-mm".
function ft_mjesec_iz_datuma($date_str) {
    if (!is_string($date_str)) return null;
    if (!preg_match('/^(\d{1,2})\.(\d{1,2})\.(\d{4})\.?$/', trim($date_str), $m)) return null;
    return $m[3] . '-' . str_pad($m[2], 2, '0', STR_PAD_LEFT);
}

// Broj različitih mjeseci (godina+mjesec) s barem jednim prihodom ili
// troškom. Podržava i stari 'prihodi' oblik (mapa "mjesec.godina" → iznos,
// vidi migraciju u App.jsx) kad incomeEntries još ne postoji.
function ft_ukupno_mjeseci($data) {
    if (!is_array($data)) return 0;
    $mjeseci = array();

    $stavke = array();
    if (isset($data['entries']) && is_array($data['entries'])) {
        $stavke = array_merge($stavke, $data['entries']);
    }
    if (isset($data['incomeEntries']) && is_array($data['incomeEntries'])) {
        $stavke = array_merge($stavke, $data['incomeEntries']);
    }
    foreach ($stavke as $e) {
        if (!is_array($e) || empty($e['date'])) continue;
        $mj = ft_mjesec_iz_datuma($e['date']);
        if ($mj) $mjeseci[$mj] = true;
    }

    if (!isset($data['incomeEntries']) && isset($data['prihodi']) && is_array($data['prihodi'])) {
        foreach ($data['prihodi'] as $k => $v) {
            if (floatval($v) <= 0) continue;
            $parts = explode('.', $k);
            if (count($parts) === 2) {
                $mjeseci[$parts[1] . '-' . str_pad($parts[0], 2, '0', STR_PAD_LEFT)] = true;
            }
        }
    }

    return count($mjeseci);
}

// Broj troškova s datumom = danas (po vremenskoj zoni sajta). Datumi u
// podacima nemaju vremensku komponentu, pa je "današnji datum" najbliža
// smislena interpretacija polja "entries_last_24h" iz specifikacije.
function ft_troskovi_danas($data) {
    if (!is_array($data) || empty($data['entries']) || !is_array($data['entries'])) return 0;
    $danas = wp_date('j.n.Y');
    $n = 0;
    foreach ($data['entries'] as $e) {
        if (!is_array($e) || empty($e['date'])) continue;
        if (rtrim($e['date'], '.') === $danas) $n++;
    }
    return $n;
}

// Poziva se iz ft_spremi_podaci NAKON uspješnog upisa ft_podaci. Ne mijenja
// ništa u postojećoj sanitizaciji/rotaciji backupa/provjeri verzije — samo
// upisuje dodatne brojače aktivnosti.
//
// ft_aktivnih_dana: +1 kad se datum zadnjeg spremanja razlikuje od
// današnjeg (dopuna 1 — "+1 svaki dan kad nešto radi").
//
// ft_broj_akcija: kumulativan broj spremanja koja su STVARNO promijenila
// sadržaj (dodan/uređen/obrisan unos), nikad se ne smanjuje (dopuna 2).
// Autosave u frontend kodu se i danas okida samo kad se incomeEntries/
// allExpenses stvarno promijene, pa je ovo pouzdana mjera "koliko puta je
// korisnik nešto napravio u alatu" — bolja od pukog neto rasta broja unosa,
// koji ne bi brojao uređivanja ni add+delete unutar istog spremanja.
function ft_zabiljezi_aktivnost($user_id, $existing, $income, $entries) {
    $danas = wp_date('Ymd');

    $zadnje = (int) get_user_meta($user_id, 'ft_last_saved', true);
    if ($zadnje <= 0 || wp_date('Ymd', $zadnje) !== $danas) {
        $dana = (int) get_user_meta($user_id, 'ft_aktivnih_dana', true);
        update_user_meta($user_id, 'ft_aktivnih_dana', $dana + 1);
    }
    update_user_meta($user_id, 'ft_last_saved', time());

    $prijasnji_income  = ft_sanitize_list(isset($existing['incomeEntries']) ? $existing['incomeEntries'] : array(), false);
    $prijasnji_entries = ft_sanitize_list(isset($existing['entries']) ? $existing['entries'] : array(), true);
    $promijenjeno = (wp_json_encode($income) !== wp_json_encode($prijasnji_income))
                 || (wp_json_encode($entries) !== wp_json_encode($prijasnji_entries));
    if ($promijenjeno) {
        $akcije = (int) get_user_meta($user_id, 'ft_broj_akcija', true);
        update_user_meta($user_id, 'ft_broj_akcija', $akcije + 1);
    }
}

// Jedinstveno mjesto koje gradi puni skup metapodataka o aktivnosti za
// jednog korisnika — koriste ga i cron slanje na Zapier i admin tablica.
// Čita isključivo brojeve i datume iz ft_podaci, nikad amount/category/note.
function ft_izracunaj_metrike($user_id) {
    $user = get_userdata($user_id);
    $raw  = get_user_meta($user_id, 'ft_podaci', true);
    $data = $raw ? json_decode($raw, true) : array();
    if (!is_array($data)) $data = array();

    $last_saved = (int) get_user_meta($user_id, 'ft_last_saved', true);
    $neaktivan  = ($last_saved <= 0) || ((time() - $last_saved) > FT_INAKTIVAN_DANA * DAY_IN_SECONDS);

    return array(
        'email'                => $user ? $user->user_email : '',
        'user_id'              => (int) $user_id,
        'total_entries'        => isset($data['entries']) && is_array($data['entries']) ? count($data['entries']) : 0,
        'total_income_entries' => ft_broj_prihoda($data),
        'entries_last_24h'     => ft_troskovi_danas($data),
        'active_months'        => ft_ukupno_mjeseci($data),
        'active_days'          => (int) get_user_meta($user_id, 'ft_aktivnih_dana', true),
        'total_actions'        => (int) get_user_meta($user_id, 'ft_broj_akcija', true),
        'last_saved_at'        => $last_saved > 0 ? gmdate('c', $last_saved) : null,
        'status'               => $neaktivan ? 'neaktivan' : 'aktivan',
    );
}

// Satni self-healing batch (dopuna 3): svaki prolaz obradi do
// FT_CRON_BATCH_SIZE korisnika kojima "zadnja provjera" nije danas. Bez
// dijeljenog queue stanja koje bi se moglo zaglaviti — ako WP-Cron preskoči
// prolaz, sljedeći ga nadoknadi. Slanje samo za korisnike s promjenom od
// zadnjeg slanja (štedi Zapier taskove).
function ft_obradi_aktivnost_batch() {
    $webhook = get_option('ft_zapier_webhook_url');
    if (empty($webhook)) return; // ništa se ne označava dok webhook nije postavljen

    $danas = wp_date('Ymd');

    $user_ids = get_users(array(
        'fields'     => 'ID',
        'number'     => FT_CRON_BATCH_SIZE,
        'meta_query' => array(
            'relation' => 'AND',
            array('key' => 'ft_podaci', 'compare' => 'EXISTS'),
            array(
                'relation' => 'OR',
                array('key' => 'ft_last_checked_at', 'compare' => 'NOT EXISTS'),
                array('key' => 'ft_last_checked_at', 'value' => $danas, 'compare' => '!='),
            ),
        ),
    ));

    $provjereno = 0; $poslano = 0; $preskoceno = 0; $greske = 0;

    foreach ($user_ids as $user_id) {
        $provjereno++;
        $metrike = ft_izracunaj_metrike($user_id);

        $usporedivo = $metrike;
        unset($usporedivo['email']);
        $snapshot = wp_json_encode($usporedivo);

        $vec_poslano        = get_user_meta($user_id, 'ft_last_sent_at', true);
        $prijasnji_snapshot = get_user_meta($user_id, 'ft_last_sent_snapshot', true);

        if ($vec_poslano && $snapshot === $prijasnji_snapshot) {
            update_user_meta($user_id, 'ft_last_checked_at', $danas);
            $preskoceno++;
            continue;
        }

        $payload = $metrike;
        $payload['last_sent_at'] = gmdate('c');

        $odgovor = wp_remote_post($webhook, array(
            'timeout' => 5,
            'headers' => array('Content-Type' => 'application/json'),
            'body'    => wp_json_encode($payload),
        ));

        $status_kod = is_wp_error($odgovor) ? 0 : wp_remote_retrieve_response_code($odgovor);
        $uspjesno   = ($status_kod >= 200 && $status_kod < 300);

        if ($uspjesno) {
            update_user_meta($user_id, 'ft_last_sent_at', time());
            update_user_meta($user_id, 'ft_last_sent_snapshot', $snapshot);
            update_user_meta($user_id, 'ft_last_checked_at', $danas);
            $poslano++;
        } else {
            // Tiho bilježenje — ne smije utjecati na rad aplikacije. Namjerno
            // BEZ upisa ft_last_checked_at: ponovni pokušaj u sljedećem
            // satnom prolazu umjesto čekanja na sutra.
            error_log('[FT aktivnost] slanje na Zapier nije uspjelo za korisnika ' . $user_id . ': '
                . (is_wp_error($odgovor) ? $odgovor->get_error_message() : 'HTTP ' . $status_kod));
            $greske++;
        }
    }

    update_option('ft_cron_last_summary', array(
        'time'       => time(),
        'provjereno' => $provjereno,
        'poslano'    => $poslano,
        'preskoceno' => $preskoceno,
        'greske'     => $greske,
    ), false);
}

if (!wp_next_scheduled(FT_AKTIVNOST_CRON_HOOK)) {
    wp_schedule_event(time(), 'hourly', FT_AKTIVNOST_CRON_HOOK);
}
add_action(FT_AKTIVNOST_CRON_HOOK, 'ft_obradi_aktivnost_batch');

// ── Admin stranica: pregled aktivnosti + postavka Zapier webhooka (dopuna 4) ──
// Webhook URL se postavlja isključivo ovdje (wp_options), NIKAD hardkodiran
// u ovom snippetu jer je repozitorij javan.
add_action('admin_menu', function () {
    add_options_page('FT Aktivnost', 'FT Aktivnost', 'manage_options', 'ft-aktivnost', 'ft_admin_stranica');
});

function ft_admin_stranica() {
    if (!current_user_can('manage_options')) return;

    if (!empty($_POST['ft_akcija']) && check_admin_referer('ft_aktivnost_admin')) {
        if ($_POST['ft_akcija'] === 'spremi_webhook') {
            $url = isset($_POST['ft_webhook_url']) ? wp_unslash($_POST['ft_webhook_url']) : '';
            update_option('ft_zapier_webhook_url', esc_url_raw(trim($url)));
            echo '<div class="notice notice-success"><p>Webhook URL spremljen.</p></div>';
        } elseif ($_POST['ft_akcija'] === 'pokreni_cron') {
            ft_obradi_aktivnost_batch();
            echo '<div class="notice notice-success"><p>Provjera pokrenuta.</p></div>';
        }
    }

    $webhook = get_option('ft_zapier_webhook_url', '');
    $sazetak = get_option('ft_cron_last_summary');

    echo '<div class="wrap"><h1>Financijski Tracker — aktivnost korisnika</h1>';

    echo '<h2>Zapier webhook</h2><form method="post">';
    wp_nonce_field('ft_aktivnost_admin');
    echo '<input type="hidden" name="ft_akcija" value="spremi_webhook">';
    echo '<input type="url" name="ft_webhook_url" style="width:420px" value="' . esc_attr($webhook) . '" placeholder="https://hooks.zapier.com/...">';
    echo ' <button class="button button-primary">Spremi</button></form>';

    echo '<form method="post" style="margin-top:8px">';
    wp_nonce_field('ft_aktivnost_admin');
    echo '<input type="hidden" name="ft_akcija" value="pokreni_cron">';
    echo '<button class="button">Pokreni provjeru sada</button></form>';

    if (is_array($sazetak)) {
        echo '<p>Zadnji prolaz: ' . esc_html(wp_date('d.m.Y H:i', $sazetak['time']))
           . ' — provjereno ' . (int) $sazetak['provjereno']
           . ', poslano ' . (int) $sazetak['poslano']
           . ', preskočeno ' . (int) $sazetak['preskoceno']
           . ', grešaka ' . (int) $sazetak['greske'] . '</p>';
    }

    echo '<h2>Pregled po korisniku</h2><table class="widefat striped"><thead><tr>'
       . '<th>Korisnik</th><th>Zadnja aktivnost</th><th>Aktivnih dana</th>'
       . '<th>Broj akcija</th><th>Trenutni broj unosa</th><th>Aktivnih mjeseci</th><th>Status</th>'
       . '</tr></thead><tbody>';

    $korisnici = get_users(array(
        'fields'     => 'ID',
        'number'     => 500,
        'meta_query' => array(array('key' => 'ft_podaci', 'compare' => 'EXISTS')),
    ));

    $redovi = array_map('ft_izracunaj_metrike', $korisnici);
    usort($redovi, function ($a, $b) {
        return strcmp((string) $b['last_saved_at'], (string) $a['last_saved_at']);
    });

    foreach ($redovi as $m) {
        echo '<tr><td>' . esc_html($m['email']) . '</td>'
           . '<td>' . esc_html($m['last_saved_at'] ? wp_date('d.m.Y H:i', strtotime($m['last_saved_at'])) : '—') . '</td>'
           . '<td>' . (int) $m['active_days'] . '</td>'
           . '<td>' . (int) $m['total_actions'] . '</td>'
           . '<td>' . ((int) $m['total_entries'] + (int) $m['total_income_entries']) . '</td>'
           . '<td>' . (int) $m['active_months'] . '</td>'
           . '<td>' . esc_html($m['status']) . '</td></tr>';
    }

    echo '</tbody></table></div>';
}
