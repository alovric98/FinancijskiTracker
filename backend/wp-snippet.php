<?php
/**
 * Financijski Tracker — backend snippet (WP Code Snippets plugin)
 *
 * Verzija: v1.8 (App bundle: v1.8)
 * Datum: 2026-07-20
 *
 * SOURCE OF TRUTH: ova datoteka je izvor istine za backend. Svaka promjena
 * se prvo radi ovdje (commit u repo), tek onda copy-paste u WP admin
 * (Snippets → Financijski Tracker Backend → Update).
 * NIKAD ne mijenjaj direktno u WP adminu bez da promjena prvo prođe kroz repo.
 *
 * NAPOMENA pri copy-pasteu u WP Code Snippets: taj plugin sam dodaje
 * `<?php` omotač oko snippeta, pa se otvorni tag s vrha OVE datoteke NE
 * kopira zajedno s ostatkom koda (dvostruki `<?php` je fatalna greška).
 * Kopira se sve OD `add_action('rest_api_init', ...)` naniže.
 *
 * Per-user spremanje + gating (WordPress REST)
 */

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
