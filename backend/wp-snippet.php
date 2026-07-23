<?php
/**
 * Financijski Tracker — backend snippet (WP Code Snippets plugin)
 *
 * Verzija: v1.9 (App bundle: v1.9 — self-hosted, vidi FT_BUNDLE_VER niže)
 * Datum: 2026-07-23
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
define('FT_BUNDLE_VER', '1.9');

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
    return rest_ensure_response(array('success' => true));
}

// ── 2. Shortcode [financijski_tracker] ─────────────────────────
function ft_shortcode() {
    $root   = esc_url_raw(rest_url('financijski-tracker/v1/'));
    $nonce  = wp_create_nonce('wp_rest');
    // Self-hosted (audit 1.1 — githack maknut). content_url() je portabilan:
    // ista linija radi i lokalno (localhost:8080) i na produkciji.
    $bundle = content_url('uploads/ft-tracker/index.js') . '?v=' . FT_BUNDLE_VER;
    return '<div id="wb-finance-tracker" data-ft-root="' . esc_attr($root) . '" data-ft-nonce="' . esc_attr($nonce) . '"></div>'
         . '<script type="module" src="' . esc_url($bundle) . '"></script>';
}
add_shortcode('financijski_tracker', 'ft_shortcode');
