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
define('FT_BUNDLE_VER', '2.0');

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

function ft_shortcode() {
    $root   = esc_url_raw(rest_url('financijski-tracker/v1/'));
    $nonce  = wp_create_nonce('wp_rest');
    $bundle = ft_bundle_url();
    return '<div id="wb-finance-tracker" data-ft-root="' . esc_attr($root) . '" data-ft-nonce="' . esc_attr($nonce) . '"></div>'
         . '<script type="module" src="' . esc_url($bundle) . '"></script>';
}
add_shortcode('financijski_tracker', 'ft_shortcode');

// ── 3. Shortcode [financijski_tracker_demo] — javni demo ───────
// Isti mount div i isti bundle kao gore, ali BEZ data-ft-root i
// data-ft-nonce. Bez tih atributa main.jsx ne postavlja window.ftSettings,
// pa App radi potpuno in-memory: nula poziva na REST rute, unosi žive samo
// dok je stranica otvorena i nestaju na refresh/odlazak.
// Namjerno: nema registracije, nema spremanja (eksplicitan zahtjev klijenta).
// Bundle je nepromijenjen — FT_BUNDLE_VER se za ovu izmjenu NE bumpa.
// Napomena o demo verziji NIJE ovdje nego na javnoj stranici (Elementor,
// iznad iframea) — zahtjev klijenta: alat ostaje čist, tekst je izvan njega.
// Vanjski omotač centrira demo neovisno o Elementor postavkama containera.
function ft_shortcode_demo() {
    return '<div style="max-width:560px;margin:0 auto;">'
         . '<div id="wb-finance-tracker"></div>'
         . '<script type="module" src="' . esc_url(ft_bundle_url()) . '"></script>'
         . '</div>';
}
add_shortcode('financijski_tracker_demo', 'ft_shortcode_demo');
