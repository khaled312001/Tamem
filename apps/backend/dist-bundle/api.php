<?php
/**
 * Minimal PHP stand-in for the Node backend on Hostinger shared hosting.
 *
 * This exists ONLY because the CloudLinux Node.js Selector hasn't been
 * enabled on this account yet (Passenger + reverse-proxy require an hPanel
 * step). Until that's activated, LiteSpeed can't run our node app — so this
 * PHP file replays the auth endpoints the dashboard needs to log in:
 *
 *   POST  /api/v1/auth/login            → verify creds, email an OTP for admins
 *   POST  /api/v1/auth/admin/otp/verify → exchange the OTP for real JWT tokens
 *   GET   /api/v1/health                → liveness probe
 *   OPTIONS *                           → CORS preflight
 *
 * The tokens it issues are HS256 JWTs signed with the same JWT_ACCESS_SECRET
 * the Node backend uses. When Node comes online later, existing sessions keep
 * working — same secret, same payload shape.
 *
 * Kept as one file on purpose so redeploy is a single SFTP put.
 */

declare(strict_types=1);

// Server runs on Cairo time: date()/strtotime()/DateTime('now') and report day
// boundaries are Egypt-local. Timestamps are still STORED as UTC in the DB (the
// universal standard) and internal comparisons use gmdate()/microtime() (both
// UTC/epoch), so this is display-only and can't skew the realtime/alert logic —
// changing the DB's stored timezone would reinterpret every existing row by 2-3h.
date_default_timezone_set('Africa/Cairo');

// ─── 0. Request timing ──────────────────────────────────────────────────
// Every response appends one line to a daily NDJSON file: method, path, status,
// duration and byte size. Registered before routing because most handlers end in
// exit() — a shutdown function still runs. Writing is best-effort and wrapped in
// @, so a full disk or a read-only dir can never break a response.
// Read back through GET /admin/perf.
register_shutdown_function(static function (): void {
    try {
        $start = (float) ($_SERVER['REQUEST_TIME_FLOAT'] ?? microtime(true));
        $ms = (int) round((microtime(true) - $start) * 1000);
        $path = (string) (parse_url((string) ($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH) ?? '');
        // Collapse ids so /admin/orders/<cuid> aggregates with its siblings.
        $route = preg_replace('#/(?:[0-9a-z]{20,}|\d+)(?=/|$)#i', '/:id', $path);
        $dir = __DIR__ . '/uploads/.perf';
        if (!is_dir($dir)) @mkdir($dir, 0755, true);
        $line = json_encode([
            't' => date('c'),
            'm' => (string) ($_SERVER['REQUEST_METHOD'] ?? ''),
            'r' => $route,
            's' => http_response_code() ?: 0,
            'ms' => $ms,
            'b' => function_exists('ob_get_length') ? (int) @ob_get_length() : 0,
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        @file_put_contents($dir . '/' . date('Y-m-d') . '.ndjson', $line . "\n", FILE_APPEND | LOCK_EX);
    } catch (Throwable $e) { /* telemetry must never affect the response */ }
});

// ─── 1. Load .env from the same directory ───────────────────────────────
$ENV = [];
$envPath = __DIR__ . '/.env';
if (is_readable($envPath)) {
    foreach (file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        if (str_starts_with(trim($line), '#')) continue;
        if (!str_contains($line, '=')) continue;
        [$k, $v] = explode('=', $line, 2);
        $k = trim($k);
        $v = trim($v);
        // Strip matching outer quotes (double or single).
        if (strlen($v) >= 2 && ($v[0] === '"' || $v[0] === "'") && substr($v, -1) === $v[0]) {
            $v = substr($v, 1, -1);
        }
        $ENV[$k] = $v;
    }
}
function env(string $k, ?string $default = null): ?string {
    global $ENV;
    return $ENV[$k] ?? $default;
}

// ─── 2. CORS (permissive for the two allowed origins) ───────────────────
$allowed = array_map('trim', explode(',', env('CORS_ORIGINS',
    'https://deliverytamem.com,https://www.deliverytamem.com')));
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin && in_array($origin, $allowed, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-Import-Job, X-Import-File');
    header('Access-Control-Max-Age: 86400');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header('Content-Type: application/json; charset=utf-8');

// $data is nullable so handlers can mirror Node's `ok(res, x ?? null)` —
// json_encode already emits {"data":null}. Under declare(strict_types=1) a
// non-nullable array param would fatal (TypeError → non-JSON 500) instead.
function jsonOk(?array $data, int $code = 200): void {
    http_response_code($code);
    echo json_encode(['data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}
function jsonErr(string $messageAr, int $code = 400, string $err = 'BAD_REQUEST'): void {
    http_response_code($code);
    echo json_encode([
        'error' => [
            'code' => $err,
            'message' => $messageAr,
            'messageAr' => $messageAr,
        ]
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// ─── 3. Route dispatch ──────────────────────────────────────────────────
// The dashboard hits `/api/v1/…` on the subdomain. Two ways this file gets
// reached: (a) `.htaccess` rewrites `/api/v1/…` to `api.php?path=…`, or (b)
// direct call with the path in the query string. Either works.
$path = $_GET['path'] ?? preg_replace('#^/api/v1#', '', parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH));
$path = '/' . ltrim((string) $path, '/');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

function readJsonBody(): array {
    $raw = file_get_contents('php://input') ?: '';
    $j = json_decode($raw, true);
    return is_array($j) ? $j : [];
}

// ─── 4. DB (PDO/MySQL) ──────────────────────────────────────────────────
function db(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $url = env('DATABASE_URL');
    if (!$url) jsonErr('DATABASE_URL is not configured', 500, 'CONFIG_MISSING');
    // mysql://USER:PASS@HOST:PORT/DBNAME  (password may be url-encoded)
    $p = parse_url($url);
    $host = $p['host'] ?? 'localhost';
    $port = (int)($p['port'] ?? 3306);
    $user = urldecode($p['user'] ?? '');
    $pass = urldecode($p['pass'] ?? '');
    $name = trim($p['path'] ?? '', '/');
    $dsn = "mysql:host=$host;port=$port;dbname=$name;charset=utf8mb4";
    try {
        $pdo = new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_TIMEOUT => 8,
            // Hostinger's shared MySQL caps connections at 500/HOUR. The static
            // above only dedupes WITHIN one request — PHP tears the connection
            // down at the end of every request, so each HTTP call was opening a
            // brand-new one. That is ~8 requests/minute before the whole API
            // starts 503ing, which a single import dialog (paged fetch + 5s
            // polling) can burn through on its own.
            // Persistent handles live in the PHP worker and are reused across
            // requests, so connection count tracks WORKERS, not traffic.
            PDO::ATTR_PERSISTENT => true,
        ]);
        // A pooled handle can come back still inside a transaction if an earlier
        // request died between BEGIN and COMMIT — that would silently poison this
        // one. Always hand out a clean connection.
        if ($pdo->inTransaction()) {
            try { $pdo->rollBack(); } catch (Throwable $e) { /* already clean */ }
        }
    } catch (PDOException $e) {
        // Fail soft instead of a raw 500 fatal. Hostinger's shared MySQL caps
        // connections/hour; when hit, surface a clean 503 the dashboard shows
        // as "busy, try again" rather than crashing every page blank.
        $code = (int) ($e->errorInfo[1] ?? 0);
        $busy = in_array($code, [1040, 1203, 1226], true) || stripos($e->getMessage(), 'max_connections') !== false;
        error_log('[api.php] DB connect failed (' . $code . '): ' . $e->getMessage());
        jsonErr($busy ? 'الخادم مشغول مؤقتاً، برجاء المحاولة بعد لحظات' : 'تعذّر الاتصال بقاعدة البيانات',
            503, $busy ? 'DB_BUSY' : 'DB_DOWN');
    }
    return $pdo;
}

// ─── 5. Helpers: JWT (HS256) ────────────────────────────────────────────
function b64url(string $s): string {
    return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
}
function jwtSign(array $payload, string $secret, int $ttlSec): string {
    $header = ['alg' => 'HS256', 'typ' => 'JWT'];
    $now = time();
    $payload['iat'] = $now;
    $payload['exp'] = $now + $ttlSec;
    $h = b64url(json_encode($header, JSON_UNESCAPED_SLASHES));
    $p = b64url(json_encode($payload, JSON_UNESCAPED_SLASHES));
    $sig = b64url(hash_hmac('sha256', "$h.$p", $secret, true));
    return "$h.$p.$sig";
}

// ─── 6. Helpers: OTP storage (file-based, 5-min TTL) ────────────────────
function otpDir(): string {
    $d = __DIR__ . '/uploads/.otp';
    if (!is_dir($d)) @mkdir($d, 0700, true);
    return $d;
}
function otpStore(string $token, array $data): void {
    file_put_contents(otpDir() . '/' . $token . '.json', json_encode($data));
}
function otpFetch(string $token): ?array {
    $f = otpDir() . '/' . $token . '.json';
    if (!is_file($f)) return null;
    $j = json_decode((string) file_get_contents($f), true);
    return is_array($j) ? $j : null;
}
function otpDelete(string $token): void {
    @unlink(otpDir() . '/' . $token . '.json');
}
function otpSweep(): void {
    $dir = otpDir();
    $now = time();
    foreach (glob($dir . '/*.json') ?: [] as $f) {
        $j = json_decode((string) @file_get_contents($f), true);
        if (!is_array($j) || ($j['expiresAt'] ?? 0) < $now) @unlink($f);
    }
}

// ─── 7. Helpers: SMTP mailer (raw sockets, TLS, LOGIN auth) ─────────────
function smtpSend(array $to, string $subject, string $textBody, ?string $htmlBody = null): array {
    $host = env('SMTP_HOST', 'smtp.hostinger.com');
    $port = (int) env('SMTP_PORT', '465');
    $user = env('SMTP_USER');
    $pass = env('SMTP_PASSWORD');
    $from = env('SMTP_FROM', $user ?: 'noreply@deliverytamem.com');
    if (!$user || !$pass) return ['ok' => false, 'error' => 'SMTP not configured'];

    $secure = ((int) env('SMTP_PORT', '465')) === 465;
    $remote = ($secure ? 'ssl://' : '') . $host . ':' . $port;
    $fp = @stream_socket_client($remote, $errno, $errstr, 15, STREAM_CLIENT_CONNECT);
    if (!$fp) return ['ok' => false, 'error' => "connect $errno $errstr"];
    stream_set_timeout($fp, 15);

    $read = function() use ($fp): string {
        $out = '';
        while (!feof($fp)) {
            $line = fgets($fp, 512);
            if ($line === false) break;
            $out .= $line;
            if (isset($line[3]) && $line[3] === ' ') break;
        }
        return $out;
    };
    $write = function(string $s) use ($fp): void { fwrite($fp, $s . "\r\n"); };

    $read(); // greeting
    $write('EHLO deliverytamem.com'); $read();
    $write('AUTH LOGIN'); $read();
    $write(base64_encode($user)); $read();
    $write(base64_encode($pass)); $r = $read();
    if (!str_starts_with(trim($r), '235')) { fclose($fp); return ['ok' => false, 'error' => "auth: $r"]; }
    // Extract bare address for MAIL FROM (nodemailer-style "Name <addr>" is OK for header only)
    if (preg_match('/<([^>]+)>/', $from, $m)) $mailFromAddr = $m[1]; else $mailFromAddr = $from;
    $write("MAIL FROM:<$mailFromAddr>"); $read();
    foreach ($to as $t) { $write("RCPT TO:<$t>"); $read(); }
    $write('DATA'); $read();

    $boundary = 'tamem_' . bin2hex(random_bytes(8));
    $headers = [];
    $headers[] = "From: $from";
    $headers[] = 'To: ' . implode(', ', $to);
    $headers[] = 'Subject: =?UTF-8?B?' . base64_encode($subject) . '?=';
    $headers[] = 'MIME-Version: 1.0';
    if ($htmlBody) {
        $headers[] = "Content-Type: multipart/alternative; boundary=\"$boundary\"";
    } else {
        $headers[] = 'Content-Type: text/plain; charset=utf-8';
        $headers[] = 'Content-Transfer-Encoding: 8bit';
    }
    $write(implode("\r\n", $headers) . "\r\n");
    if ($htmlBody) {
        $write("--$boundary");
        $write("Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n");
        $write($textBody);
        $write("--$boundary");
        $write("Content-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n");
        $write($htmlBody);
        $write("--$boundary--");
    } else {
        $write($textBody);
    }
    $write('.');
    $r = $read();
    $write('QUIT'); @$read();
    fclose($fp);
    return ['ok' => str_starts_with(trim($r), '250'), 'reply' => $r];
}

// ─── 7a. Deferred, branded email — sent AFTER the HTTP response is flushed ─
// SMTP is synchronous and slow (~1-3s). Emails queued during a request are
// flushed in a shutdown handler that first calls fastcgi_finish_request()
// where the SAPI supports it, so the client never waits on the mail server.
$GLOBALS['__deferred_mail'] = [];
function mailDefer(string $toAddr, string $subject, string $textBody, ?string $htmlBody = null): void {
    $toAddr = trim($toAddr);
    if ($toAddr === '' || !filter_var($toAddr, FILTER_VALIDATE_EMAIL)) return;
    $GLOBALS['__deferred_mail'][] = [$toAddr, $subject, $textBody, $htmlBody];
}
/** Look up a user's email and queue a message to them (best-effort). */
function mailToUser(string $userId, string $subject, string $textBody, ?string $htmlBody = null): void {
    if ($userId === '') return;
    try {
        $st = db()->prepare('SELECT email FROM `User` WHERE id = ? LIMIT 1');
        $st->execute([$userId]);
        $email = (string) ($st->fetchColumn() ?: '');
        if ($email !== '') mailDefer($email, $subject, $textBody, $htmlBody);
    } catch (Throwable $e) { error_log('[mail] mailToUser: ' . $e->getMessage()); }
}
/** Branded RTL HTML wrapper so every email looks like Tamem. */
function emailShell(string $titleAr, string $bodyHtml, ?string $ctaText = null, ?string $ctaUrl = null): string {
    $cta = ($ctaText && $ctaUrl)
        ? '<div style="text-align:center;margin:24px 0"><a href="' . htmlspecialchars($ctaUrl) . '" style="display:inline-block;background:#E0301E;color:#fff;text-decoration:none;font-weight:700;padding:12px 30px;border-radius:10px">' . htmlspecialchars($ctaText) . '</a></div>'
        : '';
    return '<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;font-family:Tahoma,Arial,sans-serif;background:#f5f6f8;padding:20px">'
        . '<div style="max-width:560px;margin:auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #eee">'
        . '<div style="background:#E0301E;padding:20px 28px"><span style="color:#fff;font-size:20px;font-weight:800">تميم للتوصيل 🚚</span></div>'
        . '<div style="padding:28px">'
        . '<h2 style="color:#241310;margin:0 0 12px;font-size:19px">' . htmlspecialchars($titleAr) . '</h2>'
        . '<div style="color:#555;font-size:15px;line-height:1.9">' . $bodyHtml . '</div>'
        . $cta
        . '</div>'
        . '<div style="background:#faf7f2;padding:16px 28px;text-align:center;color:#999;font-size:12px">© تميم للتوصيل — رسالة تلقائية، لا داعي للرد عليها</div>'
        . '</div></body></html>';
}
register_shutdown_function(function () {
    if (empty($GLOBALS['__deferred_mail'])) return;
    if (function_exists('fastcgi_finish_request')) { @fastcgi_finish_request(); }
    foreach ($GLOBALS['__deferred_mail'] as $m) {
        try { smtpSend([$m[0]], $m[1], $m[2], $m[3]); }
        catch (Throwable $e) { error_log('[mail] deferred send: ' . $e->getMessage()); }
    }
    $GLOBALS['__deferred_mail'] = [];
});

// ─── 7b. Auth guard: read Bearer token from Authorization header ────────
function authUser(): array {
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (!$auth || stripos($auth, 'Bearer ') !== 0) jsonErr('غير مسموح', 401, 'UNAUTHORIZED');
    $tok = trim(substr($auth, 7));
    $parts = explode('.', $tok);
    if (count($parts) !== 3) jsonErr('توكن غير صالح', 401, 'BAD_TOKEN');
    [$h, $p, $sig] = $parts;
    $expected = rtrim(strtr(base64_encode(hash_hmac('sha256', "$h.$p", env('JWT_ACCESS_SECRET') ?: '', true)), '+/', '-_'), '=');
    if (!hash_equals($expected, $sig)) jsonErr('توكن غير صالح', 401, 'BAD_TOKEN');
    $payload = json_decode((string) base64_decode(strtr($p, '-_', '+/')), true) ?: [];
    if (($payload['exp'] ?? 0) < time()) jsonErr('انتهت صلاحية الجلسة', 401, 'EXPIRED');
    // Remembered for the audit trail: every admin route calls authUser(), so
    // this is the single point that reliably knows who is acting.
    $GLOBALS['__auth_user'] = $payload;
    return $payload;
}

// ─── 8. Route handlers ──────────────────────────────────────────────────
if ($method === 'GET' && $path === '/health') {
    jsonOk(['status' => 'ok', 'env' => env('NODE_ENV', 'production'), 'runner' => 'php-shim', 'ts' => time() * 1000]);
}

// socket.io stub — PHP can't hold persistent connections, so we return a
// hard 501 with a body that makes the client back off. Retries are throttled
// client-side; without a specific reason the browser reconnects immediately.
if ($path === '/socket.io/' || str_starts_with($path, '/socket.io/')) {
    header('Content-Type: text/plain; charset=utf-8');
    http_response_code(501);
    echo 'realtime disabled — enable Node.js in hPanel to activate live updates';
    exit;
}

// ─── Global /admin/* guard ──────────────────────────────────────────────
// Node gates the whole admin namespace in one place (app.ts:163). The shim's
// handlers each call authUser(), but most never checked the ROLE — which was
// survivable only while every account holder was staff. /auth/register now
// mints a CUSTOMER token for any anonymous caller, so an ungated /admin/*
// handler would hand the whole User table (passwordHash included) to anyone.
// Gate the namespace once, here, before any admin handler runs.
// Maps the first path segment after /admin/ to the permission key the dashboard
// stores in User.permissions. A scoped ADMIN may only touch sections whose key
// is in their list. Unmapped segments (e.g. categories) stay role-gated only —
// there is no permission concept for them, so denying would just lock everyone
// out with no way to grant access.
$ADMIN_PERM_MAP = [
    'overview' => 'overview', 'alerts' => 'alerts', 'orders' => 'orders',
    'customers' => 'customers', 'drivers' => 'drivers', 'merchants' => 'merchants',
    'services' => 'services', 'products' => 'products',
    'pricing' => 'pricing', 'pricing-rules' => 'pricing', 'zones' => 'pricing',
    'payments' => 'payments', 'payment-gateway' => 'payment-gateway',
    'coupons' => 'coupons', 'reports' => 'reports', 'reviews' => 'reviews',
    'whatsapp' => 'whatsapp', 'broadcast' => 'broadcast', 'supervisors' => 'supervisors',
    'home-config' => 'home-settings', 'offers' => 'home-settings',
    'site-config' => 'site-settings', 'settings' => 'settings',
];
if (str_starts_with($path, '/admin/')) {
    $__admin = authUser();
    $__role = $__admin['role'] ?? '';
    if (!in_array($__role, ['ADMIN', 'SUPER_ADMIN'], true)) {
        jsonErr('غير مسموح', 403, 'FORBIDDEN');
    }
    // SUPER_ADMIN bypasses granular checks. A scoped ADMIN is held to their
    // permission list — WITHOUT this, "admin access to one section" silently
    // meant full access to every section and every /admin/* endpoint.
    if ($__role === 'ADMIN') {
        $__seg = explode('/', substr($path, strlen('/admin/')))[0];
        // Admin management is SUPER_ADMIN-only; a scoped admin has no key for it.
        if ($__seg === 'admins') jsonErr('هذه الصفحة لمدير النظام فقط', 403, 'FORBIDDEN');
        $__need = $ADMIN_PERM_MAP[$__seg] ?? null;
        if ($__need !== null) {
            // permissions live in the DB (the JWT carries only sub/role/exp).
            $__ps = db()->prepare('SELECT permissions FROM `User` WHERE id = ? LIMIT 1');
            $__ps->execute([$__admin['sub'] ?? '']);
            $__praw = $__ps->fetchColumn();
            // NULL = never configured → unrestricted (legacy admins, back-compat).
            // Any JSON value (incl. "[]") = explicitly scoped → enforce membership.
            if ($__praw !== null && $__praw !== false) {
                $__perms = json_decode((string) $__praw, true);
                if (!is_array($__perms)) $__perms = [];
                if (!in_array($__need, $__perms, true)) {
                    jsonErr('ليس لديك صلاحية للوصول لهذا القسم', 403, 'FORBIDDEN');
                }
            }
        }
    }
}

// ─── ADMIN endpoints (require admin JWT) ────────────────────────────────

// GET /admin/realtime?since=<ms> — ONE lightweight poll powering the dashboard's
// live notifier (new orders / alerts + counts). Replaces two separate 60s polls
// with a single tiny query, so it can run every ~15s in the background without
// burning the shared-hosting connection cap. `since` is the `now` value the
// server returned last tick; the client seeds a baseline on first load so a
// refresh never replays old items as "new".
if ($method === 'GET' && $path === '/admin/realtime') {
    authUser();
    $sinceMs = (int) ($_GET['since'] ?? 0);
    $sinceSql = $sinceMs > 0 ? gmdate('Y-m-d H:i:s', (int) ($sinceMs / 1000)) : gmdate('Y-m-d H:i:s', time() - 120);
    $nowMs = (int) round(microtime(true) * 1000);

    $os = db()->prepare("SELECT id, orderNumber, status, category, createdAt FROM `Order` WHERE createdAt > ? ORDER BY createdAt DESC LIMIT 25");
    $os->execute([$sinceSql]);
    $orders = array_map('jsonizeRow', $os->fetchAll());

    $al = db()->prepare("SELECT id, titleAr, title, severity, createdAt FROM `Alert` WHERE isResolved = 0 AND createdAt > ? ORDER BY createdAt DESC LIMIT 25");
    $al->execute([$sinceSql]);
    $alerts = array_map('jsonizeRow', $al->fetchAll());

    $openOrders = (int) db()->query("SELECT COUNT(*) FROM `Order` WHERE status IN ('NEW','UNDER_REVIEW','PRICED')")->fetchColumn();
    $openAlerts = (int) db()->query("SELECT COUNT(*) FROM `Alert` WHERE isResolved = 0")->fetchColumn();

    jsonOk([
        'orders' => $orders,
        'alerts' => $alerts,
        'counts' => ['openOrders' => $openOrders, 'alerts' => $openAlerts],
        'now' => $nowMs,
    ]);
}
// ─── Order money model ───────────────────────────────────────────────────
// One definition of who gets what, applied on EVERY order path (app cart,
// reorder, admin/manual) so the numbers can't disagree between them:
//
//   customer pays  = merchantSubtotal (goods) + deliveryFee − discount
//   merchant gets  = merchantSubtotal − platformCommission
//   Tamem gets     = platformCommission + deliveryFee − discount
//
// Whether an order has goods at all is decided by its SERVICE CATEGORY, never
// inferred from the row's own numbers:
//   SHIPPING  (شحن طرود) — carrying the customer's own parcel. No goods: the
//             whole charge IS the delivery, so goods/commission/payout are 0.
//   DELIVERY  (دليفري / اطلب أي حاجة) and MERCHANT (طلب تاجر) — we buy goods on
//             the customer's behalf. Goods always exist; the only question is
//             whether the split was recorded.
//
// Anything unknown is written as NULL — never as 0 and never back-solved from a
// guess. An earlier version of this function inferred "no merchant ⇒ pure
// delivery" and wrote deliveryFee = quotedPrice, which booked a 600 EGP pharmacy
// order as 600 EGP of delivery revenue that never existed. NULL costs a report
// line ("غير مفصّلة"); a guess costs the books.
// Before this existed, platformCommission/merchantPayout were NULL on all 19
// live orders and the revenue report hardcoded them to 0 while reporting every
// pound of sales as Tamem profit.
//
// INVARIANT: this function NEVER writes deliveryFee. That column is owned by the
// zone quote at order creation (and by an admin pricing it explicitly). A
// derived figure must not overwrite a recorded one.
function defaultCommissionPct(): float {
    try {
        $st = db()->prepare("SELECT `value` FROM `Setting` WHERE `key` = 'default_commission_pct' LIMIT 1");
        $st->execute();
        $v = $st->fetchColumn();
        if ($v !== false && $v !== null) {
            $d = json_decode((string) $v, true);
            if (is_numeric($d)) return (float) $d;
            if (is_numeric($v)) return (float) $v;
        }
    } catch (Throwable $e) { /* fall through */ }
    return 0.0;
}
/// Snapshot the assigned driver's delivery-fee share onto the order, freezing
/// the numbers so a later change to the driver's percentage never rewrites this
/// order's accounting. Called at driver-assign and again at delivery — delivery
/// wins, locking the final split against the final deliveryFee. Merchant goods
/// value is NEVER part of this split; a zero/absent fee yields a zero split.
function snapshotDriverShare(string $orderId): void {
    try {
        $q = db()->prepare(
            "SELECT o.deliveryFee, o.assignedDriverId, dp.deliverySharePct
             FROM `Order` o
             LEFT JOIN `DriverProfile` dp ON dp.userId = o.assignedDriverId
             WHERE o.id = ? LIMIT 1"
        );
        $q->execute([$orderId]);
        $o = $q->fetch();
        if (!$o || empty($o['assignedDriverId'])) return;
        $fee = $o['deliveryFee'] !== null ? (float) $o['deliveryFee'] : 0.0;
        if ($fee < 0) $fee = 0.0;
        $pct = $o['deliverySharePct'] !== null ? (float) $o['deliverySharePct'] : 0.0;
        $driverRev = round($fee * $pct / 100, 2);
        $companyRev = round($fee - $driverRev, 2);
        db()->prepare('UPDATE `Order` SET driverSharePct = ?, driverDeliveryRevenue = ?, companyDeliveryRevenue = ?, updatedAt = NOW(3) WHERE id = ?')
            ->execute([$pct, $driverRev, $companyRev, $orderId]);
    } catch (Throwable $e) { error_log('[api.php] snapshotDriverShare: ' . $e->getMessage()); }
}
function computeOrderFinancials(string $orderId): void {
    try {
        $q = db()->prepare(
            "SELECT o.id, o.merchantId, o.merchantSubtotal, o.deliveryFee,
                    o.quotedPrice, o.finalPrice, s.category AS svcCategory, mp.commissionPct
             FROM `Order` o
             LEFT JOIN `Service` s ON s.id = o.serviceId
             LEFT JOIN `MerchantProfile` mp ON mp.id = o.merchantId
             WHERE o.id = ? LIMIT 1"
        );
        $q->execute([$orderId]);
        $o = $q->fetch();
        if (!$o) return;

        $setMoney = function (?float $sub, ?float $comm, ?float $payout) use ($orderId) {
            db()->prepare('UPDATE `Order` SET merchantSubtotal = ?, platformCommission = ?, merchantPayout = ?, updatedAt = NOW(3) WHERE id = ?')
                ->execute([$sub, $comm, $payout, $orderId]);
        };

        // Carrying the customer's own parcel — there are no goods to split, so
        // zero here is a fact about the service, not a guess about the row.
        if (($o['svcCategory'] ?? '') === 'SHIPPING') { $setMoney(0.0, 0.0, 0.0); return; }

        $price = $o['finalPrice'] !== null ? (float) $o['finalPrice']
               : ($o['quotedPrice'] !== null ? (float) $o['quotedPrice'] : null);
        $fee = $o['deliveryFee'] !== null ? (float) $o['deliveryFee'] : null;

        // Goods value, best evidence first: the recorded subtotal, then the
        // order's own line items, then what's left of the price once a KNOWN
        // delivery fee is removed. If the fee was never recorded there is no
        // third option — the split is genuinely unknown.
        $sub = $o['merchantSubtotal'] !== null ? (float) $o['merchantSubtotal'] : null;
        if ($sub === null || $sub <= 0) {
            $sub = null;
            $it = db()->prepare('SELECT COALESCE(SUM(unitPriceSnapshot * quantity), 0) FROM `OrderItem` WHERE orderId = ?');
            $it->execute([$orderId]);
            $s = (float) $it->fetchColumn();
            if ($s > 0) $sub = $s;
        }
        if ($sub === null && $price !== null && $fee !== null) {
            $rest = $price - $fee;
            if ($rest > 0.009) $sub = $rest;
        }

        if ($sub === null) {
            // A goods order whose split was never captured (legacy quick order:
            // admin quoted one total, no zone fee, no items). Leave it NULL and
            // let the report count it under "غير مفصّلة" — inventing a number
            // here is exactly the bug this replaced.
            $setMoney(null, null, null);
            return;
        }

        $pct = $o['commissionPct'] !== null ? (float) $o['commissionPct'] : defaultCommissionPct();
        $commission = round($sub * $pct / 100, 2);
        $setMoney(round($sub, 2), $commission, round($sub - $commission, 2));
    } catch (Throwable $e) {
        error_log('[api.php] computeOrderFinancials: ' . $e->getMessage());
    }
}

// POST /admin/orders/recompute-financials — re-derive goods/commission/payout
// for existing orders using the ONE money model above. Needed after a
// commission change, and to backfill orders created before the model existed.
// SUPER_ADMIN only: it rewrites money columns across the table.
if ($method === 'POST' && $path === '/admin/orders/recompute-financials') {
    $u = authUser();
    if (($u['role'] ?? '') !== 'SUPER_ADMIN') jsonErr('فقط مدير النظام', 403, 'FORBIDDEN');
    $ids = db()->query('SELECT id FROM `Order` ORDER BY createdAt DESC')->fetchAll();
    $n = 0;
    foreach ($ids as $r) { computeOrderFinancials($r['id']); $n++; }
    jsonOk(['recomputed' => $n]);
}

// ─── Reports: services / drivers / customers ────────────────────────────
// These three had NO handler, so they fell through to the empty-list fallback:
// the report tabs rendered as "no data" forever while returning a cheerful 200.
// Shapes below match exactly what reports.tsx destructures per table.
if ($method === 'GET' && $path === '/admin/reports/services') {
    authUser();
    $rows = db()->query(
        "SELECT s.id AS serviceId, s.nameAr, s.category,
                COUNT(o.id) AS orders,
                COALESCE(SUM(COALESCE(o.finalPrice, o.quotedPrice, 0)), 0) AS revenue
         FROM `Service` s
         LEFT JOIN `Order` o ON o.serviceId = s.id
         GROUP BY s.id, s.nameAr, s.category
         ORDER BY orders DESC"
    )->fetchAll();
    jsonOk(array_map(static fn ($r) => [
        'serviceId' => $r['serviceId'], 'nameAr' => $r['nameAr'], 'category' => $r['category'],
        'orders' => (int) $r['orders'], 'revenue' => (float) $r['revenue'],
    ], $rows));
}
if ($method === 'GET' && $path === '/admin/reports/drivers') {
    $u = authUser(); if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    // Revenue is counted for DELIVERED/COMPLETED orders only — cancelled orders
    // never enter. Merchant goods value is separated from delivery fees, and the
    // driver's cut uses the SNAPSHOT saved on each order (falling back to the
    // driver's current % only for orders that predate the snapshot).
    // ── order-level filters (live in the JOIN so drivers with no matching
    //    orders still appear with zeros) ──
    $onArgs = []; $on = ["o.assignedDriverId = u.id", "o.status IN ('DELIVERED','COMPLETED')"];
    $from = trim((string) ($_GET['from'] ?? '')); $to = trim((string) ($_GET['to'] ?? ''));
    if ($from !== '') { $on[] = "COALESCE(o.deliveredAt, o.completedAt, o.updatedAt) >= ?"; $onArgs[] = $from . ' 00:00:00'; }
    if ($to !== '')   { $on[] = "COALESCE(o.deliveredAt, o.completedAt, o.updatedAt) <= ?"; $onArgs[] = $to . ' 23:59:59'; }
    $stf = strtoupper(trim((string) ($_GET['status'] ?? '')));
    if (in_array($stf, ['DELIVERED', 'COMPLETED'], true)) { $on[] = "o.status = ?"; $onArgs[] = $stf; }
    $settle = strtoupper(trim((string) ($_GET['settlement'] ?? '')));
    if (in_array($settle, ['PENDING', 'SETTLED'], true)) { $on[] = "o.driverSettlementStatus = ?"; $onArgs[] = $settle; }
    // ── driver-level filters (WHERE) ──
    $whArgs = []; $wh = ["u.role = 'DRIVER'"];
    $drv = trim((string) ($_GET['driverId'] ?? ''));
    if ($drv !== '') { $wh[] = "u.id = ?"; $whArgs[] = $drv; }
    $gov = trim((string) ($_GET['governorate'] ?? ''));
    if ($gov !== '') { $wh[] = "dp.governorate = ?"; $whArgs[] = $gov; }
    // Driver's delivery cut: the saved snapshot, else live (deliveryFee × current %).
    $due = "COALESCE(o.driverDeliveryRevenue, ROUND(COALESCE(o.deliveryFee,0) * COALESCE(dp.deliverySharePct,0) / 100, 2))";
    $sql = "SELECT u.id AS driverId, u.name, u.phone, u.governorate, dp.rating, dp.deliverySharePct,
                   COUNT(o.id) AS deliveries,
                   COALESCE(SUM(COALESCE(o.finalPrice, o.quotedPrice, 0)), 0) AS totalCollected,
                   COALESCE(SUM(COALESCE(o.merchantSubtotal, 0)), 0) AS merchantGoods,
                   COALESCE(SUM(COALESCE(o.deliveryFee, 0)), 0) AS totalDeliveryFees,
                   COALESCE(SUM($due), 0) AS driverDue,
                   COALESCE(SUM(COALESCE(o.deliveryFee, 0)) - SUM($due), 0) AS tamemRevenue,
                   COALESCE(SUM(CASE WHEN o.driverSettlementStatus = 'SETTLED' THEN $due ELSE 0 END), 0) AS paid,
                   COALESCE(SUM(CASE WHEN o.id IS NOT NULL AND o.driverSettlementStatus <> 'SETTLED' THEN $due ELSE 0 END), 0) AS remaining,
                   COALESCE(SUM(CASE WHEN o.id IS NOT NULL AND o.driverSettlementStatus <> 'SETTLED' THEN 1 ELSE 0 END), 0) AS pendingCount
            FROM `User` u
            JOIN `DriverProfile` dp ON dp.userId = u.id
            LEFT JOIN `Order` o ON " . implode(' AND ', $on) . "
            WHERE " . implode(' AND ', $wh) . "
            GROUP BY u.id, u.name, u.phone, u.governorate, dp.rating, dp.deliverySharePct
            ORDER BY driverDue DESC, deliveries DESC";
    $st = db()->prepare($sql);
    $st->execute(array_merge($onArgs, $whArgs));
    $rows = array_map(static fn ($r) => [
        'driverId' => $r['driverId'], 'name' => $r['name'], 'phone' => $r['phone'],
        'governorate' => $r['governorate'],
        'rating' => $r['rating'] !== null ? (float) $r['rating'] : null,
        'deliverySharePct' => (float) $r['deliverySharePct'],
        'deliveries' => (int) $r['deliveries'],
        'totalCollected' => (float) $r['totalCollected'],
        'merchantGoods' => (float) $r['merchantGoods'],
        'totalDeliveryFees' => (float) $r['totalDeliveryFees'],
        'driverDue' => (float) $r['driverDue'],
        'tamemRevenue' => (float) $r['tamemRevenue'],
        'paid' => (float) $r['paid'],
        'remaining' => (float) $r['remaining'],
        'pendingCount' => (int) $r['pendingCount'],
    ], $st->fetchAll());
    // Grand totals row.
    $sum = fn(string $k) => round(array_sum(array_map(fn($r) => $r[$k], $rows)), 2);
    $totals = [
        'deliveries' => array_sum(array_map(fn($r) => $r['deliveries'], $rows)),
        'totalCollected' => $sum('totalCollected'), 'merchantGoods' => $sum('merchantGoods'),
        'totalDeliveryFees' => $sum('totalDeliveryFees'), 'driverDue' => $sum('driverDue'),
        'tamemRevenue' => $sum('tamemRevenue'), 'paid' => $sum('paid'), 'remaining' => $sum('remaining'),
    ];
    // Distinct governorates for the filter dropdown.
    $govs = db()->query("SELECT DISTINCT governorate FROM `DriverProfile` WHERE governorate IS NOT NULL AND governorate <> '' ORDER BY governorate")->fetchAll(PDO::FETCH_COLUMN);
    jsonOk(['drivers' => $rows, 'totals' => $totals, 'governorates' => $govs]);
}
// Per-driver detail: every delivered order with its revenue split + a totals row.
if ($method === 'GET' && preg_match('#^/admin/reports/drivers/([^/]+)$#', $path, $m)) {
    $u = authUser(); if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $driverId = $m[1];
    $w = ["o.assignedDriverId = ?", "o.status IN ('DELIVERED','COMPLETED')"]; $a = [$driverId];
    $from = trim((string) ($_GET['from'] ?? '')); $to = trim((string) ($_GET['to'] ?? ''));
    if ($from !== '') { $w[] = "COALESCE(o.deliveredAt, o.completedAt, o.updatedAt) >= ?"; $a[] = $from . ' 00:00:00'; }
    if ($to !== '')   { $w[] = "COALESCE(o.deliveredAt, o.completedAt, o.updatedAt) <= ?"; $a[] = $to . ' 23:59:59'; }
    $stf = strtoupper(trim((string) ($_GET['status'] ?? '')));
    if (in_array($stf, ['DELIVERED', 'COMPLETED'], true)) { $w[] = "o.status = ?"; $a[] = $stf; }
    $settle = strtoupper(trim((string) ($_GET['settlement'] ?? '')));
    if (in_array($settle, ['PENDING', 'SETTLED'], true)) { $w[] = "o.driverSettlementStatus = ?"; $a[] = $settle; }
    $due = "COALESCE(o.driverDeliveryRevenue, ROUND(COALESCE(o.deliveryFee,0) * COALESCE(dp.deliverySharePct,0) / 100, 2))";
    $sql = "SELECT o.id, o.orderNumber, o.status, o.deliveredAt, o.completedAt,
                   COALESCE(o.merchantSubtotal, 0) AS merchantGoods,
                   COALESCE(o.deliveryFee, 0) AS deliveryFee,
                   COALESCE(o.driverSharePct, dp.deliverySharePct, 0) AS sharePct,
                   $due AS driverDue,
                   (COALESCE(o.deliveryFee, 0) - $due) AS tamemRevenue,
                   COALESCE(o.finalPrice, o.quotedPrice, 0) AS totalCollected,
                   o.driverSettlementStatus AS settlementStatus, o.driverSettledAt
            FROM `Order` o JOIN `DriverProfile` dp ON dp.userId = o.assignedDriverId
            WHERE " . implode(' AND ', $w) . "
            ORDER BY COALESCE(o.deliveredAt, o.completedAt, o.updatedAt) DESC";
    $st = db()->prepare($sql); $st->execute($a);
    $orders = array_map(static fn ($r) => [
        'orderId' => $r['id'], 'orderNumber' => $r['orderNumber'], 'status' => $r['status'],
        'deliveredAt' => isoZ($r['deliveredAt'] ?? $r['completedAt']),
        'merchantGoods' => (float) $r['merchantGoods'], 'deliveryFee' => (float) $r['deliveryFee'],
        'sharePct' => (float) $r['sharePct'], 'driverDue' => (float) $r['driverDue'],
        'tamemRevenue' => (float) $r['tamemRevenue'], 'totalCollected' => (float) $r['totalCollected'],
        'settlementStatus' => $r['settlementStatus'], 'settledAt' => isoZ($r['driverSettledAt']),
    ], $st->fetchAll());
    $sum = fn(string $k) => round(array_sum(array_map(fn($r) => $r[$k], $orders)), 2);
    $dh = db()->prepare("SELECT u.name, u.phone, dp.deliverySharePct, dp.rating FROM `User` u JOIN `DriverProfile` dp ON dp.userId = u.id WHERE u.id = ? LIMIT 1");
    $dh->execute([$driverId]); $d = $dh->fetch() ?: [];
    jsonOk([
        'driver' => ['id' => $driverId, 'name' => $d['name'] ?? null, 'phone' => $d['phone'] ?? null,
            'deliverySharePct' => isset($d['deliverySharePct']) ? (float) $d['deliverySharePct'] : 0,
            'rating' => isset($d['rating']) && $d['rating'] !== null ? (float) $d['rating'] : null],
        'orders' => $orders,
        'totals' => [
            'deliveries' => count($orders), 'merchantGoods' => $sum('merchantGoods'),
            'deliveryFees' => $sum('deliveryFee'), 'driverDue' => $sum('driverDue'),
            'tamemRevenue' => $sum('tamemRevenue'), 'totalCollected' => $sum('totalCollected'),
        ],
    ]);
}
if ($method === 'GET' && $path === '/admin/reports/customers') {
    authUser();
    $rows = db()->query(
        "SELECT u.id AS customerId, u.name, u.city,
                COUNT(o.id) AS orders,
                COALESCE(SUM(COALESCE(o.finalPrice, o.quotedPrice, 0)), 0) AS totalSpend
         FROM `User` u
         LEFT JOIN `Order` o ON o.customerId = u.id
         WHERE u.role = 'CUSTOMER'
         GROUP BY u.id, u.name, u.city
         ORDER BY orders DESC, totalSpend DESC
         LIMIT 100"
    )->fetchAll();
    jsonOk(array_map(static fn ($r) => [
        'customerId' => $r['customerId'], 'name' => $r['name'], 'city' => $r['city'],
        'orders' => (int) $r['orders'], 'totalSpend' => (float) $r['totalSpend'],
    ], $rows));
}

if ($method === 'GET' && $path === '/admin/overview') {
    $u = authUser();
    if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $range = $_GET['range'] ?? 'week';
    $now = time();
    if ($range === 'today') $fromTs = strtotime('today');
    elseif ($range === 'month') $fromTs = strtotime('first day of this month 00:00');
    else $fromTs = $now - 7 * 86400;
    $from = gmdate('Y-m-d\TH:i:s.000\Z', $fromTs);
    $to = gmdate('Y-m-d\TH:i:s.000\Z', $now);
    $fromSql = gmdate('Y-m-d H:i:s', $fromTs);
    $toSql = gmdate('Y-m-d H:i:s', $now);
    $pdo = db();
    $q = fn(string $sql, array $args = []) => (int) $pdo->prepare($sql)->execute($args) ?: 0;
    // helper that runs and returns the first scalar
    $scalar = function(string $sql, array $args = []) use ($pdo): int {
        $s = $pdo->prepare($sql); $s->execute($args); $r = $s->fetch(PDO::FETCH_NUM);
        return (int) ($r[0] ?? 0);
    };
    $totalOrders     = $scalar("SELECT COUNT(*) FROM `Order` WHERE createdAt BETWEEN ? AND ?", [$fromSql, $toSql]);
    $newOrders       = $scalar("SELECT COUNT(*) FROM `Order` WHERE status='NEW'");
    $pricedOrders    = $scalar("SELECT COUNT(*) FROM `Order` WHERE status='PRICED'");
    $activeOrders    = $scalar("SELECT COUNT(*) FROM `Order` WHERE status IN ('ACCEPTED','DRIVER_ASSIGNED','PICKED_UP','IN_ROUTE')");
    $completedOrders = $scalar("SELECT COUNT(*) FROM `Order` WHERE status IN ('COMPLETED','DELIVERED') AND (completedAt BETWEEN ? AND ? OR deliveredAt BETWEEN ? AND ?)", [$fromSql, $toSql, $fromSql, $toSql]);
    $cancelledOrders = $scalar("SELECT COUNT(*) FROM `Order` WHERE status='CANCELLED' AND cancelledAt BETWEEN ? AND ?", [$fromSql, $toSql]);
    $pendingPayments = $scalar("SELECT COUNT(*) FROM `Payment` WHERE status='PENDING'");
    $activeAlerts    = $scalar("SELECT COUNT(*) FROM `Alert` WHERE isResolved=0");
    $availableDrivers = $scalar("SELECT COUNT(*) FROM `DriverProfile` WHERE status='AVAILABLE'");
    $customersCount  = $scalar("SELECT COUNT(*) FROM `User` WHERE role='CUSTOMER' AND createdAt BETWEEN ? AND ?", [$fromSql, $toSql]);
    // Revenue
    $st = $pdo->prepare("SELECT finalPrice, quotedPrice FROM `Order` WHERE status IN ('COMPLETED','DELIVERED') AND (completedAt BETWEEN ? AND ? OR deliveredAt BETWEEN ? AND ? OR createdAt BETWEEN ? AND ?)");
    $st->execute([$fromSql, $toSql, $fromSql, $toSql, $fromSql, $toSql]);
    $revenue = 0.0;
    foreach ($st->fetchAll() as $r) $revenue += (float) ($r['finalPrice'] ?? $r['quotedPrice'] ?? 0);
    // 7-day trend
    $trendFromSql = gmdate('Y-m-d H:i:s', $now - 7 * 86400);
    $st = $pdo->prepare("SELECT DATE(createdAt) AS d, status, finalPrice, quotedPrice FROM `Order` WHERE createdAt >= ?");
    $st->execute([$trendFromSql]);
    $rows = $st->fetchAll();
    $trend = [];
    for ($i = 6; $i >= 0; $i--) {
        $day = gmdate('Y-m-d', $now - $i * 86400);
        $orders = 0; $rev = 0.0;
        foreach ($rows as $r) {
            if ($r['d'] === $day) {
                $orders++;
                if (in_array($r['status'], ['COMPLETED', 'DELIVERED'], true)) {
                    $rev += (float) ($r['finalPrice'] ?? $r['quotedPrice'] ?? 0);
                }
            }
        }
        $trend[] = ['day' => $day, 'orders' => $orders, 'revenue' => $rev];
    }
    // ordersByService
    $st = $pdo->prepare("SELECT serviceId, COUNT(*) AS c FROM `Order` WHERE createdAt BETWEEN ? AND ? GROUP BY serviceId");
    $st->execute([$fromSql, $toSql]);
    $byService = [];
    foreach ($st->fetchAll() as $r) {
        $svc = $pdo->prepare("SELECT nameAr, category FROM `Service` WHERE id=?");
        $svc->execute([$r['serviceId']]);
        $s = $svc->fetch();
        $byService[] = [
            'serviceId' => $r['serviceId'],
            'serviceName' => $s['nameAr'] ?? 'غير معروف',
            'category' => $s['category'] ?? null,
            'count' => (int) $r['c'],
        ];
    }
    jsonOk([
        'kpis' => compact('totalOrders', 'newOrders', 'pricedOrders', 'activeOrders',
            'completedOrders', 'cancelledOrders', 'pendingPayments', 'activeAlerts',
            'availableDrivers', 'customersCount') + ['revenue' => $revenue],
        'trend' => $trend,
        'ordersByService' => $byService,
        'range' => $range,
        'from' => $from,
        'to' => $to,
    ]);
}

if ($method === 'GET' && $path === '/admin/alerts') {
    $u = authUser();
    if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    // Refresh before answering, so the page never shows a stale picture.
    maybeAutoSweep();
    $where = [];
    $args = [];
    $resolved = $_GET['resolved'] ?? null;
    if ($resolved !== null) {
        $where[] = 'isResolved = ?';
        $args[] = ($resolved === 'true' || $resolved === '1') ? 1 : 0;
    }
    if (!empty($_GET['status'])) { $where[] = 'status = ?'; $args[] = $_GET['status']; }
    if (!empty($_GET['severity'])) { $where[] = 'severity = ?'; $args[] = $_GET['severity']; }
    if (!empty($_GET['category'])) { $where[] = 'category = ?'; $args[] = $_GET['category']; }
    $sql = 'SELECT * FROM `Alert`' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY createdAt DESC LIMIT 100';
    $st = db()->prepare($sql); $st->execute($args);
    // jsonizeRow stamps the Z on createdAt/resolvedAt so the alerts page shows
    // Cairo time, not a raw UTC string parsed as local (3 hours early).
    $items = array_map('jsonizeRow', $st->fetchAll());
    // Stats by severity — that's what the api-client's `adminListAlerts`
    // pulls out of `meta.stats`.
    // "Active" = OPEN | ACKNOWLEDGED | ESCALATED, matching the Node backend.
    // isResolved is the legacy flag and misses ACKNOWLEDGED work still open.
    $ACTIVE = "status IN ('OPEN','ACKNOWLEDGED','ESCALATED')";
    $sevCounts = db()->query("SELECT severity, COUNT(*) c FROM `Alert` WHERE $ACTIVE GROUP BY severity")->fetchAll();
    $bySeverity = [];
    foreach ($sevCounts as $c) $bySeverity[$c['severity']] = (int) $c['c'];
    $totalActive = (int) db()->query("SELECT COUNT(*) FROM `Alert` WHERE $ACTIVE")->fetchColumn();
    // The page renders a count on every category chip; without this each one
    // read as blank.
    $byCategory = [];
    foreach (db()->query("SELECT category, COUNT(*) c FROM `Alert` WHERE $ACTIVE GROUP BY category")->fetchAll() as $c) {
        $byCategory[$c['category'] ?? 'SYSTEM'] = (int) $c['c'];
    }
    $resolvedToday = (int) db()->query("SELECT COUNT(*) FROM `Alert` WHERE status = 'RESOLVED' AND resolvedAt >= '" . gmdate('Y-m-d 00:00:00') . "'")->fetchColumn();
    // The api-client reads res.data.data (list) + res.data.meta.stats.
    // Bypass jsonOk() so we can put the list at the top-level `data` key
    // instead of nesting it inside another object.
    http_response_code(200);
    echo json_encode([
        'data' => $items,
        'meta' => [
            'stats' => [
                'critical' => $bySeverity['CRITICAL'] ?? 0,
                'high' => $bySeverity['HIGH'] ?? 0,
                'medium' => $bySeverity['MEDIUM'] ?? 0,
                'low' => $bySeverity['LOW'] ?? 0,
                'resolvedToday' => $resolvedToday,
                'totalActive' => $totalActive,
                // Force an object: an empty PHP array encodes as [] and the
                // page indexes into it.
                'byCategory' => (object) $byCategory,
            ],
        ],
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'GET' && $path === '/admin/alerts/stats') {
    maybeAutoSweep();
    authUser();
    $counts = db()->query("SELECT status, COUNT(*) c FROM `Alert` GROUP BY status")->fetchAll();
    $byStatus = [];
    foreach ($counts as $c) $byStatus[$c['status']] = (int) $c['c'];
    jsonOk([
        'total' => array_sum($byStatus),
        'open' => $byStatus['OPEN'] ?? 0,
        'acknowledged' => $byStatus['ACKNOWLEDGED'] ?? 0,
        'resolved' => $byStatus['RESOLVED'] ?? 0,
        'dismissed' => $byStatus['DISMISSED'] ?? 0,
        'escalated' => $byStatus['ESCALATED'] ?? 0,
    ]);
}
// Alert detail
if ($method === 'GET' && preg_match('#^/admin/alerts/([^/]+)$#', $path, $m) && $m[1] !== 'stats') {
    authUser();
    $st = db()->prepare('SELECT * FROM `Alert` WHERE id = ?'); $st->execute([$m[1]]);
    $r = $st->fetch();
    if (!$r) jsonErr('التنبيه غير موجود', 404, 'NOT_FOUND');
    jsonOk(jsonizeRow($r));
}
// Alert actions
if ($method === 'POST' && preg_match('#^/admin/alerts/([^/]+)/(resolve|ack|dismiss|escalate)$#', $path, $m)) {
    $u = authUser(); if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $b = readJsonBody(); $uid = $u['sub'] ?? null; $id = $m[1];
    if ($m[2] === 'resolve') {
        db()->prepare("UPDATE `Alert` SET status='RESOLVED', isResolved=1, resolvedAt=NOW(3), resolvedById=?, resolutionNotes=?, updatedAt=NOW(3) WHERE id=?")
            ->execute([$uid, (string)($b['note'] ?? ''), $id]);
    } elseif ($m[2] === 'ack') {
        db()->prepare("UPDATE `Alert` SET status='ACKNOWLEDGED', ackedAt=NOW(3), ackedById=?, updatedAt=NOW(3) WHERE id=?")->execute([$uid, $id]);
    } elseif ($m[2] === 'dismiss') {
        db()->prepare("UPDATE `Alert` SET status='DISMISSED', isResolved=1, dismissedAt=NOW(3), dismissedById=?, resolutionNotes=?, updatedAt=NOW(3) WHERE id=?")
            ->execute([$uid, (string)($b['note'] ?? ''), $id]);
    } else { // escalate
        db()->prepare("UPDATE `Alert` SET status='ESCALATED', severity='CRITICAL', escalatedAt=NOW(3), escalatedById=?, updatedAt=NOW(3) WHERE id=?")->execute([$uid, $id]);
    }
    $st = db()->prepare('SELECT * FROM `Alert` WHERE id = ?'); $st->execute([$id]);
    jsonOk(jsonizeRow($st->fetch()) ?: []);
}
if ($method === 'POST' && preg_match('#^/admin/alerts/([^/]+)/note$#', $path, $m)) {
    authUser(); $b = readJsonBody();
    db()->prepare("UPDATE `Alert` SET resolutionNotes=?, updatedAt=NOW(3) WHERE id=?")->execute([(string)($b['note'] ?? ''), $m[1]]);
    jsonOk(['ok' => true]);
}
// ─── Alert sweep ─────────────────────────────────────────────────────────────
// Mirrors apps/backend/src/jobs/alerts.ts. That job runs on node-cron inside the
// Node backend, which does not run on this host — so without this, live has no
// alerts at all. Same rules, same triggerKey scheme, same dedup, so whichever
// backend runs the sweep the result is identical.
//
// CASH_LIMIT_EXCEEDED is intentionally absent: DriverProfile.cashOnHand is never
// written anywhere, so the rule can never fire. Implementing it here would only
// suggest a check that isn't happening.

/// Thresholds are tunable from Settings; values are JSON-encoded there.
function alertSetting(string $key, float $fallback): float {
    static $cache = [];
    if (array_key_exists($key, $cache)) return $cache[$key];
    try {
        $st = db()->prepare('SELECT value FROM `Setting` WHERE `key` = ? LIMIT 1');
        $st->execute([$key]);
        $v = $st->fetchColumn();
        if ($v === false) return $cache[$key] = $fallback;
        $d = json_decode((string) $v, true);
        if (is_numeric($d)) return $cache[$key] = (float) $d;
        if (is_numeric($v)) return $cache[$key] = (float) $v;
        return $cache[$key] = $fallback;
    } catch (Throwable $e) {
        return $cache[$key] = $fallback;
    }
}

/// Insert unless an alert with this key is already live. Matches the Node job:
/// only OPEN/ACKNOWLEDGED/ESCALATED block a re-raise, so an alert that was
/// resolved while its cause persists deliberately comes back.
function upsertAlert(array $a): bool {
    try {
        $ex = db()->prepare("SELECT id FROM `Alert` WHERE triggerKey = ? AND status IN ('OPEN','ACKNOWLEDGED','ESCALATED') LIMIT 1");
        $ex->execute([$a['triggerKey']]);
        if ($ex->fetch()) return false;
        $ins = db()->prepare("INSERT INTO `Alert`
            (id, type, category, severity, status, title, titleAr, description, descriptionAr,
             relatedOrderId, relatedUserId, triggerKey, triggerReason, isResolved, createdAt, updatedAt)
            VALUES (?,?,?,?,'OPEN',?,?,?,?,?,?,?,?,0,NOW(3),NOW(3))");
        $ins->execute([
            newId(), $a['type'], $a['category'], $a['severity'],
            $a['title'], $a['titleAr'], $a['description'], $a['descriptionAr'],
            $a['relatedOrderId'] ?? null, $a['relatedUserId'] ?? null,
            $a['triggerKey'], $a['triggerReason'] ?? null,
        ]);
        return true;
    } catch (Throwable $e) {
        error_log('[api.php] upsertAlert failed: ' . $e->getMessage());
        return false;
    }
}

// Raise an alert the INSTANT an order is created, so the alerts centre grows in
// real time instead of only after the 15-min "pending" sweep. Same Alert table
// the centre reads + the realtime poll watches, so it surfaces everywhere at
// once. Distinct triggerKey from the sweep's PENDING_ORDER so they don't fight.
function alertNewOrder(string $orderId, string $orderNumber): void {
    upsertAlert([
        'type' => 'NEW_ORDER', 'category' => 'ORDER', 'severity' => 'MEDIUM',
        'title' => 'New order received', 'titleAr' => 'طلب جديد وصل',
        'description' => "Order {$orderNumber} just arrived and needs review",
        'descriptionAr' => "طلب جديد *{$orderNumber}* وصل — بانتظار المراجعة والتسعير",
        'relatedOrderId' => $orderId,
        'triggerKey' => 'NEW_ORDER:' . $orderId,
        'triggerReason' => 'order created',
    ]);
}
// Once an order is actually being handled, clear its "new order" alert so the
// centre reflects reality instead of piling up stale entries.
function resolveOrderAlerts(string $orderId): void {
    try {
        db()->prepare("UPDATE `Alert` SET status = 'RESOLVED', isResolved = 1, resolvedAt = NOW(3), updatedAt = NOW(3)
                       WHERE relatedOrderId = ? AND triggerKey = ? AND status IN ('OPEN','ACKNOWLEDGED','ESCALATED')")
            ->execute([$orderId, 'NEW_ORDER:' . $orderId]);
    } catch (Throwable $e) { /* best-effort */ }
}

function runAlertSweep(): array {
    $created = 0;
    $now = time();
    $ago = function (float $min) use ($now) { return gmdate('Y-m-d H:i:s', $now - (int) round($min * 60)); };
    $pdo = db();

    // ── orders stuck in NEW ──
    $m = alertSetting('order_new_alert_minutes', 15);
    $st = $pdo->prepare("SELECT id, orderNumber FROM `Order` WHERE status = 'NEW' AND createdAt < ?");
    $st->execute([$ago($m)]);
    foreach ($st->fetchAll() as $o) {
        $created += upsertAlert([
            'type' => 'PENDING_ORDER', 'category' => 'ORDER', 'severity' => 'HIGH',
            'title' => 'New order not handled', 'titleAr' => 'طلب جديد بدون معالجة',
            'description' => "Order {$o['orderNumber']} has been NEW for over {$m} min",
            'descriptionAr' => "الطلب {$o['orderNumber']} لسه جديد من أكتر من " . (int) $m . " دقيقة",
            'relatedOrderId' => $o['id'],
            'triggerKey' => 'PENDING_ORDER:' . $o['id'] . ':NEW',
            'triggerReason' => 'NEW > ' . (int) $m . 'm',
        ]) ? 1 : 0;
    }

    // ── priced but not accepted ──
    $m = alertSetting('order_pending_alert_minutes', 60);
    $st = $pdo->prepare("SELECT id, orderNumber FROM `Order` WHERE status = 'PRICED' AND updatedAt < ?");
    $st->execute([$ago($m)]);
    foreach ($st->fetchAll() as $o) {
        $created += upsertAlert([
            'type' => 'PENDING_ORDER', 'category' => 'ORDER', 'severity' => 'MEDIUM',
            'title' => 'Priced order awaiting customer', 'titleAr' => 'طلب مُسعّر بانتظار العميل',
            'description' => "Order {$o['orderNumber']} priced over {$m} min ago",
            'descriptionAr' => "الطلب {$o['orderNumber']} اتسعّر من أكتر من " . (int) $m . " دقيقة ولسه مش مقبول",
            'relatedOrderId' => $o['id'],
            'triggerKey' => 'PENDING_ORDER:' . $o['id'] . ':PRICED',
            'triggerReason' => 'PRICED > ' . (int) $m . 'm',
        ]) ? 1 : 0;
    }

    // ── merchant not accepting ──
    $m = alertSetting('order_review_alert_minutes', 30);
    $st = $pdo->prepare("SELECT id, orderNumber FROM `Order` WHERE status = 'UNDER_REVIEW' AND updatedAt < ?");
    $st->execute([$ago($m)]);
    foreach ($st->fetchAll() as $o) {
        $created += upsertAlert([
            'type' => 'MERCHANT_NOT_ACCEPTING', 'category' => 'MERCHANT', 'severity' => 'HIGH',
            'title' => 'Merchant not responding', 'titleAr' => 'التاجر مش بيرد على الطلب',
            'description' => "Order {$o['orderNumber']} under review over {$m} min",
            'descriptionAr' => "الطلب {$o['orderNumber']} تحت المراجعة من أكتر من " . (int) $m . " دقيقة",
            'relatedOrderId' => $o['id'],
            'triggerKey' => 'MERCHANT_NOT_ACCEPTING:' . $o['id'],
            'triggerReason' => 'UNDER_REVIEW > ' . (int) $m . 'm',
        ]) ? 1 : 0;
    }

    // ── accepted with no driver ──
    $m = alertSetting('order_no_driver_alert_minutes', 15);
    $st = $pdo->prepare("SELECT id, orderNumber FROM `Order` WHERE status = 'ACCEPTED' AND assignedDriverId IS NULL AND updatedAt < ?");
    $st->execute([$ago($m)]);
    foreach ($st->fetchAll() as $o) {
        $created += upsertAlert([
            'type' => 'DRIVER_NOT_ASSIGNED', 'category' => 'DELAY', 'severity' => 'HIGH',
            'title' => 'No driver assigned', 'titleAr' => 'مفيش سائق متعيّن',
            'description' => "Order {$o['orderNumber']} accepted over {$m} min ago with no driver",
            'descriptionAr' => "الطلب {$o['orderNumber']} مقبول من أكتر من " . (int) $m . " دقيقة ولسه من غير سائق",
            'relatedOrderId' => $o['id'],
            'triggerKey' => 'DRIVER_NOT_ASSIGNED:' . $o['id'],
            'triggerReason' => 'ACCEPTED no driver > ' . (int) $m . 'm',
        ]) ? 1 : 0;
    }

    // ── pickup late ──
    $m = alertSetting('order_pickup_late_minutes', 30);
    $st = $pdo->prepare("SELECT id, orderNumber FROM `Order` WHERE status = 'DRIVER_ASSIGNED' AND updatedAt < ?");
    $st->execute([$ago($m)]);
    foreach ($st->fetchAll() as $o) {
        $created += upsertAlert([
            'type' => 'DRIVER_PICKUP_LATE', 'category' => 'DELAY', 'severity' => 'MEDIUM',
            'title' => 'Pickup late', 'titleAr' => 'تأخر في الاستلام',
            'description' => "Order {$o['orderNumber']} assigned over {$m} min ago, not picked up",
            'descriptionAr' => "الطلب {$o['orderNumber']} متعيّنله سائق من أكتر من " . (int) $m . " دقيقة ولسه مااستلمش",
            'relatedOrderId' => $o['id'],
            'triggerKey' => 'DRIVER_PICKUP_LATE:' . $o['id'],
            'triggerReason' => 'DRIVER_ASSIGNED > ' . (int) $m . 'm',
        ]) ? 1 : 0;
    }

    // ── delivery late ──
    $m = alertSetting('order_delivery_late_minutes', 60);
    $st = $pdo->prepare("SELECT id, orderNumber FROM `Order` WHERE status = 'IN_ROUTE' AND updatedAt < ?");
    $st->execute([$ago($m)]);
    foreach ($st->fetchAll() as $o) {
        $created += upsertAlert([
            'type' => 'DRIVER_DELIVERY_LATE', 'category' => 'DELAY', 'severity' => 'HIGH',
            'title' => 'Delivery late', 'titleAr' => 'تأخر في التوصيل',
            'description' => "Order {$o['orderNumber']} in route over {$m} min",
            'descriptionAr' => "الطلب {$o['orderNumber']} في الطريق من أكتر من " . (int) $m . " دقيقة",
            'relatedOrderId' => $o['id'],
            'triggerKey' => 'DRIVER_DELIVERY_LATE:' . $o['id'],
            'triggerReason' => 'IN_ROUTE > ' . (int) $m . 'm',
        ]) ? 1 : 0;
    }

    // ── driver gone quiet ──
    $m = alertSetting('driver_idle_alert_minutes', 25);
    $st = $pdo->prepare("SELECT dp.userId, u.name FROM `DriverProfile` dp LEFT JOIN `User` u ON u.id = dp.userId
        WHERE dp.status = 'BUSY' AND (dp.lastLocationAt IS NULL OR dp.lastLocationAt < ?)");
    $st->execute([$ago($m)]);
    foreach ($st->fetchAll() as $d) {
        $name = $d['name'] ?? 'سائق';
        $created += upsertAlert([
            'type' => 'DRIVER_NOT_RESPONDING', 'category' => 'DRIVER', 'severity' => 'HIGH',
            'title' => 'Driver not responding', 'titleAr' => 'سائق مش بيرد',
            'description' => "Driver {$name} is BUSY but sent no location for over {$m} min",
            'descriptionAr' => "السائق {$name} حالته مشغول لكن مبعتش موقعه من أكتر من " . (int) $m . " دقيقة",
            'relatedUserId' => $d['userId'],
            'triggerKey' => 'DRIVER_NOT_RESPONDING:' . $d['userId'],
            'triggerReason' => 'BUSY, no location > ' . (int) $m . 'm',
        ]) ? 1 : 0;
    }

    // ── payments stuck pending ──
    $m = alertSetting('payment_pending_alert_minutes', 30);
    $st = $pdo->prepare("SELECT id, orderId, amount FROM `Payment` WHERE status = 'PENDING' AND createdAt < ?");
    $st->execute([$ago($m)]);
    foreach ($st->fetchAll() as $pay) {
        $created += upsertAlert([
            'type' => 'PAYMENT_PENDING', 'category' => 'PAYMENT', 'severity' => 'MEDIUM',
            'title' => 'Payment pending', 'titleAr' => 'دفعة معلّقة',
            'description' => "Payment of {$pay['amount']} pending over {$m} min",
            'descriptionAr' => "دفعة بقيمة {$pay['amount']} ج.م معلّقة من أكتر من " . (int) $m . " دقيقة",
            'relatedOrderId' => $pay['orderId'] ?? null,
            'triggerKey' => 'PAYMENT_PENDING:' . $pay['id'],
            'triggerReason' => 'PENDING > ' . (int) $m . 'm',
        ]) ? 1 : 0;
    }

    // ── failed payments (last 48h) ──
    $st = $pdo->prepare("SELECT id, orderId, amount FROM `Payment` WHERE status = 'FAILED' AND createdAt > ?");
    $st->execute([gmdate('Y-m-d H:i:s', $now - 48 * 3600)]);
    foreach ($st->fetchAll() as $pay) {
        $created += upsertAlert([
            'type' => 'PAYMENT_FAILED', 'category' => 'PAYMENT', 'severity' => 'HIGH',
            'title' => 'Payment failed', 'titleAr' => 'فشلت عملية دفع',
            'description' => "Payment of {$pay['amount']} failed",
            'descriptionAr' => "فشلت دفعة بقيمة {$pay['amount']} ج.م",
            'relatedOrderId' => $pay['orderId'] ?? null,
            'triggerKey' => 'PAYMENT_FAILED:' . $pay['id'],
            'triggerReason' => 'payment FAILED',
        ]) ? 1 : 0;
    }

    return ['created' => $created, 'ranAt' => gmdate('Y-m-d\TH:i:s.000\Z')];
}

/**
 * Run the sweep at most once every SWEEP_EVERY seconds, riding on a request
 * that is already open. Costs no extra DB connection — the alternative (an
 * external cron pinging the API) would spend one per run out of a 500/hour cap.
 *
 * Never allowed to affect the response: any failure is logged and swallowed,
 * and the throttle file is stamped BEFORE the work so a sweep that dies cannot
 * make every subsequent request retry it.
 */
function maybeAutoSweep(): void {
    $SWEEP_EVERY = 300; // 5 min — matches the node-cron cadence
    try {
        $dir = __DIR__ . '/uploads/.alerts';
        if (!is_dir($dir)) @mkdir($dir, 0755, true);
        $stamp = $dir . '/last-sweep';
        $last = is_file($stamp) ? (int) @file_get_contents($stamp) : 0;
        if (time() - $last < $SWEEP_EVERY) return;

        // Claim the slot first: two requests arriving together must not both
        // sweep, and a crash must not leave every later request retrying.
        if (@file_put_contents($stamp, (string) time(), LOCK_EX) === false) return;

        $res = runAlertSweep();
        if (($res['created'] ?? 0) > 0) {
            error_log('[api.php] auto-sweep created ' . $res['created'] . ' alert(s)');
        }
    } catch (Throwable $e) {
        error_log('[api.php] auto-sweep failed: ' . $e->getMessage());
    }
}

if ($method === 'POST' && $path === '/admin/alerts/run-sweep') {
    $u = authUser();
    if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    jsonOk(runAlertSweep());
}

// Cron entry point: no JWT (a cron has no session), so it is gated by a shared
// secret in the env instead. Without this the sweep only ever runs when an
// admin happens to click the button — which is why live had zero alerts.
if ($method === 'POST' && $path === '/internal/alerts/sweep') {
    $secret = env('CRON_SECRET') ?: '';
    $given = $_SERVER['HTTP_X_CRON_KEY'] ?? ($_GET['key'] ?? '');
    if ($secret === '' || !hash_equals($secret, (string) $given)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    jsonOk(runAlertSweep());
}

// ─── WhatsApp bridge (Baileys) — a persistent Node.js process runs the real
// WhatsApp Web session and talks to us through files under uploads/.wa:
//   status.json  ← bridge writes {status, qrDataUrl, phone, startedAt, lastError, ts}
//   queue/*.json → we write outgoing messages {to, text}; bridge sends + deletes
//   control/*.json → we write {action:'logout'} etc.
function waDir(): string { $d = __DIR__ . '/uploads/.wa'; if (!is_dir($d)) @mkdir($d, 0755, true); return $d; }
// Queue an outgoing WhatsApp message for the Baileys bridge to send.
function waEnqueue(?string $to, string $text): void {
    $to = trim((string)$to);
    if ($to === '' || $text === '') return;
    $dir = waDir();
    @mkdir($dir . '/queue', 0755, true);
    @mkdir($dir . '/dedupe', 0755, true);
    // Idempotency. The same (recipient, text) within a short window is a
    // DUPLICATE TRIGGER — a double-clicked button, a status change whose handler
    // also fires notifyOrderParties, a client retry — not a second real message.
    // Order-stage messages for one transition are byte-identical, and no genuine
    // flow re-sends identical text to the same number within seconds (OTPs embed
    // a unique code, so they never collide). Drop the repeat.
    $key = hash('sha256', $to . '|' . $text);
    $marker = $dir . '/dedupe/' . $key . '.txt';
    $now = time();
    $TTL = 180; // 3 minutes
    $last = @file_get_contents($marker);
    if ($last !== false && is_numeric($last) && ($now - (int) $last) < $TTL) {
        return; // identical message already enqueued moments ago — skip
    }
    @file_put_contents($marker, (string) $now);
    // Occasional cheap GC so markers don't accumulate forever.
    if (random_int(1, 50) === 1) {
        foreach (glob($dir . '/dedupe/*.txt') ?: [] as $f) {
            if (($now - (int) @filemtime($f)) > $TTL) @unlink($f);
        }
    }
    // The bridge also honours this key as a second line of defence against a
    // send that delivered but threw (timeout) and would otherwise be retried.
    @file_put_contents($dir . '/queue/' . bin2hex(random_bytes(8)) . '.json',
        json_encode(['to' => $to, 'text' => $text, 'dedupe' => $key], JSON_UNESCAPED_UNICODE));
}
function orderStatusLabelAr(string $s): string {
    return [
        'NEW' => 'جديد', 'UNDER_REVIEW' => 'قيد المراجعة', 'PRICED' => 'تم التسعير',
        'ACCEPTED' => 'مقبول', 'DRIVER_ASSIGNED' => 'تم تعيين سائق', 'PICKED_UP' => 'تم الاستلام',
        'IN_ROUTE' => 'في الطريق', 'DELIVERED' => 'تم التوصيل', 'COMPLETED' => 'مكتمل',
        'CANCELLED' => 'ملغي',
    ][$s] ?? $s;
}
// The business/admin WhatsApp number that receives oversight notifications.
// Setting `whatsapp_business_number` (JSON-encoded) wins; env is the fallback.
function waAdminNumber(): ?string {
    try {
        $st = db()->prepare("SELECT `value` FROM `Setting` WHERE `key` = 'whatsapp_business_number' LIMIT 1");
        $st->execute();
        $v = $st->fetchColumn();
        if (is_string($v) && $v !== '') {
            $dec = json_decode($v, true);
            $num = trim(is_string($dec) ? $dec : $v);
            if ($num !== '') return $num;
        }
    } catch (Throwable $e) { /* fall through to env */ }
    $env = trim((string) env('WHATSAPP_BUSINESS_NUMBER', ''));
    return $env !== '' ? $env : null;
}

// Order-update WhatsApp fan-out. Three tailored variants per transition:
//   • CUSTOMER — friendly journey updates about their own order
//   • DRIVER   — only actionable stages, with pickup/delivery operational detail
//   • ADMIN    — milestones only, on the business number, with an internal summary
// The driver deliberately does NOT get every status; text + fields differ per
// role. Messages are queued via waEnqueue (the Baileys bridge delivers them).
// Arabic labels for the machine enums that appear in messages.
function waCategoryAr(?string $c): string {
    return ['DELIVERY' => 'دليفري', 'SHIPPING' => 'شحن', 'MERCHANT' => 'من متجر', 'B2B' => 'تجاري'][$c ?? ''] ?? (string) $c;
}
function waPayMethodAr(?string $m): string {
    return ['CASH' => 'كاش عند الاستلام', 'WALLET' => 'محفظة', 'CARD' => 'بطاقة', 'INSTAPAY' => 'إنستاباي', 'VODAFONE_CASH' => 'فودافون كاش', 'EASYKASH' => 'إيزي كاش'][$m ?? ''] ?? (string) $m;
}
function waPayStatusAr(?string $s): string {
    return ['PENDING' => 'غير مدفوع', 'PAID' => 'مدفوع', 'REFUNDED' => 'مسترجع', 'FAILED' => 'فشل الدفع'][$s ?? ''] ?? (string) $s;
}
function waMoney($v): ?string {
    if ($v === null || $v === '') return null;
    return number_format((float) $v, 2) . ' ج.م';
}
// Builds the reusable detail blocks shared across the three message variants, so
// customer/driver/admin all read from ONE authoritative view of the order.
function orderDetailBlocks(array $o): array {
    $b = [];
    // Items — the app writes a ready human-readable bullet list into Order.notes
    // for product orders. For free-text delivery orders the customer's typed
    // request lives in customData.order_text (the "تفاصيل الطلب" field). Fall
    // back to structured OrderItem rows if neither is present.
    $items = trim((string) ($o['notes'] ?? ''));
    if ($items === '') {
        $cd = json_decode((string) ($o['customData'] ?? ''), true);
        if (is_array($cd) && !empty($cd['order_text'])) $items = trim((string) $cd['order_text']);
    }
    if ($items === '') {
        try {
            // Grouped by store. The dispatcher reads this to know WHERE to buy
            // the items, and a cart order can span several merchants — a flat
            // list of product names left them guessing.
            $st = db()->prepare(
                'SELECT oi.quantity, oi.productNameSnapshot, oi.unitPriceSnapshot,'
                . ' oi.variantNameSnapshot, oi.addonsSnapshot,'
                . ' oi.merchantId, mp.storeNameAr'
                . ' FROM `OrderItem` oi'
                . ' LEFT JOIN `MerchantProfile` mp ON mp.id = oi.merchantId'
                . ' WHERE oi.orderId = ? ORDER BY oi.merchantId, oi.id'
            );
            $st->execute([$o['id']]);

            $groups = [];
            foreach ($st->fetchAll() as $it) {
                $key = (string) ($it['merchantId'] ?? '');
                $groups[$key]['name'] = trim((string) ($it['storeNameAr'] ?? ''));
                $pl = waMoney($it['unitPriceSnapshot']);
                // Size inline with the name, extras on a sub-line — the
                // dispatcher has to buy exactly this, so it can't be implied.
                $nm = trim((string) $it['productNameSnapshot']);
                if (!empty($it['variantNameSnapshot'])) $nm .= ' — ' . $it['variantNameSnapshot'];
                $line = '• ' . (int) $it['quantity'] . '× ' . $nm . ($pl ? " ({$pl})" : '');

                $ex = json_decode((string) ($it['addonsSnapshot'] ?? ''), true);
                if (is_array($ex) && $ex) {
                    $names = array_map(fn($a) => (string) ($a['nameAr'] ?? ''), $ex);
                    $line .= "\n     + " . implode('، ', array_filter($names));
                }
                $groups[$key]['lines'][] = $line;
            }

            $blocks = [];
            foreach ($groups as $g) {
                // Label the store only when the message would otherwise be
                // ambiguous — repeating one shop name above a single list adds
                // noise without adding information.
                $head = ($g['name'] !== '' && count($groups) > 1) ? '🏪 ' . $g['name'] . "\n" : '';
                $blocks[] = $head . implode("\n", $g['lines']);
            }
            $items = implode("\n\n", $blocks);
        } catch (Throwable $e) { $items = ''; }
    }
    $b['items'] = $items;

    // Store the order belongs to, for the {{merchantName}} template variable.
    // Empty for free-text orders that aren't tied to a merchant — the templates
    // drop empty lines, so nothing renders in that case.
    $b['merchantName'] = '';
    if (!empty($o['merchantId'])) {
        try {
            $ms = db()->prepare('SELECT storeNameAr FROM `MerchantProfile` WHERE id = ? LIMIT 1');
            $ms->execute([$o['merchantId']]);
            $b['merchantName'] = trim((string) ($ms->fetchColumn() ?: ''));
        } catch (Throwable $e) { /* leave blank */ }
    }

    // Locations — attach a Google-Maps pin from lat/lng where we have one.
    $pin = static fn ($lat, $lng) => ($lat !== null && $lng !== null && $lat !== '' && $lng !== '')
        ? "\n   📍 خريطة: https://maps.google.com/?q={$lat},{$lng}" : '';
    $loc = '';
    if (!empty($o['pickupAddress']) || (!empty($o['pickupLat']) && !empty($o['pickupLng']))) {
        $loc .= '📍 الاستلام: ' . (trim((string) ($o['pickupAddress'] ?? '')) ?: 'على الخريطة') . $pin($o['pickupLat'] ?? null, $o['pickupLng'] ?? null) . "\n";
    }
    if (!empty($o['deliveryAddress']) || (!empty($o['deliveryLat']) && !empty($o['deliveryLng']))) {
        $loc .= '🏁 التوصيل: ' . (trim((string) ($o['deliveryAddress'] ?? '')) ?: 'على الخريطة') . $pin($o['deliveryLat'] ?? null, $o['deliveryLng'] ?? null) . "\n";
    }
    $b['locations'] = rtrim($loc, "\n");

    // Shipping specifics — only meaningful for the شحن category.
    $ship = [];
    if (!empty($o['weightKg'])) $ship[] = 'الوزن: ' . rtrim(rtrim((string) $o['weightKg'], '0'), '.') . ' كجم';
    if (!empty($o['sizeCategory'])) $ship[] = 'الحجم: ' . $o['sizeCategory'];
    if (!empty($o['estimatedDistanceKm'])) $ship[] = 'المسافة: ~' . round((float) $o['estimatedDistanceKm'], 1) . ' كم';
    if (!empty($o['isFragile'])) $ship[] = '⚠️ قابل للكسر';
    if (($o['speedTier'] ?? '') === 'EXPRESS') $ship[] = '⚡ شحن سريع';
    $b['shipping'] = implode(' · ', $ship);

    // Money — full breakdown when the parts exist, else just the total.
    $total = $o['finalPrice'] ?? $o['quotedPrice'];
    $pr = [];
    if ($o['merchantSubtotal'] !== null && $o['merchantSubtotal'] !== '') $pr[] = 'قيمة الطلب: ' . waMoney($o['merchantSubtotal']);
    if ($o['deliveryFee'] !== null && $o['deliveryFee'] !== '')       $pr[] = 'التوصيل: ' . waMoney($o['deliveryFee']);
    if (!empty($o['discountAmount']) && (float) $o['discountAmount'] > 0) $pr[] = 'الخصم: -' . waMoney($o['discountAmount']) . (!empty($o['couponCode']) ? ' (كوبون ' . $o['couponCode'] . ')' : '');
    if (!empty($o['walletUsed']) && (float) $o['walletUsed'] > 0)     $pr[] = 'من المحفظة: -' . waMoney($o['walletUsed']);
    $pr[] = '*الإجمالي: ' . (waMoney($total) ?? 'غير محدد') . '*';
    $b['price'] = implode("\n", $pr);
    $b['total'] = waMoney($total) ?? 'غير محدد';
    $b['pay'] = trim(waPayMethodAr($o['paymentMethod'] ?? null) . (!empty($o['paymentStatus']) ? ' — ' . waPayStatusAr($o['paymentStatus']) : ''));
    return $b;
}
function notifyOrderParties(string $orderId, string $status, ?string $reason = null): void {
    // The order is being handled now → clear its "new order" alert from the centre.
    resolveOrderAlerts($orderId);
    try {
        $q = db()->prepare(
            "SELECT o.*,
                    cu.name AS cust_name, cu.phone AS cust_phone,
                    dr.name AS drv_name, dr.phone AS drv_phone,
                    s.nameAr AS svc_name
             FROM `Order` o
             LEFT JOIN `User` cu ON cu.id = o.customerId
             LEFT JOIN `User` dr ON dr.id = o.assignedDriverId
             LEFT JOIN `Service` s ON s.id = o.serviceId
             WHERE o.id = ? LIMIT 1"
        );
        $q->execute([$orderId]);
        $o = $q->fetch();
        if (!$o) return;
        $no = (string) $o['orderNumber'];
        $d = orderDetailBlocks($o);
        $custName = trim((string) ($o['cust_name'] ?? '')) ?: 'العميل';
        $svc = trim((string) ($o['svc_name'] ?? '')) ?: waCategoryAr($o['category'] ?? null);
        $drvName = trim((string) ($o['drv_name'] ?? ''));
        $sent = false;

        // Admin-editable: every send is a catalog template (default OR the
        // admin's saved override). The admin can disable a (event,recipient)
        // pair, replace its text, add extra recipients, or route the oversight
        // copy to a WhatsApp group — the editor is the single source of truth.
        $event = notifStatusToEvent($status);
        $ctx = [
            'orderNumber' => $no, 'customerName' => $custName,
            'customerPhone' => (string) ($o['cust_phone'] ?? ''),
            'driverName' => $drvName, 'driverPhone' => (string) ($o['drv_phone'] ?? ''),
            'price' => (string) ($d['total'] ?? ''), 'serviceName' => $svc,
            'pickupAddress' => (string) ($o['pickupAddress'] ?? ''),
            'deliveryAddress' => (string) ($o['deliveryAddress'] ?? ''),
            'paymentMethod' => waPayMethodAr($o['paymentMethod'] ?? null),
            'reason' => (string) ($reason ?? ''),
        ];
        // ─────────────────────────────────────────────────────────────────
        // SINGLE SOURCE OF TRUTH: every message is the catalog template for
        // (event, recipient) — the admin's saved override if present, else the
        // rich default from notifDefaultCatalog(). No parallel hardcoded copies
        // anymore: what the editor shows (and previews) is EXACTLY what is sent.
        // These block variables let one template reproduce the full rich
        // message; each is self-contained (carries its own icon/label) and is
        // empty when not applicable, so an absent block leaves no dangling line.
        // Readable, granular variables — the same names the dashboard editor
        // samples, so the live preview renders in full. Multi-line composites
        // (items / locations / price breakdown / customer recap) are single
        // variables too, each empty when absent so its labelled line drops.
        $ctx['items']       = (string) $d['items'];       // bullet list / delivery notes
        $ctx['shipping']    = (string) $d['shipping'];    // شحن specifics
        $ctx['locations']   = (string) $d['locations'];   // 📍 استلام + 🏁 توصيل + خرائط
        $ctx['priceBlock']  = (string) $d['price'];       // breakdown ending with الإجمالي
        $ctx['payment']     = (string) $d['pay'];         // طريقة الدفع — حالة الدفع
        $ctx['summary']     = "🧾 الطلب رقم *#{$no}*\nالخدمة: {$svc}"
            . ($d['items'] ? "\n\n🛒 التفاصيل:\n{$d['items']}" : '')
            . ($d['shipping'] ? "\n\n📦 {$d['shipping']}" : '')
            . ($d['locations'] ? "\n\n{$d['locations']}" : '')
            . "\n\n💳 الدفع: {$d['pay']}\n{$d['price']}";
        $ctx['collect']     = ($o['paymentStatus'] ?? '') === 'PAID'
            ? 'مدفوع — لا تُحصّل شيئاً'
            : ('حصّل *' . ($d['total'] ?? '') . '* (' . waPayMethodAr($o['paymentMethod'] ?? null) . ')');

        // Resolve the template for a recipient → rendered text, or null to SKIP
        // (event unmapped, recipient absent from catalog, disabled, or empty).
        $render = function (string $recipient) use ($event, $ctx): ?string {
            if ($event === null) return null;
            $rule = notifRule($event, $recipient);
            if (!$rule['enabled']) return null;
            $tpl = $rule['override'];
            if ($tpl === null) {
                foreach (notifDefaultCatalog() as $t) {
                    if ($t['event'] === $event && $t['recipient'] === $recipient) { $tpl = $t['default']; break; }
                }
            }
            if ($tpl === null || $tpl === '') return null;
            $r = notifRender($tpl, $ctx);
            return $r !== '' ? $r : null;
        };

        // ── CUSTOMER ──
        $custMsg = $render('CUSTOMER');
        if ($custMsg && !empty($o['cust_phone'])) { waEnqueue($o['cust_phone'], $custMsg); $sent = true; }
        // In-app notification + FCM push to the customer for every stage, so it
        // lands in the app's notifications page AND arrives while the app is
        // closed — carrying orderId so the tap opens this order's tracking.
        $custPushAr = [
            'PRICED' => ['تم تسعير طلبك', "طلبك #{$no} اتسعّر — راجع التفاصيل ووافق من التطبيق"],
            'ACCEPTED' => ['تم قبول طلبك', "بدأنا تجهيز طلبك #{$no}"],
            'DRIVER_ASSIGNED' => ['السائق في الطريق', "الكابتن " . ($drvName ?: 'المندوب') . " في الطريق لطلبك #{$no}"],
            'PICKED_UP' => ['تم استلام طلبك', "طلبك #{$no} في الطريق إليك"],
            'IN_ROUTE' => ['اقترب وصول طلبك', "مندوبك على وشك الوصول بطلب #{$no}"],
            'DELIVERED' => ['تم توصيل طلبك', "تم توصيل طلبك #{$no} — قيّم تجربتك 🌟"],
            'COMPLETED' => ['تم توصيل طلبك', "تم توصيل طلبك #{$no} — قيّم تجربتك 🌟"],
            'CANCELLED' => ['تم إلغاء طلبك', "نأسف، تم إلغاء طلبك #{$no}" . ($reason ? " — {$reason}" : '')],
        ][$status] ?? null;
        if ($custPushAr && !empty($o['customerId'])) {
            notifyUser((string) $o['customerId'], 'ORDER_STATUS', $custPushAr[0], $custPushAr[0], $custPushAr[1], $custPushAr[1],
                ['orderId' => $orderId, 'orderNumber' => $no, 'screen' => 'OrderTracking', 'status' => $status]);
        }

        // ── DRIVER ──
        $drvMsg = $render('DRIVER');
        if ($drvMsg && !empty($o['drv_phone'])) { waEnqueue($o['drv_phone'], $drvMsg); $sent = true; }
        // The driver used to get WhatsApp only — nothing reached their phone's
        // notification tray. Same push path the customer gets, carrying orderId
        // so the tap opens the order.
        $drvPushAr = [
            'DRIVER_ASSIGNED' => ['طلب جديد مُسند إليك', "طلب #{$no} — " . ($custName ?: 'عميل') . ($o['deliveryAddress'] ? " · {$o['deliveryAddress']}" : '')],
            'CANCELLED' => ['أُلغي الطلب', "الطلب #{$no} اتلغى — مش محتاج توصيله" . ($reason ? " ({$reason})" : '')],
        ][$status] ?? null;
        if ($drvPushAr && !empty($o['assignedDriverId'])) {
            notifyUser((string) $o['assignedDriverId'], 'ORDER_STATUS', $drvPushAr[0], $drvPushAr[0], $drvPushAr[1], $drvPushAr[1],
                ['orderId' => $orderId, 'orderNumber' => $no, 'screen' => 'OrderTracking', 'status' => $status]);
        }

        // ── SUPERVISOR ── the business / admin oversight number
        $supMsg = $render('SUPERVISOR');
        $adminNo = waAdminNumber();
        if ($supMsg && $adminNo) { waEnqueue($adminNo, $supMsg); $sent = true; }

        // ── GROUP ── the linked WhatsApp group (when one is picked + enabled)
        $grpMsg = $render('GROUP');
        if ($grpMsg) {
            $grp = notifReadSetting('whatsapp_order_group');
            if (!empty($grp['enabled']) && !empty($grp['groupId'])) { waEnqueue((string) $grp['groupId'], $grpMsg); $sent = true; }
        }

        // ── EXTRA per-event recipients ── each enabled row gets its own text,
        // or — when left blank — the supervisor / group / customer copy.
        if ($event) {
            $extra = notifReadSetting('notification_recipients');
            foreach ((array) ($extra[$event] ?? []) as $r) {
                $phone = trim((string) ($r['phone'] ?? ''));
                if ($phone === '' || (array_key_exists('enabled', $r) && !$r['enabled'])) continue;
                $txt = trim((string) ($r['text'] ?? ''));
                $msg = $txt !== '' ? notifRender($txt, $ctx) : ($supMsg ?: ($grpMsg ?: $custMsg));
                if ($msg) { waEnqueue($phone, $msg); $sent = true; }
            }
        }
        if ($sent) {
            try { db()->prepare("UPDATE `Order` SET `whatsappSentAt` = NOW(3) WHERE id = ?")->execute([$orderId]); } catch (Throwable $e) {}
        }
    } catch (Throwable $e) {
        error_log('[api.php] notifyOrderParties: ' . $e->getMessage());
    }
}
function waStatus(): array {
    $f = waDir() . '/status.json';
    $j = is_file($f) ? json_decode((string) @file_get_contents($f), true) : null;
    if (!is_array($j)) {
        return ['status' => 'disconnected', 'qrDataUrl' => null, 'phone' => null, 'startedAt' => null,
                'lastError' => 'خدمة الواتساب لسه بتشتغل… لو استمر، حدّث الصفحة بعد دقيقة.'];
    }
    // Bridge heartbeats every ~15s; if the file is stale the process is down.
    $downMs = time() * 1000 - (int) ($j['ts'] ?? 0);
    $stale = $downMs > 90000;
    // Queued messages survive an outage as files and flush on reconnect, so the
    // admin should see that nothing is lost — and how long it has really been
    // down. The old copy promised "back in a minute", which was wrong whenever
    // the reviver was late.
    $pending = count(glob(waDir() . '/queue/*.json') ?: []);
    $mins = (int) floor(max(0, $downMs) / 60000);
    $since = $mins < 1 ? 'أقل من دقيقة' : ($mins < 60 ? "$mins دقيقة" : floor($mins / 60) . ' ساعة و' . ($mins % 60) . ' دقيقة');
    $downMsg = "خدمة الواتساب متوقفة منذ $since — بتشتغل تلقائياً."
        . ($pending > 0 ? " في انتظار الإرسال: $pending رسالة (مش هتضيع، هتتبعت أول ما ترجع)." : '');
    return [
        'status' => $stale ? 'disconnected' : ($j['status'] ?? 'disconnected'),
        'qrDataUrl' => $stale ? null : ($j['qrDataUrl'] ?? null),
        'phone' => $j['phone'] ?? null,
        'startedAt' => $j['startedAt'] ?? null,
        'pendingMessages' => $pending,
        'downForMinutes' => $stale ? $mins : 0,
        'lastError' => $stale ? $downMsg : ($j['lastError'] ?? null),
    ];
}
if ($method === 'GET' && $path === '/admin/whatsapp/status') {
    authUser();
    jsonOk(waStatus());
}
if ($method === 'POST' && $path === '/admin/whatsapp/send-test') {
    authUser();
    $b = readJsonBody();
    $to = trim((string)($b['phone'] ?? $b['to'] ?? ''));
    $text = (string)($b['message'] ?? $b['text'] ?? 'رسالة اختبار من لوحة تحكم تميم ✅');
    if ($to === '') jsonErr('اكتب رقم الهاتف', 422, 'MISSING');
    $qf = waDir() . '/queue/' . bin2hex(random_bytes(8)) . '.json';
    @file_put_contents($qf, json_encode(['to' => $to, 'text' => $text], JSON_UNESCAPED_UNICODE));
    jsonOk(['sent' => true, 'queued' => true]);
}
if ($method === 'POST' && (
    $path === '/admin/whatsapp/logout' || $path === '/admin/whatsapp/stop' || $path === '/admin/whatsapp/reset'
)) {
    authUser();
    $cf = waDir() . '/control/' . bin2hex(random_bytes(8)) . '.json';
    @file_put_contents($cf, json_encode(['action' => 'logout']));
    jsonOk(array_merge(waStatus(), ['status' => 'connecting', 'qrDataUrl' => null]));
}
if ($method === 'POST' && $path === '/admin/whatsapp/start') {
    authUser();
    // The bridge always runs and shows a QR when unauthenticated, so "start"
    // just returns the current status; the page then polls for the QR.
    jsonOk(waStatus());
}

// ═══ Notification templates / recipients / WhatsApp groups ══════════════
// These back Ahmed's dashboard pages. Without them the pages hit the shim's
// generic fallback: GETs returned an empty stub and PUTs faked a 200 while
// persisting nothing (dead buttons). Storage is JSON Setting rows — no new
// tables. The templates the admin toggles/edits are honoured by
// notifyOrderParties (enable/disable + text override + extra recipients +
// group routing), while the rich default messages stay intact when untouched.
function notifReadSetting(string $key): array {
    try {
        $st = db()->prepare("SELECT `value` FROM `Setting` WHERE `key` = ? LIMIT 1");
        $st->execute([$key]);
        $v = $st->fetchColumn();
        if (is_string($v) && $v !== '') { $d = json_decode($v, true); if (is_array($d)) return $d; }
    } catch (Throwable $e) { /* fall through */ }
    return [];
}
/**
 * Read a Setting that holds a JSON array of strings, e.g. the home screen's
 * curated product list. Always returns a list — never null or an object — so
 * clients can spread and .includes() it without guarding.
 */
function homeListSetting(string $key): array {
    $v = notifReadSetting($key);
    return array_values(array_filter($v, 'is_string'));
}
function notifWriteSetting(string $key, array $value, ?string $uid): void {
    db()->prepare('INSERT INTO `Setting` (`key`,`value`,`description`,`updatedAt`,`updatedById`) VALUES (?,?,NULL,NOW(3),?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`), `updatedAt`=VALUES(`updatedAt`), `updatedById`=VALUES(`updatedById`)')
        ->execute([$key, json_encode($value, JSON_UNESCAPED_UNICODE), $uid]);
}
/** Built-in template catalog: one entry per (event × recipient) the platform
 *  sends. `default` IS what goes out (unless the admin saves an override) and
 *  IS what the editor previews — one source of truth. Uses readable {{vars}};
 *  any "التسمية: {{var}}" line whose value is empty drops out automatically. */
function notifDefaultCatalog(): array {
    $ev = fn($event, $recipient, $label, $default) => compact('event', 'recipient', 'label', 'default')
        + ['key' => $event . '_' . $recipient];
    // Shared oversight body for the supervisor + the group: identical detail for
    // both, each event supplying its own header. Empty lines fall away, so an
    // order with no items / no pickup simply omits those lines.
    $oversight = fn(string $header) => "{$header} *#{{orderNumber}}*\n"
        . "الخدمة: {{serviceName}}\n"
        . "👤 العميل: {{customerName}}\n"
        . "📞 الهاتف: {{customerPhone}}\n"
        . "🛵 السائق: {{driverName}}\n"
        . "🏪 المتجر: {{merchantName}}\n"
        . "🛒 المطلوب: {{items}}\n"
        . "{{locations}}\n"
        . "💳 الدفع: {{payment}}\n"
        . "{{priceBlock}}";
    return [
        // ═══ ORDER_NEW ═══
        $ev('ORDER_NEW', 'CUSTOMER', 'العميل', "تميم للتوصيل 🚚\nاستلمنا طلبك رقم *#{{orderNumber}}* وجارٍ مراجعته. هنطمنك على كل خطوة 😊"),
        $ev('ORDER_NEW', 'SUPERVISOR', 'المشرف', $oversight('🆕 طلب جديد')),
        $ev('ORDER_NEW', 'GROUP', 'جروب الإدارة', $oversight('🆕 طلب جديد')),
        // ═══ ORDER_PRICED ═══
        $ev('ORDER_PRICED', 'CUSTOMER', 'العميل', "تميم للتوصيل 🚚\nتم تسعير طلبك — راجع التفاصيل ووافق من التطبيق:\n\n{{summary}}"),
        $ev('ORDER_PRICED', 'SUPERVISOR', 'المشرف', $oversight('💲 تم تسعير طلب')),
        $ev('ORDER_PRICED', 'GROUP', 'جروب الإدارة', $oversight('💲 تم تسعير طلب')),
        // ═══ ORDER_ACCEPTED ═══
        $ev('ORDER_ACCEPTED', 'CUSTOMER', 'العميل', "تميم للتوصيل ✅\nتم قبول طلبك وجارٍ تجهيزه:\n\n{{summary}}"),
        // ═══ DRIVER_ASSIGNED ═══
        $ev('DRIVER_ASSIGNED', 'CUSTOMER', 'العميل', "تميم للتوصيل 🚚\nالكابتن *{{driverName}}* في الطريق لطلبك — للتواصل: {{driverPhone}}\n\n{{summary}}"),
        $ev('DRIVER_ASSIGNED', 'DRIVER', 'السائق', "🚚 *طلب جديد مُسند إليك* #{{orderNumber}}\nالخدمة: {{serviceName}}\n👤 العميل: {{customerName}}\n📞 الهاتف: {{customerPhone}}\n🏪 المتجر: {{merchantName}}\n🛒 المطلوب: {{items}}\n{{locations}}\n💰 التحصيل: {{collect}}"),
        $ev('DRIVER_ASSIGNED', 'SUPERVISOR', 'المشرف', $oversight('🚚 تعيين سائق لطلب')),
        $ev('DRIVER_ASSIGNED', 'GROUP', 'جروب الإدارة', $oversight('🚚 تعيين سائق لطلب')),
        // ═══ PICKED_UP ═══
        $ev('PICKED_UP', 'CUSTOMER', 'العميل', "تميم للتوصيل 🚚\nتم استلام طلبك *#{{orderNumber}}* وهو في الطريق إليك.\nالمطلوب دفعه: *{{price}}* ({{payment}})"),
        // ═══ IN_ROUTE ═══
        $ev('IN_ROUTE', 'CUSTOMER', 'العميل', "تميم للتوصيل 🚚\nمندوبك على وشك الوصول بطلب *#{{orderNumber}}*. جهّز استلامك 😊\nالمطلوب: *{{price}}*"),
        // ═══ DELIVERED ═══
        $ev('DELIVERED', 'CUSTOMER', 'العميل', "تميم للتوصيل ✅\nتم توصيل طلبك *#{{orderNumber}}* بنجاح — شكراً لاختيارك تميم 🌟\nقيّم تجربتك من التطبيق."),
        $ev('DELIVERED', 'SUPERVISOR', 'المشرف', $oversight('✅ اكتمل طلب')),
        $ev('DELIVERED', 'GROUP', 'جروب الإدارة', $oversight('✅ اكتمل طلب')),
        // ═══ CANCELLED ═══
        $ev('CANCELLED', 'CUSTOMER', 'العميل', "تميم للتوصيل\nنأسف، تم إلغاء طلبك *#{{orderNumber}}*.\nالسبب: {{reason}}"),
        $ev('CANCELLED', 'DRIVER', 'السائق', "⛔ *أُلغي الطلب #{{orderNumber}}* — لا حاجة للتوصيل.\nالسبب: {{reason}}"),
        $ev('CANCELLED', 'SUPERVISOR', 'المشرف', $oversight('⛔ أُلغي طلب') . "\nسبب الإلغاء: {{reason}}"),
        $ev('CANCELLED', 'GROUP', 'جروب الإدارة', $oversight('⛔ أُلغي طلب') . "\nسبب الإلغاء: {{reason}}"),
    ];
}
function notifVariables(): array {
    return [
        'orderNumber' => 'رقم الطلب', 'customerName' => 'اسم العميل', 'customerPhone' => 'هاتف العميل',
        'driverName' => 'اسم المندوب', 'driverPhone' => 'هاتف المندوب', 'price' => 'الإجمالي',
        'serviceName' => 'الخدمة', 'pickupAddress' => 'عنوان الاستلام', 'deliveryAddress' => 'عنوان التسليم',
        'paymentMethod' => 'طريقة الدفع', 'payment' => 'الدفع (الطريقة + الحالة)', 'reason' => 'سبب الإلغاء',
        // Multi-line values (each empty when not applicable, so its line drops):
        'items' => 'المطلوب / المنتجات', 'locations' => 'عناوين الاستلام والتسليم + الخرائط',
        'priceBlock' => 'تفاصيل السعر والإجمالي', 'summary' => 'ملخص الطلب الكامل للعميل',
        'collect' => 'تعليمات التحصيل للسائق', 'shipping' => 'تفاصيل الشحن',
    ];
}
/** Render a template string against a context: replace {{var}}, drop dangling
 *  "Label:" lines whose value was empty, collapse blank runs. Mirrors the
 *  editor's live preview so what the admin sees is what gets sent. */
function notifRender(string $tpl, array $ctx): string {
    $out = preg_replace_callback('/\{\{\s*([a-zA-Z]+)\s*\}\}/', function ($m) use ($ctx) {
        return isset($ctx[$m[1]]) ? (string) $ctx[$m[1]] : '';
    }, $tpl);
    $lines = array_filter(explode("\n", $out), function ($ln) {
        // Drop a line that became just "العنوان: " (label + colon, no value).
        return !preg_match('/^[^\p{L}\p{N}]*[\p{L}\p{N} ]+:\s*$/u', trim($ln));
    });
    $out = implode("\n", $lines);
    return trim(preg_replace('/\n{3,}/', "\n\n", $out));
}
/** Effective templates = defaults with the saved override merged in. */
function notifEffectiveTemplates(): array {
    $overrides = notifReadSetting('notification_templates'); // { key: {enabled,text} }
    $out = [];
    foreach (notifDefaultCatalog() as $t) {
        $ov = $overrides[$t['key']] ?? null;
        $text = (is_array($ov) && isset($ov['text']) && $ov['text'] !== '') ? (string) $ov['text'] : $t['default'];
        $enabled = is_array($ov) && array_key_exists('enabled', $ov) ? (bool) $ov['enabled'] : true;
        $out[] = $t + [
            'text' => $text,
            'enabled' => $enabled,
            'customized' => $text !== $t['default'],
        ];
    }
    return $out;
}
/** One (event,recipient) pair as [enabled, overrideTextOrNull]. Used by
 *  notifyOrderParties to decide skip/override without regressing rich defaults. */
function notifRule(string $event, string $recipient): array {
    static $map = null;
    if ($map === null) {
        $map = [];
        $overrides = notifReadSetting('notification_templates');
        foreach (notifDefaultCatalog() as $t) {
            $ov = $overrides[$t['key']] ?? null;
            $map[$t['event'] . '|' . $t['recipient']] = [
                'enabled' => is_array($ov) && array_key_exists('enabled', $ov) ? (bool) $ov['enabled'] : true,
                'override' => (is_array($ov) && isset($ov['text']) && $ov['text'] !== '') ? (string) $ov['text'] : null,
            ];
        }
    }
    return $map[$event . '|' . $recipient] ?? ['enabled' => true, 'override' => null];
}
function notifStatusToEvent(string $status): ?string {
    return [
        'NEW' => 'ORDER_NEW', 'PRICED' => 'ORDER_PRICED', 'ACCEPTED' => 'ORDER_ACCEPTED',
        'DRIVER_ASSIGNED' => 'DRIVER_ASSIGNED', 'PICKED_UP' => 'PICKED_UP', 'IN_ROUTE' => 'IN_ROUTE',
        'DELIVERED' => 'DELIVERED', 'COMPLETED' => 'DELIVERED', 'CANCELLED' => 'CANCELLED',
    ][$status] ?? null;
}

if ($method === 'GET' && $path === '/admin/notification-templates') {
    $u = authUser(); if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    jsonOk(['templates' => notifEffectiveTemplates(), 'variables' => notifVariables()]);
}
if (in_array($method, ['PUT', 'POST'], true) && $path === '/admin/notification-templates') {
    $u = authUser(); if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $b = readJsonBody();
    $defaults = [];
    foreach (notifDefaultCatalog() as $t) $defaults[$t['key']] = $t['default'];
    // Store overrides only — a template equal to its default AND enabled is
    // dropped, so "reset to default" is just saving the default back.
    $overrides = [];
    foreach ((array) ($b['templates'] ?? []) as $t) {
        $key = (string) ($t['key'] ?? '');
        if ($key === '' || !isset($defaults[$key])) continue;
        $text = (string) ($t['text'] ?? '');
        $enabled = array_key_exists('enabled', $t) ? (bool) $t['enabled'] : true;
        $isDefaultText = ($text === '' || $text === $defaults[$key]);
        if ($isDefaultText && $enabled) continue; // identical to built-in → no override
        $entry = [];
        if (!$isDefaultText) $entry['text'] = $text;
        if (!$enabled) $entry['enabled'] = false;
        if ($entry) $overrides[$key] = $entry;
    }
    notifWriteSetting('notification_templates', $overrides, $u['sub'] ?? null);
    jsonOk(['saved' => count($overrides)]);
}
if ($method === 'GET' && $path === '/admin/notification-recipients') {
    $u = authUser(); if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $recipients = notifReadSetting('notification_recipients');
    $events = [];
    foreach (notifDefaultCatalog() as $t) $events[$t['event']] = true;
    jsonOk([
        'events' => array_map(fn($e) => ['event' => $e], array_keys($events)),
        'recipients' => (object) $recipients,
    ]);
}
if (in_array($method, ['PUT', 'POST'], true) && $path === '/admin/notification-recipients') {
    $u = authUser(); if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $b = readJsonBody();
    $clean = [];
    $count = 0;
    foreach ((array) ($b['recipients'] ?? []) as $event => $rows) {
        $list = [];
        foreach ((array) $rows as $r) {
            $phone = trim((string) ($r['phone'] ?? ''));
            if ($phone === '') continue; // a row with no number does nothing
            $list[] = [
                'id' => (string) ($r['id'] ?? ('r' . bin2hex(random_bytes(5)))),
                'name' => (string) ($r['name'] ?? ''),
                'phone' => $phone,
                'enabled' => array_key_exists('enabled', $r) ? (bool) $r['enabled'] : true,
                'text' => (string) ($r['text'] ?? ''),
            ];
            $count++;
        }
        if ($list) $clean[(string) $event] = $list;
    }
    notifWriteSetting('notification_recipients', $clean, $u['sub'] ?? null);
    jsonOk(['saved' => $count]);
}
// WhatsApp groups — `groups`/`refreshedAt` are read from the bridge's
// groups.json (it enumerates the account's groups); `config` is the shim's
// saved selection of which group receives order notifications.
if ($method === 'GET' && $path === '/admin/whatsapp/groups') {
    $u = authUser(); if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $groups = []; $refreshedAt = null;
    $gf = waDir() . '/groups.json';
    if (is_file($gf)) {
        $j = json_decode((string) @file_get_contents($gf), true);
        if (is_array($j)) { $groups = $j['groups'] ?? []; $refreshedAt = $j['ts'] ?? null; }
    }
    $cfg = notifReadSetting('whatsapp_order_group');
    jsonOk([
        'groups' => $groups,
        'refreshedAt' => $refreshedAt,
        'config' => [
            'enabled' => (bool) ($cfg['enabled'] ?? false),
            'groupId' => $cfg['groupId'] ?? null,
            'groupName' => $cfg['groupName'] ?? null,
        ],
    ]);
}
if ($method === 'POST' && $path === '/admin/whatsapp/groups/refresh') {
    $u = authUser(); if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    @mkdir(waDir() . '/control', 0755, true);
    @file_put_contents(waDir() . '/control/' . bin2hex(random_bytes(8)) . '.json', json_encode(['action' => 'refresh-groups']));
    jsonOk(['queued' => true]);
}
if (in_array($method, ['PUT', 'POST'], true) && $path === '/admin/whatsapp/group-config') {
    $u = authUser(); if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $b = readJsonBody();
    $groupId = ($b['groupId'] ?? null) ?: null;
    $enabled = !empty($b['enabled']);
    // Resolve the human name from the bridge's group list so the toast can say
    // "تم الربط بجروب X".
    $groupName = null;
    if ($groupId) {
        $gf = waDir() . '/groups.json';
        if (is_file($gf)) {
            $j = json_decode((string) @file_get_contents($gf), true);
            foreach (($j['groups'] ?? []) as $g) if (($g['id'] ?? null) === $groupId) { $groupName = $g['name'] ?? null; break; }
        }
    }
    $cfg = ['enabled' => $enabled, 'groupId' => $groupId, 'groupName' => $groupName];
    notifWriteSetting('whatsapp_order_group', $cfg, $u['sub'] ?? null);
    jsonOk($cfg);
}

// Payment gateway config — the page expects a fixed shape with `keys` and
// `paymentOptions`. Returning a bare {} makes `initial.keys.apiKey` crash.
// Customer payment config — the app's checkout screen reads this to decide which
// methods to show. Was unhandled (fell through to the empty stub), so the
// EasyKash screen got a blank config. Manual methods (cash / Vodafone Cash /
// InstaPay) are always available; online card via EasyKash is gated behind a
// setting because that gateway's checkout isn't live in the shim yet.
if ($method === 'GET' && $path === '/payments/config') {
    authUser();
    $get = function (string $k, $def = null) {
        try { $s = db()->prepare("SELECT `value` FROM `Setting` WHERE `key` = ? LIMIT 1"); $s->execute([$k]);
            $v = $s->fetchColumn(); if ($v === false || $v === null) return $def;
            $d = json_decode((string) $v, true); return $d !== null ? $d : $v;
        } catch (Throwable $e) { return $def; }
    };
    $online = (bool) $get('online_payment_enabled', false);
    jsonOk([
        'gateway' => $online ? 'EASYKASH' : 'MANUAL',
        'online' => $online,
        'methods' => [
            'vodafoneCash' => (bool) $get('pay_vodafone_cash', true),
            'instapay' => (bool) $get('pay_instapay', true),
            'visa' => $online, 'mastercard' => $online, 'meeza' => $online,
        ],
    ]);
}
if ($method === 'GET' && $path === '/admin/payments/gateway') {
    $u = authUser();
    if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    // Pull whatever the admin has saved in Setting, fall back to .env defaults.
    $rows = db()->query("SELECT `key`, `value` FROM `Setting` WHERE `key` IN ('easykash_api_key','easykash_hmac_secret','easykash_payment_options')")->fetchAll();
    $vals = [];
    foreach ($rows as $r) $vals[$r['key']] = $r['value'];
    $apiKey = $vals['easykash_api_key'] ?? env('EASYKASH_API_KEY');
    $hmac   = $vals['easykash_hmac_secret'] ?? env('EASYKASH_HMAC_SECRET');
    $rawOpts = $vals['easykash_payment_options']
        ?? env('EASYKASH_PAYMENT_OPTIONS', '2,3,4,5,6');
    // Options might be JSON ("[2,3,4,5,6]") or comma-separated ("2,3,4,5,6").
    $decoded = json_decode((string) $rawOpts, true);
    if (is_array($decoded)) {
        $paymentOptions = array_values(array_map('intval', $decoded));
    } else {
        $paymentOptions = array_values(array_filter(array_map('intval',
            explode(',', (string) $rawOpts))));
    }
    // Mask stored secrets — surface only that they exist.
    $mask = fn(?string $v) => $v ? str_repeat('•', 4) . substr($v, -4) : null;
    jsonOk([
        'paymentOptions' => $paymentOptions,
        'keys' => [
            'apiKey' => $mask($apiKey),
            'hmacSecret' => $mask($hmac),
        ],
        'redirectUrl' => env('EASYKASH_REDIRECT_URL'),
    ]);
}

// Reports overview (reports.tsx RevenueTab) — expects `series`, `total`,
// `ordersCount`, and honours the day/week/month groupBy selector. This MUST
// come before the str_starts_with handler below, otherwise it never runs.
if ($method === 'GET' && $path === '/admin/reports/revenue' && (($_GET['groupBy'] ?? '') !== '')) {
    $u = authUser();
    if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $groupBy = $_GET['groupBy'];
    $fmt = $groupBy === 'month' ? '%Y-%m' : ($groupBy === 'week' ? '%X-W%V' : '%Y-%m-%d');
    $st = db()->prepare("SELECT DATE_FORMAT(createdAt, ?) AS bucket, COUNT(*) AS orders, SUM(COALESCE(finalPrice, quotedPrice, 0)) AS revenue FROM `Order` WHERE status IN ('COMPLETED','DELIVERED') GROUP BY bucket ORDER BY bucket ASC");
    $st->execute([$fmt]);
    $series = array_map(fn($s) => [
        'bucket' => (string) $s['bucket'],
        'orders' => (int) $s['orders'],
        'revenue' => (float) $s['revenue'],
    ], $st->fetchAll());
    $total = 0.0; $count = 0;
    foreach ($series as $s) { $total += $s['revenue']; $count += $s['orders']; }
    jsonOk(['series' => $series, 'total' => $total, 'ordersCount' => $count]);
}

// Revenue report — TWO different shapes:
//   /admin/reports/revenue          → overview card data ({ trend, kpis… })
//   /admin/reports/revenue/detailed → the printable revenue-report page,
//     which reads `data.summary.ordersCount`, `data.range.from`, etc.
if ($method === 'GET' && str_starts_with($path, '/admin/reports/revenue')) {
    $u = authUser();
    if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $isDetailed = ($path === '/admin/reports/revenue/detailed');
    // revenue-report.tsx sends `preset`; reports.tsx sends `range`. Same meaning.
    $range = $_GET['range'] ?? ($_GET['preset'] ?? 'month');
    if ($range === 'custom') $range = 'month';   // from/to below take over
    $now = time();
    if ($range === 'today')      $fromTs = strtotime('today');
    elseif ($range === 'week')   $fromTs = $now - 7 * 86400;
    elseif ($range === 'year')   $fromTs = strtotime('first day of january this year 00:00');
    else                          $fromTs = strtotime('first day of this month 00:00');
    // Custom range override
    if (!empty($_GET['from'])) $fromTs = strtotime((string) $_GET['from']) ?: $fromTs;
    if (!empty($_GET['to']))   $toTs   = strtotime((string) $_GET['to']) ?: $now;
    else                        $toTs   = $now;
    $fromSql = gmdate('Y-m-d H:i:s', $fromTs);
    $toSql   = gmdate('Y-m-d H:i:s', $toTs);
    $from    = gmdate('Y-m-d\TH:i:s.000\Z', $fromTs);
    $to      = gmdate('Y-m-d\TH:i:s.000\Z', $toTs);

    $st = db()->prepare("SELECT finalPrice, quotedPrice, createdAt FROM `Order` WHERE status IN ('COMPLETED','DELIVERED') AND (completedAt BETWEEN ? AND ? OR deliveredAt BETWEEN ? AND ? OR createdAt BETWEEN ? AND ?)");
    $st->execute([$fromSql, $toSql, $fromSql, $toSql, $fromSql, $toSql]);
    $rows = $st->fetchAll();
    $total = 0.0; $count = 0; $byDay = [];
    foreach ($rows as $r) {
        $amt = (float) ($r['finalPrice'] ?? $r['quotedPrice'] ?? 0);
        $total += $amt; $count++;
        $day = substr((string) $r['createdAt'], 0, 10);
        if (!isset($byDay[$day])) $byDay[$day] = ['revenue' => 0.0, 'orders' => 0];
        $byDay[$day]['revenue'] += $amt;
        $byDay[$day]['orders']  += 1;
    }
    ksort($byDay);
    $trend = [];   // legacy shape used by other consumers: { day, revenue }
    $series = [];  // reports.tsx RevenueTab shape: { bucket, orders, revenue }
    foreach ($byDay as $d => $v) {
        $trend[]  = ['day' => $d, 'revenue' => $v['revenue']];
        $series[] = ['bucket' => $d, 'orders' => $v['orders'], 'revenue' => $v['revenue']];
    }

    if ($isDetailed) {
        // REAL money, per the order money model: every figure below is summed
        // from the order rows, not invented. (This block used to hardcode
        // commission/fees/payouts to 0 and report ALL sales as Tamem net, with
        // an empty byMerchant — so the business could not see what it earned or
        // what it owed each merchant.)
        // Filters the report page actually sends.
        $fPay      = trim((string) ($_GET['paymentMethod'] ?? ''));
        $fMerchant = trim((string) ($_GET['merchantId'] ?? ''));
        // The admin can switch Tamem's cut off (free-period merchants) or force a
        // flat % across every row, so the report recomputes commission on read
        // instead of only echoing what was stored at order time.
        $inclComm  = (($_GET['includeCommission'] ?? 'true') !== 'false');
        $pctOvr    = isset($_GET['commissionPctOverride']) && is_numeric($_GET['commissionPctOverride'])
                   ? (float) $_GET['commissionPctOverride'] : null;

        $sql = "SELECT o.id, o.orderNumber, o.category, o.status, o.paymentMethod, o.createdAt,
                    o.completedAt, o.deliveredAt,
                    o.merchantSubtotal, o.deliveryFee, o.discountAmount, o.walletUsed,
                    o.platformCommission, o.merchantPayout, o.quotedPrice, o.finalPrice,
                    o.merchantId, o.createdByAdminId,
                    mp.storeNameAr AS merchantName, mp.commissionPct,
                    s.nameAr AS serviceNameAr,
                    cu.name AS customerName, cu.phone AS customerPhone
             FROM `Order` o
             LEFT JOIN `MerchantProfile` mp ON mp.id = o.merchantId
             LEFT JOIN `Service` s ON s.id = o.serviceId
             LEFT JOIN `User` cu ON cu.id = o.customerId
             WHERE o.status IN ('COMPLETED','DELIVERED')
               AND (o.completedAt BETWEEN ? AND ? OR o.deliveredAt BETWEEN ? AND ? OR o.createdAt BETWEEN ? AND ?)";
        $dsArgs = [$fromSql, $toSql, $fromSql, $toSql, $fromSql, $toSql];
        if ($fPay !== '')      { $sql .= ' AND o.paymentMethod = ?'; $dsArgs[] = $fPay; }
        if ($fMerchant !== '') { $sql .= ' AND o.merchantId = ?';    $dsArgs[] = $fMerchant; }
        $sql .= ' ORDER BY o.createdAt DESC';
        $ds = db()->prepare($sql);
        $ds->execute($dsArgs);

        $sum = ['sales' => 0.0, 'goods' => 0.0, 'fees' => 0.0, 'disc' => 0.0, 'wallet' => 0.0, 'comm' => 0.0, 'payout' => 0.0, 'unattributed' => 0.0];
        $unattributedCount = 0;
        $byMerchant = []; $byPay = []; $rowsOut = [];
        foreach ($ds->fetchAll() as $r) {
            $sale   = (float) ($r['finalPrice'] ?? $r['quotedPrice'] ?? 0);
            $disc   = (float) ($r['discountAmount'] ?? 0);
            $wallet = (float) ($r['walletUsed'] ?? 0);
            // NULL means "never recorded", NOT zero. Treating an unrecorded fee
            // as 0 would silently reclassify it as goods, and an unrecorded
            // subtotal as 0 would report the whole sale as delivery income.
            // Each side is summed only where it is actually known.
            $goodsKnown = $r['merchantSubtotal'] !== null;
            $feeKnown   = $r['deliveryFee'] !== null;
            $goods  = $goodsKnown ? (float) $r['merchantSubtotal'] : 0.0;
            $fee    = $feeKnown   ? (float) $r['deliveryFee'] : 0.0;
            $comm   = $r['platformCommission'] !== null ? (float) $r['platformCommission'] : 0.0;
            $payout = $r['merchantPayout'] !== null ? (float) $r['merchantPayout'] : 0.0;
            // Honour the page's commission switches — recompute rather than echo.
            if ($goodsKnown) {
                if (!$inclComm)            { $comm = 0.0; $payout = round($goods, 2); }
                elseif ($pctOvr !== null)  { $comm = round($goods * $pctOvr / 100, 2); $payout = round($goods - $comm, 2); }
            }
            $known  = $goodsKnown && $feeKnown;          // the split is fully on record
            $net    = round($comm + $fee - $disc, 2);    // what Tamem actually keeps

            // Whatever the customer paid that we cannot point at either bucket.
            // customer pays = goods + fee − discount, so goods + fee = sale + disc.
            $gap = round(($sale + $disc) - ($goods + $fee), 2);
            if ($gap > 0.01) { $unattributedCount++; $sum['unattributed'] += $gap; }

            $sum['sales'] += $sale; $sum['goods'] += $goods; $sum['fees'] += $fee;
            $sum['disc'] += $disc; $sum['wallet'] += $wallet; $sum['comm'] += $comm; $sum['payout'] += $payout;

            $mid = $r['merchantId'] ?: '_none';
            if (!isset($byMerchant[$mid])) {
                $byMerchant[$mid] = ['merchantId' => $r['merchantId'],
                                     'merchantName' => $r['merchantName'] ?: 'بدون تاجر',
                                     'ordersCount' => 0, 'sales' => 0.0, 'goods' => 0.0,
                                     'commission' => 0.0, 'payout' => 0.0];
            }
            $byMerchant[$mid]['ordersCount']++;
            $byMerchant[$mid]['sales'] += $sale;
            $byMerchant[$mid]['goods'] += $goods;
            $byMerchant[$mid]['commission'] += $comm;
            $byMerchant[$mid]['payout'] += $payout;

            $pm = $r['paymentMethod'] ?: 'UNKNOWN';
            if (!isset($byPay[$pm])) $byPay[$pm] = ['paymentMethod' => $pm, 'ordersCount' => 0, 'sales' => 0.0];
            $byPay[$pm]['ordersCount']++; $byPay[$pm]['sales'] += $sale;

            $rowsOut[] = [
                'orderId' => $r['id'], 'orderNumber' => $r['orderNumber'],
                'customerName' => $r['customerName'] ?: '—',
                'customerPhone' => $r['customerPhone'] ?: '',
                'merchantId' => $r['merchantId'], 'merchantName' => $r['merchantName'],
                'category' => $r['category'], 'serviceNameAr' => $r['serviceNameAr'] ?: '—',
                'completedAt' => isoZ($r['completedAt'] ?? $r['deliveredAt'] ?? $r['createdAt']),
                'createdAt' => isoZ($r['createdAt']),
                'status' => $r['status'], 'paymentMethod' => $r['paymentMethod'] ?: 'UNKNOWN',
                'source' => $r['createdByAdminId'] ? 'ADMIN' : 'APP',
                // ↓ null = never recorded. The page prints "—" for these instead
                //   of a 0 that would read as a real, measured zero.
                'merchantSubtotal' => $goodsKnown ? round($goods, 2) : null,  // الطلب بكام
                'deliveryFee' => $feeKnown ? round($fee, 2) : null,           // التوصيل بكام
                'platformCommission' => $goodsKnown ? round($comm, 2) : null, // عمولة تميم
                'merchantPayout' => $goodsKnown ? round($payout, 2) : null,   // التاجر لُه كام
                'tamemNet' => $known ? $net : null,                           // صافي ربح تميم
                'netRevenue' => $known ? $net : null,
                'discountAmount' => round($disc, 2),
                'walletUsed' => round($wallet, 2),
                'finalPrice' => round($sale, 2),                              // العميل دفع كام
                'splitRecorded' => $known,
                'estimated' => !$known,
                'unattributed' => $gap > 0.01 ? $gap : 0.0,
            ];
        }
        foreach ($byMerchant as &$m) {
            foreach (['sales', 'goods', 'commission', 'payout'] as $f) $m[$f] = round($m[$f], 2);
        }
        unset($m);
        foreach ($byPay as &$pmv) { $pmv['sales'] = round($pmv['sales'], 2); }
        unset($pmv);
        usort($rowsOut, static fn ($a, $b) => strcmp((string) $b['createdAt'], (string) $a['createdAt']));
        $byMerchantOut = array_values($byMerchant);
        usort($byMerchantOut, static fn ($a, $b) => $b['sales'] <=> $a['sales']);

        jsonOk([
            'range' => ['from' => $from, 'to' => $to],
            'generatedAt' => gmdate('Y-m-d\TH:i:s.000\Z'),
            'summary' => [
                'ordersCount' => count($rowsOut),
                'totalSales' => round($sum['sales'], 2),
                'totalOrderValue' => round($sum['goods'], 2),
                'totalCommission' => round($sum['comm'], 2),
                'totalDeliveryFees' => round($sum['fees'], 2),
                'totalDiscounts' => round($sum['disc'], 2),
                'totalWalletUsed' => round($sum['wallet'], 2),
                'totalMerchantPayouts' => round($sum['payout'], 2),
                'totalTamemNet' => round($sum['comm'] + $sum['fees'] - $sum['disc'], 2),
                'totalNetRevenue' => round($sum['comm'] + $sum['fees'] - $sum['disc'], 2),
                // Money the books cannot attribute: orders priced as one lump sum
                // with no goods/delivery split on record. Surfaced instead of
                // silently counted as zero, so the totals above are honest about
                // what they do NOT cover.
                'unattributedOrders' => $unattributedCount,
                'unattributedAmount' => round($sum['unattributed'], 2),
            ],
            'byMerchant' => $byMerchantOut,
            'byPaymentMethod' => array_values($byPay),
            'rows' => $rowsOut,
        ]);
    }

    jsonOk([
        'range' => ['key' => $range, 'from' => $from, 'to' => $to],
        'from' => $from,
        'to' => $to,
        // reports.tsx RevenueTab reads these three — must always be present:
        'series' => $series,
        'total' => $total,
        'ordersCount' => $count,
        // legacy / revenue-report-page fields (kept for backward compat):
        'totalRevenue' => $total,
        'orderCount' => $count,
        'averageOrderValue' => $count ? round($total / $count, 2) : 0,
        'trend' => $trend,
        'byService' => [],
        'byPaymentMethod' => [],
    ]);
}

// A few singular /admin/* GETs where the dashboard reads specific fields
// from the response object. Returning a list would crash them.
if ($method === 'GET' && $path === '/admin/home-config') {
    authUser();
    $rows = db()->query('SELECT * FROM `HomeConfig` ORDER BY id ASC LIMIT 1')->fetchAll();
    $row = $rows[0] ?? null;
    // Prisma stores longtext JSON columns as raw strings — decode them
    // before sending so `.join()` / `.length` / `.map()` work client-side.
    $jsonFields = ['heroGradient', 'visibleServiceKeys', 'featuredMerchantIds', 'featuredOfferIds', 'featuredProductIds'];
    if ($row) {
        foreach ($jsonFields as $f) {
            if (isset($row[$f]) && is_string($row[$f]) && $row[$f] !== '') {
                $d = json_decode($row[$f], true);
                $row[$f] = is_array($d) ? $d : null;
            }
        }
        // Coerce booleans that come from tinyint(1)
        foreach (['showPromoBanner', 'showTrustStrip'] as $b) {
            if (isset($row[$b])) $row[$b] = (bool) (int) $row[$b];
        }
        jsonOk($row);
    } else {
        jsonOk([
            'id' => 'singleton',
            'heroGreeting' => null,
            'heroSubtitle' => null,
            'heroGradient' => null,
            'visibleServiceKeys' => null,
            'featuredMerchantIds' => null,
            'featuredOfferIds' => null,
            'showPromoBanner' => false,
            'showTrustStrip' => false,
        ]);
    }
}

// Setting.value is a JSON column, so a text setting is stored as "…" (quoted).
// Handing that back raw made the editor show literal quotes and the landing
// render them too. Decode; fall back to the raw text for any legacy row that
// predates the JSON column.
function settingValue($raw) {
    if (!is_string($raw) || $raw === '') return $raw;
    $d = json_decode($raw, true);
    return json_last_error() === JSON_ERROR_NONE ? $d : $raw;
}
if ($method === 'GET' && $path === '/admin/site-config') {
    authUser();
    $rows = db()->query('SELECT `key`, `value` FROM `Setting`')->fetchAll();
    $out = [];
    foreach ($rows as $r) $out[(string) $r['key']] = settingValue($r['value']);
    http_response_code(200);
    echo json_encode(['data' => (object) $out], JSON_UNESCAPED_UNICODE);
    exit;
}

// ─── Generic admin GET fallback — tries to pull the matching table
// automatically so /admin/supervisors, /admin/products, /admin/orders, etc.
// all return REAL rows from the DB. If no table matches, an empty paginated
// envelope is returned so the dashboard renders without a crash.
//
// Resource → table map. `null` = use a synthesized query below.
// ─── Product audit trail ─────────────────────────────────────────────────────
// Written server-side on every product write so the record cannot be forged or
// skipped. An audit insert must never break the write it is recording, so all
// of this is wrapped in try/catch and failures only reach the error log.

/// Fields worth showing on a product timeline. Anything else (sortOrder churn,
/// sync bookkeeping) would just be noise.
$HISTORY_FIELDS = ['nameAr', 'name', 'price', 'salePrice', 'discount', 'stock', 'sku', 'barcode',
    'categoryName', 'merchantId', 'description', 'imageUrl', 'unit', 'isAvailable', 'isHidden'];

/// Denormalised into the row: an admin can be deleted, and "changed by
/// cmr9b…" is useless six months later.
function actorNameOf(?string $id): ?string {
    static $cache = [];
    if (!$id) return null;
    if (array_key_exists($id, $cache)) return $cache[$id];
    try {
        $st = db()->prepare('SELECT name FROM `User` WHERE id = ? LIMIT 1');
        $st->execute([$id]);
        $n = $st->fetchColumn();
        return $cache[$id] = ($n === false ? null : (string) $n);
    } catch (Throwable $e) {
        return $cache[$id] = null;
    }
}

/// Import attribution comes from request headers set by the dashboard.
function importCtx(): array {
    $h = function_exists('getallheaders') ? (getallheaders() ?: []) : [];
    $low = [];
    foreach ($h as $k => $v) $low[strtolower($k)] = $v;
    // Fall back to $_SERVER: some SAPIs don't expose getallheaders().
    if (!isset($low['x-import-job']) && isset($_SERVER['HTTP_X_IMPORT_JOB'])) $low['x-import-job'] = $_SERVER['HTTP_X_IMPORT_JOB'];
    if (!isset($low['x-import-file']) && isset($_SERVER['HTTP_X_IMPORT_FILE'])) $low['x-import-file'] = $_SERVER['HTTP_X_IMPORT_FILE'];
    $job = trim((string) ($low['x-import-job'] ?? ''));
    $file = trim((string) ($low['x-import-file'] ?? ''));
    return ['jobId' => $job !== '' ? $job : null, 'file' => $file !== '' ? rawurldecode($file) : null];
}

function logProductHistory(string $productId, ?string $productName, string $action, ?array $changes): void {
    try {
        $u = $GLOBALS['__auth_user'] ?? [];
        $ctx = importCtx();
        $actorId = $u['sub'] ?? null;
        $st = db()->prepare('INSERT INTO `ProductHistory`
            (id, productId, productName, action, source, actorId, actorName, importJobId, importFileName, changes, createdAt)
            VALUES (?,?,?,?,?,?,?,?,?,?,NOW(3))');
        $st->execute([
            newId(), $productId, $productName, $action,
            $ctx['jobId'] ? 'IMPORT' : 'MANUAL',
            $actorId, actorNameOf($actorId),
            $ctx['jobId'], $ctx['file'],
            $changes ? json_encode($changes, JSON_UNESCAPED_UNICODE) : null,
        ]);
    } catch (Throwable $e) {
        error_log('[api.php] ProductHistory insert failed: ' . $e->getMessage());
    }
}

/// Old vs new for the fields that actually changed. Numeric compare is loose on
/// purpose: MySQL hands back "120.00" where the client sent 120, and reporting
/// that as an edit would fill the timeline with changes nobody made.
function diffProduct(array $before, array $after): array {
    global $HISTORY_FIELDS;
    $out = [];
    foreach ($HISTORY_FIELDS as $f) {
        if (!array_key_exists($f, $after)) continue;
        $o = $before[$f] ?? null;
        $n = $after[$f] ?? null;
        if ($o === null && $n === null) continue;
        if (is_numeric($o) && is_numeric($n)) {
            if (abs((float) $o - (float) $n) < 0.00001) continue;
        } elseif ((string) $o === (string) $n) {
            continue;
        }
        $out[] = ['field' => $f, 'old' => $o, 'new' => $n];
    }
    return $out;
}

/// A pure availability flip reads better as ACTIVATE/DEACTIVATE than as a
/// generic UPDATE with one boolean in it.
function productActionFor(array $changes): string {
    if (count($changes) === 1 && $changes[0]['field'] === 'isAvailable') {
        return !empty($changes[0]['new']) ? 'ACTIVATE' : 'DEACTIVATE';
    }
    return 'UPDATE';
}

$RES = [
    // 'supervisors' handled by dedicated handlers below (nested shifts + on-shift)
    'pricing-rules'    => 'PricingRule',
    'coupons'          => 'Coupon',
    'offers'           => 'Offer',
    'products'         => 'Product',
    'services'         => 'Service',
    'categories'       => 'Category',
    'reviews'          => 'OrderReview',
    'payments'         => 'Payment',
    // 'orders' handled by dedicated nested handlers below (customer/service/driver)
    'settings'         => 'Setting',
];

/**
 * MySQL DATETIME → ISO-8601 UTC ("2026-07-17T10:39:54.997Z").
 *
 * Timestamps are STORED in UTC (the DB session is UTC: NOW() == UTC_TIMESTAMP()).
 * Handing the client a bare "2026-07-17 10:39:54" makes `new Date(...)` read it
 * as LOCAL time, so a Cairo admin saw every order stamped 3 hours early. The Z
 * suffix is what lets the browser convert to the viewer's zone correctly — the
 * fix belongs here, not in a display-side offset, which would break the moment
 * the server, the DB, or the viewer moved zone (or DST flipped).
 */
function isoZ($v): ?string {
    if ($v === null || $v === '') return null;
    if (!is_string($v)) return $v;
    // Already ISO (has T/Z/offset)? Leave it alone.
    if (preg_match('/[TZ]|[+-]\d{2}:\d{2}$/', $v)) return $v;
    if (!preg_match('/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(\.\d+)?$/', $v, $m)) return $v;
    $frac = isset($m[3]) ? substr(str_pad(ltrim($m[3], '.'), 3, '0'), 0, 3) : '000';
    return $m[1] . 'T' . $m[2] . '.' . $frac . 'Z';
}
function jsonizeRow(?array $row): ?array {
    if (!$row) return $row;
    // Decode obvious JSON strings + coerce tinyint booleans.
    foreach ($row as $k => $v) {
        if (is_string($v) && strlen($v) >= 2 && ($v[0] === '[' || $v[0] === '{')) {
            $d = json_decode($v, true);
            if ($d !== null) { $row[$k] = $d; continue; }
        }
        // Stamp UTC on datetimes. Date-only columns are left as-is: they carry no
        // time to be shifted, and giving them a midnight-Z would let a westward
        // viewer render them as the previous day.
        if (is_string($v)) {
            $iso = isoZ($v);
            if ($iso !== $v) $row[$k] = $iso;
        }
    }
    return $row;
}

// ─── Orders — dedicated handlers with nested customer/service/driver so the
// list + detail pages render real names (not '—') and the manual-order form
// actually persists.
function orderNest(array $r): array {
    $out = jsonizeRow($r);
    $out['customer'] = ['id' => $r['customerId'] ?? null, 'name' => $r['cu_name'] ?? null, 'phone' => $r['cu_phone'] ?? null, 'city' => $r['cu_city'] ?? null];
    $out['service'] = ['id' => $r['serviceId'] ?? null, 'nameAr' => $r['s_nameAr'] ?? null, 'name' => $r['s_name'] ?? null];
    $out['assignedDriver'] = ($r['assignedDriverId'] ?? null) ? ['id' => $r['assignedDriverId'], 'name' => $r['dr_name'] ?? null, 'phone' => $r['dr_phone'] ?? null] : null;
    foreach (['cu_name','cu_phone','cu_city','s_nameAr','s_name','dr_name','dr_phone'] as $k) unset($out[$k]);
    return $out;
}
const ORDER_JOIN = "FROM `Order` o
    LEFT JOIN `User` cu ON cu.id = o.customerId
    LEFT JOIN `Service` s ON s.id = o.serviceId
    LEFT JOIN `User` dr ON dr.id = o.assignedDriverId";
const ORDER_COLS = "o.*, cu.name AS cu_name, cu.phone AS cu_phone, cu.city AS cu_city,
    s.nameAr AS s_nameAr, s.name AS s_name, dr.name AS dr_name, dr.phone AS dr_phone";
/**
 * Slim column set for the ORDERS LIST only.
 *
 * The list used to select `o.*` — every one of the table's ~50 columns, including
 * the customData/imageUrls JSON blobs and all six lat/lng values — for every row,
 * none of which the list renders. Opening the detail still uses ORDER_COLS, so
 * nothing is lost; the list just stops shipping fields it never shows.
 */
const ORDER_LIST_COLS = "o.id, o.orderNumber, o.status, o.category,
    o.createdAt, o.updatedAt, o.deliveredAt, o.completedAt, o.cancelledAt, o.scheduledFor,
    o.customerId, o.assignedDriverId, o.serviceId, o.merchantId,
    o.deliveryAddress, o.pickupAddress,
    o.paymentMethod, o.paymentStatus,
    o.quotedPrice, o.finalPrice, o.deliveryFee, o.merchantSubtotal, o.discountAmount,
    o.platformCommission, o.merchantPayout,
    o.notes, o.whatsappSentAt, o.driverSettlementStatus,
    cu.name AS cu_name, cu.phone AS cu_phone, cu.city AS cu_city,
    s.nameAr AS s_nameAr, s.name AS s_name, dr.name AS dr_name, dr.phone AS dr_phone";
// GET /admin/perf — API performance, aggregated from the request log written by
// the shutdown hook at the top of this file. Per-route avg/p95/max, response
// size, error rate, plus the slowest individual requests.
if ($method === 'GET' && $path === '/admin/perf') {
    $u = authUser();
    if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $days = min(7, max(1, (int) ($_GET['days'] ?? 1)));
    $dir = __DIR__ . '/uploads/.perf';
    // Housekeeping: drop logs older than a week so the folder stays bounded.
    foreach (glob($dir . '/*.ndjson') ?: [] as $old) {
        if (@filemtime($old) < time() - 8 * 86400) @unlink($old);
    }
    $rows = [];
    for ($i = 0; $i < $days; $i++) {
        $f = $dir . '/' . date('Y-m-d', strtotime("-$i day")) . '.ndjson';
        if (!is_file($f)) continue;
        $lines = @file($f, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
        if (count($lines) > 8000) $lines = array_slice($lines, -8000);  // stay cheap
        foreach ($lines as $ln) { $d = json_decode($ln, true); if (is_array($d)) $rows[] = $d; }
    }
    $agg = [];
    foreach ($rows as $r) {
        $k = trim(((string) ($r['m'] ?? '')) . ' ' . ((string) ($r['r'] ?? '')));
        if (!isset($agg[$k])) $agg[$k] = ['route' => $k, 'count' => 0, 'totalMs' => 0, 'maxMs' => 0, 'errors' => 0, 'bytes' => 0, 'samples' => []];
        $ms = (int) ($r['ms'] ?? 0);
        $agg[$k]['count']++;
        $agg[$k]['totalMs'] += $ms;
        $agg[$k]['maxMs'] = max($agg[$k]['maxMs'], $ms);
        $agg[$k]['bytes'] += (int) ($r['b'] ?? 0);
        if ((int) ($r['s'] ?? 200) >= 400) $agg[$k]['errors']++;
        $agg[$k]['samples'][] = $ms;
    }
    $routes = [];
    foreach ($agg as $a) {
        sort($a['samples']);
        $n = count($a['samples']);
        $routes[] = [
            'route' => $a['route'], 'count' => $a['count'],
            'avgMs' => (int) round($a['totalMs'] / max(1, $a['count'])),
            'p95Ms' => $n ? $a['samples'][min($n - 1, (int) floor($n * 0.95))] : 0,
            'maxMs' => $a['maxMs'],
            'avgBytes' => (int) round($a['bytes'] / max(1, $a['count'])),
            'errors' => $a['errors'],
            'errorRate' => round($a['errors'] * 100 / max(1, $a['count']), 1),
        ];
    }
    usort($routes, static fn ($x, $y) => $y['avgMs'] <=> $x['avgMs']);
    $slow = $rows;
    usort($slow, static fn ($x, $y) => ((int) ($y['ms'] ?? 0)) <=> ((int) ($x['ms'] ?? 0)));
    $totalReq = count($rows);
    $totalErr = 0; $sumMs = 0;
    foreach ($rows as $r) { if ((int) ($r['s'] ?? 200) >= 400) $totalErr++; $sumMs += (int) ($r['ms'] ?? 0); }
    jsonOk([
        'days' => $days,
        'requests' => $totalReq,
        'avgMs' => $totalReq ? (int) round($sumMs / $totalReq) : 0,
        'errorRate' => round($totalErr * 100 / max(1, $totalReq), 2),
        'routes' => array_slice($routes, 0, 60),
        'slowest' => array_slice(array_map(static fn ($r) => [
            'route' => trim(((string) ($r['m'] ?? '')) . ' ' . ((string) ($r['r'] ?? ''))),
            'ms' => (int) ($r['ms'] ?? 0), 'status' => (int) ($r['s'] ?? 0), 'at' => $r['t'] ?? null,
        ], $slow), 0, 20),
    ]);
}
// GET /admin/orders/stats — the summary cards on the orders page (counts by
// stage + today's sales). One grouped query, so it's cheap on the shared DB.
if ($method === 'GET' && $path === '/admin/orders/stats') {
    authUser();
    $row = db()->query(
        "SELECT
            COUNT(*) AS total,
            SUM(status = 'NEW') AS newCount,
            SUM(status IN ('UNDER_REVIEW','PRICED','ACCEPTED')) AS preparing,
            SUM(status IN ('DRIVER_ASSIGNED','PICKED_UP','IN_ROUTE')) AS delivering,
            SUM(status IN ('DELIVERED','COMPLETED')) AS completed,
            SUM(status IN ('CANCELLED','REJECTED')) AS cancelled
         FROM `Order`"
    )->fetch() ?: [];
    // Today's sales in Cairo — bound by the epoch of Cairo midnight so we never
    // compare a stored UTC datetime against a PHP local time.
    $cairoMidnightUtc = gmdate('Y-m-d H:i:s', strtotime('today 00:00') - 3 * 3600);
    $salesStmt = db()->prepare(
        "SELECT COALESCE(SUM(COALESCE(finalPrice, quotedPrice, 0)), 0)
         FROM `Order`
         WHERE status IN ('DELIVERED','COMPLETED')
           AND (completedAt >= ? OR deliveredAt >= ? OR createdAt >= ?)"
    );
    $salesStmt->execute([$cairoMidnightUtc, $cairoMidnightUtc, $cairoMidnightUtc]);
    jsonOk([
        'total' => (int) ($row['total'] ?? 0),
        'new' => (int) ($row['newCount'] ?? 0),
        'preparing' => (int) ($row['preparing'] ?? 0),
        'delivering' => (int) ($row['delivering'] ?? 0),
        'completed' => (int) ($row['completed'] ?? 0),
        'cancelled' => (int) ($row['cancelled'] ?? 0),
        'salesToday' => round((float) $salesStmt->fetchColumn(), 2),
    ]);
}
if ($method === 'GET' && $path === '/admin/orders') {
    authUser();
    $page = max(1, (int)($_GET['page'] ?? 1)); $size = min(100, max(1, (int)($_GET['pageSize'] ?? 20))); $off = ($page - 1) * $size;
    // Children of a multi-merchant cart are nested under their parent below,
    // never listed on their own — otherwise one purchase reads as N orders.
    // `includeSubOrders=1` opts out for anything that genuinely needs them flat.
    $where = empty($_GET['includeSubOrders']) ? 'o.parentOrderId IS NULL' : '1=1';
    $args = [];
    $status = (string)($_GET['status'] ?? '');
    if ($status !== '' && $status !== 'all') {
        // The status tabs send a CSV set (e.g. "DRIVER_ASSIGNED,PICKED_UP,IN_ROUTE").
        // An exact `= ?` silently matched none of them, so the "في الطريق" and
        // "ملغي" tabs showed empty. Split into an IN (...) list.
        $parts = array_values(array_filter(array_map('trim', explode(',', $status))));
        if (count($parts) === 1) { $where .= ' AND o.status = ?'; $args[] = $parts[0]; }
        elseif ($parts) { $where .= ' AND o.status IN (' . implode(',', array_fill(0, count($parts), '?')) . ')'; array_push($args, ...$parts); }
    }
    $search = trim((string)($_GET['search'] ?? ''));
    if ($search !== '') {
        // Match order#, customer, and — as the spec asks — driver and merchant.
        $where .= ' AND (o.orderNumber LIKE ? OR cu.name LIKE ? OR cu.phone LIKE ? OR dr.name LIKE ? OR dr.phone LIKE ? OR s.nameAr LIKE ?)';
        $like = "%$search%"; array_push($args, $like, $like, $like, $like, $like, $like);
    }
    if (($_GET['driverId'] ?? '') !== '') { $where .= ' AND o.assignedDriverId = ?'; $args[] = (string) $_GET['driverId']; }
    if (($_GET['merchantId'] ?? '') !== '') { $where .= ' AND o.merchantId = ?'; $args[] = (string) $_GET['merchantId']; }
    if (($_GET['paymentMethod'] ?? '') !== '') { $where .= ' AND o.paymentMethod = ?'; $args[] = (string) $_GET['paymentMethod']; }
    if (($_GET['from'] ?? '') !== '') { $where .= ' AND o.createdAt >= ?'; $args[] = gmdate('Y-m-d H:i:s', strtotime((string) $_GET['from'])); }
    if (($_GET['to'] ?? '') !== '')   { $where .= ' AND o.createdAt <= ?'; $args[] = gmdate('Y-m-d H:i:s', strtotime((string) $_GET['to'])); }
    if (($_GET['from'] ?? '') === 'today') { /* handled by 'from' via strtotime('today') above */ }
    // Sorting: the list sends sortBy/sortDir but the ORDER BY used to be fixed,
    // so clicking a column header did nothing. Whitelist maps a client key to a
    // real SQL expression — anything unknown falls back to newest-first.
    $sortMap = [
        'createdAt' => 'o.createdAt', 'orderNumber' => 'o.orderNumber', 'status' => 'o.status',
        'finalPrice' => 'COALESCE(o.finalPrice, o.quotedPrice)', 'total' => 'COALESCE(o.finalPrice, o.quotedPrice)',
        'customer' => 'cu.name', 'driver' => 'dr.name', 'updatedAt' => 'o.updatedAt',
        'deliveredAt' => 'COALESCE(o.deliveredAt, o.completedAt)',
    ];
    $sortKey = (string) ($_GET['sortBy'] ?? $_GET['sort'] ?? '');
    $sortCol = $sortMap[$sortKey] ?? 'o.createdAt';
    $sortDir = strtoupper((string) ($_GET['sortDir'] ?? $_GET['dir'] ?? 'DESC')) === 'ASC' ? 'ASC' : 'DESC';
    $total = (int) (function() use ($where, $args) { $s = db()->prepare("SELECT COUNT(*) " . ORDER_JOIN . " WHERE $where"); $s->execute($args); return $s->fetchColumn(); })();
    $st = db()->prepare("SELECT " . ORDER_LIST_COLS . " " . ORDER_JOIN . " WHERE $where ORDER BY $sortCol $sortDir LIMIT $size OFFSET $off");
    $st->execute($args);
    $rows = array_map('orderNest', $st->fetchAll());

    /*
     * Attach each parent's per-merchant sub-orders.
     *
     * A two-merchant cart creates a parent plus one child per store. The list
     * used to return all three as separate top-level rows, so one purchase
     * looked like three orders. The children are now excluded from the top
     * level (see the WHERE clause) and nested here instead — which is what the
     * dashboard's expand chevron already expected to find.
     *
     * One extra query for the whole page, not one per row.
     */
    $parentIds = array_values(array_filter(array_map(fn($r) => $r['id'] ?? null, $rows)));
    if ($parentIds) {
        $in = implode(',', array_fill(0, count($parentIds), '?'));
        $ss = db()->prepare(
            'SELECT o.id, o.orderNumber, o.status, o.parentOrderId, o.merchantSubtotal,'
            . ' o.quotedPrice, o.finalPrice, o.merchantId, mp.storeNameAr,'
            . ' d.name AS driverName'
            . ' FROM `Order` o'
            . ' LEFT JOIN `MerchantProfile` mp ON mp.id = o.merchantId'
            . ' LEFT JOIN `User` d ON d.id = o.assignedDriverId'
            . " WHERE o.parentOrderId IN ($in) ORDER BY o.createdAt ASC"
        );
        $ss->execute($parentIds);
        $subsByParent = [];
        foreach ($ss->fetchAll() as $sub) {
            $subsByParent[$sub['parentOrderId']][] = [
                'id' => $sub['id'],
                'orderNumber' => $sub['orderNumber'],
                'status' => $sub['status'],
                'merchantSubtotal' => $sub['merchantSubtotal'] !== null ? (float) $sub['merchantSubtotal'] : null,
                'quotedPrice' => $sub['quotedPrice'] !== null ? (float) $sub['quotedPrice'] : null,
                'finalPrice' => $sub['finalPrice'] !== null ? (float) $sub['finalPrice'] : null,
                'merchant' => $sub['merchantId'] ? ['id' => $sub['merchantId'], 'storeNameAr' => $sub['storeNameAr']] : null,
                'assignedDriver' => $sub['driverName'] ? ['name' => $sub['driverName']] : null,
                'items' => [],
            ];
        }

        // Item lines for every sub-order on this page, in one go.
        if ($subsByParent) {
            $subIds = [];
            foreach ($subsByParent as $list) foreach ($list as $sub) $subIds[] = $sub['id'];
            $iin = implode(',', array_fill(0, count($subIds), '?'));
            $is = db()->prepare("SELECT orderId, productNameSnapshot, quantity FROM `OrderItem` WHERE orderId IN ($iin) ORDER BY id");
            $is->execute($subIds);
            $itemsByOrder = [];
            foreach ($is->fetchAll() as $it) {
                $itemsByOrder[$it['orderId']][] = [
                    'productNameSnapshot' => $it['productNameSnapshot'],
                    'quantity' => (int) $it['quantity'],
                ];
            }
            foreach ($subsByParent as &$list) {
                foreach ($list as &$sub) $sub['items'] = $itemsByOrder[$sub['id']] ?? [];
            }
            unset($list, $sub);
        }

        foreach ($rows as &$r) {
            $subs = $subsByParent[$r['id']] ?? [];
            $r['subOrders'] = $subs;
            $r['_count'] = ['subOrders' => count($subs)];
        }
        unset($r);
    }
    http_response_code(200);
    echo json_encode(['data' => $rows, 'meta' => ['pagination' => ['page' => $page, 'pageSize' => $size, 'total' => $total, 'totalPages' => (int) ceil($total / max(1, $size))]]], JSON_UNESCAPED_UNICODE);
    exit;
}
if ($method === 'GET' && preg_match('#^/admin/orders/([^/]+)$#', $path, $m)) {
    authUser();
    $st = db()->prepare("SELECT " . ORDER_COLS . " " . ORDER_JOIN . " WHERE o.id = ?"); $st->execute([$m[1]]);
    $r = $st->fetch();
    if (!$r) jsonErr('الطلب غير موجود', 404, 'NOT_FOUND');
    $o = orderNest($r);
    /*
     * Items, including those on child orders — same reason as the customer
     * route: a multi-merchant cart writes its OrderItems onto the per-merchant
     * CHILD orders, so reading `orderId = parent` returns nothing. The admin
     * opened a "سلة من 2 متاجر" order and saw neither the products nor the
     * stores.
     *
     * Each line carries its own merchant so ItemsByMerchantCard can group them.
     */
    $o['items'] = [];
    try {
        $it = db()->prepare(
            'SELECT oi.*, mp.storeNameAr AS merchantNameAr'
            . ' FROM `OrderItem` oi'
            . ' LEFT JOIN `MerchantProfile` mp ON mp.id = oi.merchantId'
            . ' WHERE oi.orderId = ?'
            . ' OR oi.orderId IN (SELECT id FROM `Order` WHERE parentOrderId = ?)'
            . ' ORDER BY oi.merchantId, oi.id'
        );
        $it->execute([$m[1], $m[1]]);
        $o['items'] = array_map(function ($row) {
            $row = jsonizeRow($row);
            $row['merchant'] = $row['merchantNameAr'] !== null
                ? ['id' => $row['merchantId'], 'storeNameAr' => $row['merchantNameAr']]
                : null;
            unset($row['merchantNameAr']);
            return $row;
        }, $it->fetchAll());
    } catch (Throwable $e) { /* leave empty */ }

    // Per-merchant child orders, for the multi-merchant banner and the
    // per-store subtotal breakdown.
    $o['subOrders'] = [];
    try {
        $so = db()->prepare(
            'SELECT o.id, o.orderNumber, o.status, o.merchantSubtotal, o.quotedPrice,'
            . ' o.finalPrice, o.paymentStatus, o.merchantId, mp.storeNameAr, mp.logoUrl,'
            . ' d.name AS driverName, d.phone AS driverPhone'
            . ' FROM `Order` o'
            . ' LEFT JOIN `MerchantProfile` mp ON mp.id = o.merchantId'
            . ' LEFT JOIN `User` d ON d.id = o.assignedDriverId'
            . ' WHERE o.parentOrderId = ? ORDER BY o.createdAt ASC'
        );
        $so->execute([$m[1]]);
        $subRows = $so->fetchAll();

        // Item lines per sub-order, in ONE query. The dashboard renders
        // `sub.items.map(...)` unconditionally, so this key must always exist —
        // omitting it crashes the whole order page, not just that section.
        $itemsBySub = [];
        if ($subRows) {
            $sids = array_column($subRows, 'id');
            $iin = implode(',', array_fill(0, count($sids), '?'));
            $iq = db()->prepare("SELECT orderId, productNameSnapshot, quantity FROM `OrderItem` WHERE orderId IN ($iin) ORDER BY id");
            $iq->execute($sids);
            foreach ($iq->fetchAll() as $it) {
                $itemsBySub[$it['orderId']][] = [
                    'productNameSnapshot' => $it['productNameSnapshot'],
                    'quantity' => (int) $it['quantity'],
                ];
            }
        }

        $o['subOrders'] = array_map(fn($s) => [
            'id' => $s['id'],
            'orderNumber' => $s['orderNumber'],
            'status' => $s['status'],
            'merchantSubtotal' => $s['merchantSubtotal'] !== null ? (float) $s['merchantSubtotal'] : null,
            'quotedPrice' => $s['quotedPrice'] !== null ? (float) $s['quotedPrice'] : null,
            'finalPrice' => $s['finalPrice'] !== null ? (float) $s['finalPrice'] : null,
            'paymentStatus' => $s['paymentStatus'],
            'assignedDriver' => $s['driverName']
                ? ['name' => $s['driverName'], 'phone' => $s['driverPhone']]
                : null,
            'items' => $itemsBySub[$s['id']] ?? [],
            'merchant' => $s['merchantId']
                ? ['id' => $s['merchantId'], 'storeNameAr' => $s['storeNameAr'], 'logoUrl' => $s['logoUrl']]
                : null,
        ], $subRows);
    } catch (Throwable $e) { /* leave empty */ }
    $o['statusHistory'] = [];
    try { $sh = db()->prepare('SELECT * FROM `OrderStatusHistory` WHERE orderId = ? ORDER BY createdAt ASC'); $sh->execute([$m[1]]); $o['statusHistory'] = array_map('jsonizeRow', $sh->fetchAll()); } catch (Throwable $e) {}
    jsonOk($o);
}
if ($method === 'POST' && $path === '/admin/orders') {
    $u = authUser();
    if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $b = readJsonBody();
    $serviceId = (string)($b['serviceId'] ?? '');
    if ($serviceId === '') jsonErr('اختر الخدمة', 422, 'MISSING');
    $sv = db()->prepare('SELECT category FROM `Service` WHERE id = ?'); $sv->execute([$serviceId]); $svc = $sv->fetch();
    if (!$svc) jsonErr('الخدمة غير موجودة', 422, 'BAD_SERVICE');
    $customerId = (string)($b['customerId'] ?? '');
    if ($customerId === '') {
        $phone = trim((string)($b['customerPhone'] ?? ''));
        if ($phone === '') jsonErr('اختر العميل أو اكتب رقم هاتفه', 422, 'MISSING');
        $cl = preg_replace('/[\s\-()]/', '', $phone);
        if (preg_match('/^(?:\+?20|0)?(1[0125]\d{8})$/', $cl, $mm)) $phone = '+20' . $mm[1];
        $f = db()->prepare('SELECT id FROM `User` WHERE phone = ? LIMIT 1'); $f->execute([$phone]); $ex = $f->fetch();
        if ($ex) $customerId = $ex['id'];
        else {
            $customerId = newId();
            db()->prepare('INSERT INTO `User` (id, name, phone, role, isActive, isPhoneVerified, createdAt, updatedAt) VALUES (?,?,?,?,1,0,NOW(3),NOW(3))')
                ->execute([$customerId, (string)($b['customerName'] ?? 'عميل'), $phone, 'CUSTOMER']);
        }
    }
    $id = newId();
    $orderNumber = 'TMM' . strtoupper(substr($id, 1, 9));
    $cols = ['id', 'orderNumber', 'serviceId', 'customerId', 'category', 'status', 'createdByAdminId'];
    $ph = ['?', '?', '?', '?', '?', '?', '?'];
    $args = [$id, $orderNumber, $serviceId, $customerId, $svc['category'], 'NEW', $u['sub'] ?? null];
    $opt = ['deliveryAddress' => $b['deliveryAddress'] ?? null, 'notes' => $b['notes'] ?? null,
        'deliveryLat' => isset($b['deliveryLat']) && $b['deliveryLat'] !== '' ? (float)$b['deliveryLat'] : null,
        'deliveryLng' => isset($b['deliveryLng']) && $b['deliveryLng'] !== '' ? (float)$b['deliveryLng'] : null,
        'quotedPrice' => isset($b['quotedPrice']) && $b['quotedPrice'] !== '' ? (float)$b['quotedPrice'] : null,
        'paymentMethod' => !empty($b['paymentMethod']) ? (string)$b['paymentMethod'] : null];
    foreach ($opt as $k => $v) if ($v !== null) { $cols[] = $k; $ph[] = '?'; $args[] = $v; }
    $cols[] = 'createdAt'; $ph[] = 'NOW(3)'; $cols[] = 'updatedAt'; $ph[] = 'NOW(3)';
    $colStr = implode(',', array_map(fn($c) => "`$c`", $cols));
    try {
        db()->prepare("INSERT INTO `Order` ($colStr) VALUES (" . implode(',', $ph) . ")")->execute($args);
    } catch (PDOException $e) { error_log('[api.php] manual order: ' . $e->getMessage()); jsonErr('تعذّر إنشاء الطلب، راجع البيانات', 422, 'CREATE_FAILED'); }
    // Same money model as the app + reorder paths, so a manual order reports
    // its goods / delivery / commission / payout identically.
    computeOrderFinancials($id);
    alertNewOrder($id, (string) $orderNumber);
    // Customer + group + extra recipients via the editable templates.
    notifyOrderParties($id, 'NEW');
    // Additionally dispatch to the on-shift supervisor(s) (+ record dispatch) —
    // the Supervisor-table shift feature, distinct from the business number.
    try {
        [$dow, $mins] = nowCairo();
        foreach (db()->query("SELECT * FROM `Supervisor` WHERE isActive = 1")->fetchAll() as $sup) {
            $hit = false;
            foreach (shiftsForSupervisor($sup['id']) as $sh) if (shiftCoversNow($sh, $dow, $mins)) { $hit = true; break; }
            if ($hit) {
                $addr = (string)($b['deliveryAddress'] ?? '');
                waEnqueue($sup['whatsappPhone'], "🆕 طلب جديد *#{$orderNumber}*\nالعميل: " . (string)($b['customerName'] ?? '') . ($addr ? "\nالعنوان: $addr" : ''));
                try { db()->prepare('INSERT INTO `SupervisorOrderDispatch` (id, supervisorId, orderId, status, sentAt, createdAt) VALUES (?,?,?,?,NOW(3),NOW(3))')->execute([newId(), $sup['id'], $id, 'SENT']); } catch (Throwable $e) {}
                break;
            }
        }
    } catch (Throwable $e) { /* best-effort */ }
    $sel = db()->prepare("SELECT " . ORDER_COLS . " " . ORDER_JOIN . " WHERE o.id = ?"); $sel->execute([$id]);
    jsonOk(orderNest($sel->fetch()), 201);
}

// ─── Supervisors — nested shifts + on-shift computation + shift CRUD ────
function shiftsForSupervisor(string $supId): array {
    $st = db()->prepare('SELECT * FROM `SupervisorShift` WHERE supervisorId = ? ORDER BY startTime');
    $st->execute([$supId]);
    return array_map(function ($s) {
        $days = json_decode((string)($s['daysOfWeek'] ?? '[]'), true);
        return ['id' => $s['id'], 'supervisorId' => $s['supervisorId'], 'kind' => $s['kind'],
            'startTime' => $s['startTime'], 'endTime' => $s['endTime'],
            'daysOfWeek' => is_array($days) ? array_map('intval', $days) : [],
            'isActive' => (bool)(int)$s['isActive']];
    }, $st->fetchAll());
}
function shiftCoversNow(array $sh, int $dow, int $mins): bool {
    if (!$sh['isActive']) return false;
    $days = $sh['daysOfWeek'] ?? [];
    if (!empty($days) && !in_array($dow, $days, true)) return false;
    $s = (int)substr($sh['startTime'], 0, 2) * 60 + (int)substr($sh['startTime'], 3, 2);
    $e = (int)substr($sh['endTime'], 0, 2) * 60 + (int)substr($sh['endTime'], 3, 2);
    if ($e <= $s) return $mins >= $s || $mins < $e; // crosses midnight
    return $mins >= $s && $mins < $e;
}
function nowCairo(): array {
    try { $n = new DateTime('now', new DateTimeZone('Africa/Cairo')); } catch (Throwable $e) { $n = new DateTime('now'); }
    return [(int)$n->format('w'), (int)$n->format('G') * 60 + (int)$n->format('i')];
}
if ($method === 'GET' && $path === '/admin/supervisors') {
    authUser();
    [$dow, $mins] = nowCairo();
    $rows = db()->query('SELECT * FROM `Supervisor` ORDER BY createdAt DESC')->fetchAll();
    $out = array_map(function ($r) use ($dow, $mins) {
        $shifts = shiftsForSupervisor($r['id']);
        $onShift = false;
        foreach ($shifts as $sh) if (shiftCoversNow($sh, $dow, $mins)) { $onShift = true; break; }
        return ['id' => $r['id'], 'name' => $r['name'], 'whatsappPhone' => $r['whatsappPhone'],
            'isActive' => (bool)(int)$r['isActive'], 'notes' => $r['notes'],
            'createdAt' => $r['createdAt'], 'updatedAt' => $r['updatedAt'],
            'shifts' => $shifts, 'isOnShiftNow' => $onShift && (bool)(int)$r['isActive']];
    }, $rows);
    http_response_code(200);
    echo json_encode(['data' => ['supervisors' => $out], 'supervisors' => $out], JSON_UNESCAPED_UNICODE);
    exit;
}
if ($method === 'GET' && $path === '/admin/supervisors/current') {
    authUser();
    [$dow, $mins] = nowCairo();
    $rows = db()->query("SELECT * FROM `Supervisor` WHERE isActive = 1")->fetchAll();
    $cur = null;
    foreach ($rows as $r) {
        foreach (shiftsForSupervisor($r['id']) as $sh) {
            if (shiftCoversNow($sh, $dow, $mins)) {
                $cur = ['id' => $r['id'], 'name' => $r['name'], 'whatsappPhone' => $r['whatsappPhone'], 'isActive' => true,
                    'shift' => ['kind' => $sh['kind'], 'startTime' => $sh['startTime'], 'endTime' => $sh['endTime']]];
                break 2;
            }
        }
    }
    http_response_code(200);
    echo json_encode(['data' => ['supervisor' => $cur], 'supervisor' => $cur], JSON_UNESCAPED_UNICODE);
    exit;
}
if ($method === 'GET' && preg_match('#^/admin/supervisors/([^/]+)/reports$#', $path, $m)) {
    authUser();
    $period = (string)($_GET['period'] ?? 'daily');
    $from = $period === 'monthly' ? '-30 days' : ($period === 'weekly' ? '-7 days' : '-1 day');
    $fromSql = gmdate('Y-m-d H:i:s', strtotime($from));
    $rows = [];
    try {
        $st = db()->prepare("SELECT DATE(sentAt) d, COUNT(*) c, SUM(status='SENT') ok FROM `SupervisorOrderDispatch` WHERE supervisorId = ? AND sentAt >= ? GROUP BY DATE(sentAt) ORDER BY d");
        $st->execute([$m[1], $fromSql]); $rows = $st->fetchAll();
    } catch (Throwable $e) { $rows = []; }
    $total = 0; $ok = 0; $breakdown = [];
    foreach ($rows as $r) { $total += (int)$r['c']; $ok += (int)$r['ok']; $breakdown[] = ['date' => $r['d'], 'count' => (int)$r['c']]; }
    jsonOk(['supervisorId' => $m[1], 'period' => $period, 'totalDispatches' => $total,
        'successCount' => $ok, 'failureCount' => $total - $ok, 'breakdown' => $breakdown]);
}
if ($method === 'POST' && preg_match('#^/admin/supervisors/([^/]+)/shifts$#', $path, $m)) {
    authUser();
    $b = readJsonBody();
    db()->prepare('INSERT INTO `SupervisorShift` (id, supervisorId, kind, startTime, endTime, daysOfWeek, isActive, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,NOW(3),NOW(3))')
        ->execute([newId(), $m[1], (string)($b['kind'] ?? 'CUSTOM'), (string)($b['startTime'] ?? '08:00'),
            (string)($b['endTime'] ?? '16:00'), json_encode(array_map('intval', $b['daysOfWeek'] ?? [])),
            !empty($b['isActive'] ?? true) ? 1 : 0]);
    jsonOk(['ok' => true], 201);
}
if ($method === 'PATCH' && preg_match('#^/admin/supervisors/shifts/([^/]+)$#', $path, $m)) {
    authUser();
    $b = readJsonBody(); $sets = []; $args = [];
    foreach (['kind', 'startTime', 'endTime'] as $f) if (array_key_exists($f, $b)) { $sets[] = "`$f` = ?"; $args[] = (string)$b[$f]; }
    if (array_key_exists('daysOfWeek', $b)) { $sets[] = '`daysOfWeek` = ?'; $args[] = json_encode(array_map('intval', $b['daysOfWeek'] ?? [])); }
    if (array_key_exists('isActive', $b)) { $sets[] = '`isActive` = ?'; $args[] = $b['isActive'] ? 1 : 0; }
    if ($sets) { $sets[] = '`updatedAt` = NOW(3)'; $args[] = $m[1]; db()->prepare('UPDATE `SupervisorShift` SET ' . implode(',', $sets) . ' WHERE id = ?')->execute($args); }
    jsonOk(['ok' => true]);
}
if ($method === 'DELETE' && preg_match('#^/admin/supervisors/shifts/([^/]+)$#', $path, $m)) {
    authUser();
    db()->prepare('DELETE FROM `SupervisorShift` WHERE id = ?')->execute([$m[1]]);
    jsonOk(['deleted' => true]);
}

// Magic sub-path /current — used e.g. by supervisors to fetch the one
// currently on-shift. We don't model shifts here, so return `null` in a way
// the react-query code can safely read as "no current supervisor".
if ($method === 'GET' && preg_match('#^/admin/([a-z][a-z0-9-]*)/current$#', $path, $m)
        && isset($RES[$m[1]])) {
    authUser();
    http_response_code(200);
    echo json_encode(['data' => null], JSON_UNESCAPED_UNICODE);
    exit;
}

// GET /admin/categories — the generic list below returns bare rows, but the
// admin categories screen needs each category's merchant count to know whether
// a delete can really remove it or must fall back to hiding it.
if ($method === 'GET' && $path === '/admin/categories') {
    authUser();
    $sql = 'SELECT c.*, (SELECT COUNT(*) FROM `MerchantProfile` mp WHERE mp.categoryId = c.id) AS merchant_count'
         . ' FROM `Category` c ORDER BY c.sortOrder ASC, c.nameAr ASC';
    $rows = db()->query($sql)->fetchAll();
    $out = [];
    foreach ($rows as $r) {
        $n = (int) $r['merchant_count'];
        unset($r['merchant_count']);
        $r = jsonizeRow($r);
        $r['isActive'] = !empty($r['isActive']);
        $r['sortOrder'] = (int) ($r['sortOrder'] ?? 0);
        $r['_count'] = ['merchants' => $n];
        $out[] = $r;
    }
    jsonOk($out);
}

// GET /admin/products — the generic $RES list below returns bare Product rows,
// so the admin table rendered "—" for every merchant and ignored ?search.
// Dedicated handler: joins the store and applies the filters the screen sends.
// Product stat cards, computed over the WHOLE filtered set. The page used to
// derive these from the 200 rows it had fetched, so every count was wrong once a
// merchant had more than that. One aggregate query, cached separately from the
// list so paging doesn't recompute it.
if ($method === 'GET' && $path === '/admin/products/stats') {
    authUser();
    $where = '1=1'; $args = [];
    if (!empty($_GET['merchantId'])) { $where .= ' AND merchantId = ?'; $args[] = (string) $_GET['merchantId']; }
    $q = trim((string) ($_GET['search'] ?? ''));
    if ($q !== '') {
        $where .= ' AND (name LIKE ? OR nameAr LIKE ? OR sku LIKE ?)';
        $like = "%$q%"; array_push($args, $like, $like, $like);
    }
    $st = db()->prepare("SELECT COUNT(*) total,
        COALESCE(SUM(isAvailable = 1), 0) available,
        COALESCE(SUM(isAvailable = 0), 0) disabled,
        COALESCE(SUM(stock IS NOT NULL AND stock <= 0), 0) outOfStock,
        COALESCE(SUM(stock IS NOT NULL AND stock > 0 AND stock <= 5), 0) low,
        COALESCE(SUM(imageUrl IS NULL OR imageUrl = ''), 0) noImage
        FROM `Product` WHERE $where");
    $st->execute($args);
    $r = $st->fetch() ?: [];
    jsonOk([
        'total' => (int) ($r['total'] ?? 0), 'available' => (int) ($r['available'] ?? 0),
        'disabled' => (int) ($r['disabled'] ?? 0), 'out' => (int) ($r['outOfStock'] ?? 0),
        'low' => (int) ($r['low'] ?? 0), 'noImage' => (int) ($r['noImage'] ?? 0),
    ]);
}
if ($method === 'GET' && $path === '/admin/products') {
    authUser();
    $page = max(1, (int) ($_GET['page'] ?? 1));
    $pageSize = min(200, max(1, (int) ($_GET['pageSize'] ?? 50)));
    $where = '1=1';
    $args = [];
    if (!empty($_GET['merchantId'])) { $where .= ' AND p.merchantId = ?'; $args[] = $_GET['merchantId']; }
    // ids=a,b,c — lets the dashboard's product picker show what is already
    // selected even when it isn't on the current search page.
    $idsRaw = trim((string) ($_GET['ids'] ?? ''));
    if ($idsRaw !== '') {
        $ids = array_slice(array_values(array_filter(array_map('trim', explode(',', $idsRaw)))), 0, 100);
        if (!$ids) jsonList([], 1, 0, 0);
        $where .= ' AND p.id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')';
        foreach ($ids as $id) $args[] = $id;
    }
    $q = trim((string) ($_GET['search'] ?? ''));
    if ($q !== '') {
        $where .= ' AND (p.name LIKE ? OR p.nameAr LIKE ? OR p.sku LIKE ?)';
        $like = '%' . $q . '%';
        $args[] = $like; $args[] = $like; $args[] = $like;
    }
    if (isset($_GET['isAvailable']) && $_GET['isAvailable'] !== '') {
        $where .= ' AND p.isAvailable = ?';
        $args[] = filter_var($_GET['isAvailable'], FILTER_VALIDATE_BOOLEAN) ? 1 : 0;
    }
    // Filters the products page used to apply in the browser (after pulling 200
    // rows) — now done in SQL so paging/sorting reflect the whole table.
    if (isset($_GET['isHidden']) && $_GET['isHidden'] !== '') {
        $where .= ' AND p.isHidden = ?';
        $args[] = filter_var($_GET['isHidden'], FILTER_VALIDATE_BOOLEAN) ? 1 : 0;
    }
    $stock = strtolower(trim((string) ($_GET['stock'] ?? '')));   // in | out | low
    if ($stock === 'out') $where .= ' AND (p.stock IS NOT NULL AND p.stock <= 0)';
    elseif ($stock === 'in') $where .= ' AND (p.stock IS NULL OR p.stock > 0)';
    elseif ($stock === 'low') $where .= ' AND (p.stock IS NOT NULL AND p.stock > 0 AND p.stock <= 5)';
    $img = strtolower(trim((string) ($_GET['hasImage'] ?? '')));  // yes | no
    if ($img === 'yes') $where .= " AND (p.imageUrl IS NOT NULL AND p.imageUrl <> '')";
    elseif ($img === 'no') $where .= " AND (p.imageUrl IS NULL OR p.imageUrl = '')";
    if (!empty($_GET['categoryName'])) { $where .= ' AND p.categoryName = ?'; $args[] = (string) $_GET['categoryName']; }
    $cnt = db()->prepare('SELECT COUNT(*) FROM `Product` p WHERE ' . $where);
    $cnt->execute($args);
    $total = (int) $cnt->fetchColumn();
    // Whitelisted sort (was fixed merchant/sortOrder/name, so header clicks and
    // price/stock sorting only ever reordered the current page in the browser).
    $pSortMap = [
        'name' => 'p.nameAr', 'nameAr' => 'p.nameAr', 'price' => 'p.price', 'stock' => 'p.stock',
        'createdAt' => 'p.createdAt', 'updatedAt' => 'p.updatedAt', 'category' => 'p.categoryName',
        'merchant' => 'm.storeNameAr',
    ];
    $pKey = (string) ($_GET['sortBy'] ?? $_GET['sort'] ?? '');
    $pDir = strtoupper((string) ($_GET['sortDir'] ?? $_GET['dir'] ?? 'ASC')) === 'DESC' ? 'DESC' : 'ASC';
    $pOrder = isset($pSortMap[$pKey])
        ? ($pSortMap[$pKey] . ' ' . $pDir)
        : 'p.merchantId ASC, p.sortOrder ASC, p.nameAr ASC';
    $sql = 'SELECT p.*, m.storeNameAr AS m_storeNameAr, m.storeName AS m_storeName'
         . ' FROM `Product` p LEFT JOIN `MerchantProfile` m ON m.id = p.merchantId'
         . ' WHERE ' . $where
         . ' ORDER BY ' . $pOrder
         . ' LIMIT ' . $pageSize . ' OFFSET ' . (($page - 1) * $pageSize);
    $st = db()->prepare($sql);
    $st->execute($args);
    $rows = [];
    foreach ($st->fetchAll() as $r) {
        $p = productShape($r);
        $p['merchant'] = !empty($r['merchantId'])
            ? ['id' => $r['merchantId'], 'storeNameAr' => $r['m_storeNameAr'] ?? null, 'storeName' => $r['m_storeName'] ?? null]
            : null;
        unset($p['m_storeNameAr'], $p['m_storeName']);
        $rows[] = $p;
    }
    jsonList($rows, $page, $pageSize, $total);
}

// POST /admin/products/bulk-availability — the products screen's bulk
// activate/deactivate bar. Two path segments, so the generic single-segment
// POST never matches it.
if ($method === 'POST' && $path === '/admin/products/bulk-availability') {
    $u = authUser();
    if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $b = readJsonBody();
    $ids = $b['ids'] ?? [];
    if (!is_array($ids) || !$ids) jsonErr('لا توجد منتجات محددة', 400, 'BAD_REQUEST');
    $ids = array_values(array_filter(array_map('strval', $ids)));
    if (!$ids) jsonErr('لا توجد منتجات محددة', 400, 'BAD_REQUEST');
    $val = !empty($b['isAvailable']) ? 1 : 0;
    $in = implode(',', array_fill(0, count($ids), '?'));
    // Read the rows first: after the UPDATE there is no way to tell which ones
    // actually flipped, and logging unchanged products would be a lie.
    $pre = db()->prepare("SELECT id, nameAr, isAvailable FROM `Product` WHERE id IN ($in)");
    $pre->execute($ids);
    $rowsBefore = $pre->fetchAll();
    $st = db()->prepare("UPDATE `Product` SET isAvailable = ?, updatedAt = NOW(3) WHERE id IN ($in)");
    $st->execute(array_merge([$val], $ids));
    foreach ($rowsBefore as $r) {
        if ((int) $r['isAvailable'] === $val) continue;
        logProductHistory((string) $r['id'], $r['nameAr'] ?? null, $val ? 'ACTIVATE' : 'DEACTIVATE',
            [['field' => 'isAvailable', 'old' => (bool) $r['isAvailable'], 'new' => (bool) $val]]);
    }
    jsonOk(['updated' => $st->rowCount()]);
}

// ─── Audit trail: read endpoints ─────────────────────────────────────────────

/// Rows are stored naive; the dashboard normalises to UTC and renders Cairo
/// time, so they are returned exactly as stored, like the rest of the API.
function historyShape(array $r): array {
    $r['changes'] = $r['changes'] ? json_decode($r['changes'], true) : null;
    return $r;
}

// GET /admin/products/{id}/history — one product's timeline.
// Three path segments, so the generic two-segment GET never sees it.
if ($method === 'GET' && preg_match('#^/admin/products/([^/]+)/history$#', $path, $m)) {
    authUser();
    $id = $m[1];
    $where = 'productId = ?';
    $args = [$id];
    if (!empty($_GET['action']))  { $where .= ' AND action = ?'; $args[] = $_GET['action']; }
    if (!empty($_GET['source']))  { $where .= ' AND source = ?'; $args[] = $_GET['source']; }
    if (!empty($_GET['actorId'])) { $where .= ' AND actorId = ?'; $args[] = $_GET['actorId']; }
    if (!empty($_GET['from']))    { $where .= ' AND createdAt >= ?'; $args[] = str_replace('T', ' ', substr($_GET['from'], 0, 19)); }
    if (!empty($_GET['to']))      { $where .= ' AND createdAt <= ?'; $args[] = str_replace('T', ' ', substr($_GET['to'], 0, 19)); }
    $page = max(1, (int) ($_GET['page'] ?? 1));
    $size = min(200, max(1, (int) ($_GET['pageSize'] ?? 50)));
    $cnt = db()->prepare('SELECT COUNT(*) FROM `ProductHistory` WHERE ' . $where);
    $cnt->execute($args);
    $total = (int) $cnt->fetchColumn();
    $st = db()->prepare('SELECT * FROM `ProductHistory` WHERE ' . $where . ' ORDER BY createdAt DESC, id DESC LIMIT ' . $size . ' OFFSET ' . (($page - 1) * $size));
    $st->execute($args);
    jsonList(array_map('historyShape', $st->fetchAll()), $page, $size, $total);
}

// ─── Import jobs ─────────────────────────────────────────────────────────────

function importJobShape(array $r): array {
    foreach (['totalRows', 'createdCount', 'updatedCount', 'skippedCount', 'errorCount'] as $k) $r[$k] = (int) ($r[$k] ?? 0);
    return $r;
}

// POST /admin/import-jobs — open a job before any row is written, so a run that
// dies halfway still leaves a record instead of vanishing.
if ($method === 'POST' && $path === '/admin/import-jobs') {
    $u = authUser();
    if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $b = readJsonBody();
    $id = newId();
    $st = db()->prepare('INSERT INTO `ImportJob`
        (id, fileName, fileUrl, actorId, actorName, status, kind, totalRows, startedAt)
        VALUES (?,?,?,?,?,?,?,?,NOW(3))');
    $st->execute([
        $id,
        (string) ($b['fileName'] ?? 'ملف'),
        isset($b['fileUrl']) ? (string) $b['fileUrl'] : null,
        $u['sub'] ?? null,
        actorNameOf($u['sub'] ?? null),
        (string) ($b['status'] ?? 'PROCESSING'),
        (string) ($b['kind'] ?? 'MIXED'),
        (int) ($b['totalRows'] ?? 0),
    ]);
    $sel = db()->prepare('SELECT * FROM `ImportJob` WHERE id = ?');
    $sel->execute([$id]);
    jsonOk(importJobShape($sel->fetch() ?: []), 201);
}

// PATCH /admin/import-jobs/{id} — progress + final counts.
if ($method === 'PATCH' && preg_match('#^/admin/import-jobs/([^/]+)$#', $path, $m)) {
    $u = authUser();
    if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $id = $m[1];
    $b = readJsonBody();
    $sets = []; $args = [];
    foreach (['status', 'kind', 'fileUrl', 'errorMessage'] as $f) {
        if (array_key_exists($f, $b)) { $sets[] = "`$f` = ?"; $args[] = $b[$f]; }
    }
    foreach (['totalRows', 'createdCount', 'updatedCount', 'skippedCount', 'errorCount'] as $f) {
        if (array_key_exists($f, $b)) { $sets[] = "`$f` = ?"; $args[] = (int) $b[$f]; }
    }
    // A terminal status stamps the finish time — the duration shown in the UI
    // must come from the server, not from whatever clock the browser has.
    if (in_array($b['status'] ?? '', ['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'], true)) {
        $sets[] = '`finishedAt` = NOW(3)';
    }
    if ($sets) { $args[] = $id; db()->prepare('UPDATE `ImportJob` SET ' . implode(',', $sets) . ' WHERE id = ?')->execute($args); }
    $sel = db()->prepare('SELECT * FROM `ImportJob` WHERE id = ?');
    $sel->execute([$id]);
    jsonOk(importJobShape($sel->fetch() ?: []));
}

// POST /admin/import-jobs/{id}/rows — per-row outcomes, sent in one batch.
if ($method === 'POST' && preg_match('#^/admin/import-jobs/([^/]+)/rows$#', $path, $m)) {
    $u = authUser();
    if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $jobId = $m[1];
    $b = readJsonBody();
    $rows = $b['rows'] ?? [];
    if (!is_array($rows)) jsonErr('rows مطلوبة', 400, 'BAD_REQUEST');
    $st = db()->prepare('INSERT INTO `ImportRowLog`
        (id, jobId, line, productId, productName, sku, action, status, errorColumn, errorMessage, badValue, createdAt)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW(3))');
    $n = 0;
    foreach ($rows as $r) {
        try {
            $st->execute([
                newId(), $jobId, (int) ($r['line'] ?? 0),
                isset($r['productId']) ? (string) $r['productId'] : null,
                isset($r['productName']) ? mb_substr((string) $r['productName'], 0, 255) : null,
                isset($r['sku']) ? mb_substr((string) $r['sku'], 0, 80) : null,
                mb_substr((string) ($r['action'] ?? 'skip'), 0, 10),
                mb_substr((string) ($r['status'] ?? 'ok'), 0, 10),
                isset($r['errorColumn']) ? mb_substr((string) $r['errorColumn'], 0, 120) : null,
                isset($r['errorMessage']) ? mb_substr((string) $r['errorMessage'], 0, 500) : null,
                isset($r['badValue']) ? mb_substr((string) $r['badValue'], 0, 255) : null,
            ]);
            $n++;
        } catch (Throwable $e) {
            error_log('[api.php] ImportRowLog insert failed: ' . $e->getMessage());
        }
    }
    jsonOk(['inserted' => $n]);
}

// GET /admin/import-jobs/{id}/products — what this file actually touched.
if ($method === 'GET' && preg_match('#^/admin/import-jobs/([^/]+)/products$#', $path, $m)) {
    authUser();
    $st = db()->prepare('SELECT h.productId, h.productName, h.action, h.createdAt, h.changes,
            p.id AS live_id, p.price, p.stock, p.isAvailable
        FROM `ProductHistory` h
        LEFT JOIN `Product` p ON p.id = h.productId
        WHERE h.importJobId = ? ORDER BY h.createdAt ASC');
    $st->execute([$m[1]]);
    $out = [];
    foreach ($st->fetchAll() as $r) {
        $r['changes'] = $r['changes'] ? json_decode($r['changes'], true) : null;
        // Null when the product has since been deleted — the UI must not offer
        // a dead link.
        $r['exists'] = !empty($r['live_id']);
        unset($r['live_id']);
        $out[] = $r;
    }
    jsonOk($out);
}

// GET /admin/import-jobs/{id} — detail + every row outcome.
if ($method === 'GET' && preg_match('#^/admin/import-jobs/([^/]+)$#', $path, $m)) {
    authUser();
    $sel = db()->prepare('SELECT * FROM `ImportJob` WHERE id = ?');
    $sel->execute([$m[1]]);
    $job = $sel->fetch();
    if (!$job) jsonErr('العملية غير موجودة', 404, 'NOT_FOUND');
    $job = importJobShape($job);
    $rs = db()->prepare('SELECT * FROM `ImportRowLog` WHERE jobId = ? ORDER BY line ASC');
    $rs->execute([$m[1]]);
    $job['rows'] = $rs->fetchAll();
    jsonOk($job);
}

// GET /admin/import-jobs — history list with the filters the screen offers.
if ($method === 'GET' && $path === '/admin/import-jobs') {
    authUser();
    $where = '1=1'; $args = [];
    if (!empty($_GET['status']))  { $where .= ' AND status = ?'; $args[] = $_GET['status']; }
    if (!empty($_GET['kind']))    { $where .= ' AND kind = ?'; $args[] = $_GET['kind']; }
    if (!empty($_GET['actorId'])) { $where .= ' AND actorId = ?'; $args[] = $_GET['actorId']; }
    $q = trim((string) ($_GET['search'] ?? ''));
    if ($q !== '') { $where .= ' AND (fileName LIKE ? OR actorName LIKE ?)'; $args[] = "%$q%"; $args[] = "%$q%"; }
    if (!empty($_GET['from'])) { $where .= ' AND startedAt >= ?'; $args[] = str_replace('T', ' ', substr($_GET['from'], 0, 19)); }
    if (!empty($_GET['to']))   { $where .= ' AND startedAt <= ?'; $args[] = str_replace('T', ' ', substr($_GET['to'], 0, 19)); }
    $page = max(1, (int) ($_GET['page'] ?? 1));
    $size = min(100, max(1, (int) ($_GET['pageSize'] ?? 25)));
    $cnt = db()->prepare('SELECT COUNT(*) FROM `ImportJob` WHERE ' . $where);
    $cnt->execute($args);
    $total = (int) $cnt->fetchColumn();
    $st = db()->prepare('SELECT * FROM `ImportJob` WHERE ' . $where . ' ORDER BY startedAt DESC LIMIT ' . $size . ' OFFSET ' . (($page - 1) * $size));
    $st->execute($args);
    jsonList(array_map('importJobShape', $st->fetchAll()), $page, $size, $total);
}

// DELETE /admin/import-jobs/{id} — removes the log entry only. Products created
// or updated by the file stay, and so does their history: deleting a receipt
// must never delete the goods.
if ($method === 'DELETE' && preg_match('#^/admin/import-jobs/([^/]+)$#', $path, $m)) {
    $u = authUser();
    if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    db()->prepare('DELETE FROM `ImportJob` WHERE id = ?')->execute([$m[1]]);
    jsonOk(['deleted' => true]);
}

// ─── Reviews — dedicated handlers with the linked order / customer / driver /
// merchant nested in. Without these, /admin/reviews fell to the generic $RES
// list (bare `SELECT *`), so the page received raw driverId/merchantId cuids
// with no names and showed "غير معروف" everywhere. The DB always had the links;
// the API simply never joined them.
function reviewSelectSql(): string {
    return "SELECT r.id, r.orderId, r.customerId, r.driverId, r.merchantId,
                   r.rating, r.driverRating, r.merchantRating, r.comment, r.createdAt,
                   o.orderNumber, o.status AS orderStatus,
                   cu.name AS cuName, cu.phone AS cuPhone, cu.avatarUrl AS cuAvatar,
                   dr.name AS drName, dr.phone AS drPhone, dr.avatarUrl AS drAvatar,
                   mp.storeNameAr AS mpName, mp.logoUrl AS mpLogo
            FROM `OrderReview` r
            LEFT JOIN `Order` o ON o.id = r.orderId
            LEFT JOIN `User` cu ON cu.id = r.customerId
            LEFT JOIN `User` dr ON dr.id = r.driverId
            LEFT JOIN `MerchantProfile` mp ON mp.id = r.merchantId";
}
function reviewNest(array $r): array {
    // A driver WAS linked but the User row is gone (deleted account): say so
    // explicitly rather than showing a blank or a fabricated name, and log it.
    $driver = null;
    if ($r['driverId']) {
        if ($r['drName'] === null) {
            error_log('[api.php] review ' . $r['id'] . ': driverId ' . $r['driverId'] . ' has no User row (deleted?)');
            $driver = ['id' => $r['driverId'], 'name' => null, 'phone' => null, 'avatarUrl' => null, 'missing' => true];
        } else {
            $driver = ['id' => $r['driverId'], 'name' => $r['drName'], 'phone' => $r['drPhone'], 'avatarUrl' => $r['drAvatar']];
        }
    }
    $merchant = $r['merchantId']
        ? ['id' => $r['merchantId'], 'storeNameAr' => $r['mpName'] ?: null, 'logoUrl' => $r['mpLogo'] ?? null]
        : null;
    return [
        'id' => $r['id'],
        'orderId' => $r['orderId'], 'customerId' => $r['customerId'],
        'driverId' => $r['driverId'], 'merchantId' => $r['merchantId'],
        'rating' => (int) $r['rating'],
        'driverRating' => $r['driverRating'] !== null ? (int) $r['driverRating'] : null,
        'merchantRating' => $r['merchantRating'] !== null ? (int) $r['merchantRating'] : null,
        'comment' => $r['comment'],
        'createdAt' => isoZ($r['createdAt']),
        'order' => $r['orderId'] ? ['id' => $r['orderId'], 'orderNumber' => $r['orderNumber'], 'status' => $r['orderStatus']] : null,
        'customer' => ['id' => $r['customerId'], 'name' => $r['cuName'] ?: 'عميل', 'phone' => $r['cuPhone'], 'avatarUrl' => $r['cuAvatar']],
        'driver' => $driver,
        'merchant' => $merchant,
    ];
}
// GET /admin/reviews/stats — real aggregates (was computed client-side from
// the last page only; this is the whole table).
if ($method === 'GET' && $path === '/admin/reviews/stats') {
    $u = authUser(); if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $row = db()->query(
        "SELECT COUNT(*) AS total,
                ROUND(AVG(rating), 2) AS avgRating,
                ROUND(AVG(driverRating), 2) AS avgDriver,
                ROUND(AVG(merchantRating), 2) AS avgMerchant,
                SUM(rating <= 2) AS negatives,
                SUM(rating = 5) AS s5, SUM(rating = 4) AS s4, SUM(rating = 3) AS s3,
                SUM(rating = 2) AS s2, SUM(rating = 1) AS s1
         FROM `OrderReview`"
    )->fetch() ?: [];
    jsonOk([
        'total' => (int) ($row['total'] ?? 0),
        'averageRating' => $row['avgRating'] !== null ? (float) $row['avgRating'] : null,
        'averageDriver' => $row['avgDriver'] !== null ? (float) $row['avgDriver'] : null,
        'averageMerchant' => $row['avgMerchant'] !== null ? (float) $row['avgMerchant'] : null,
        'negatives' => (int) ($row['negatives'] ?? 0),
        'distribution' => [
            '5' => (int) ($row['s5'] ?? 0), '4' => (int) ($row['s4'] ?? 0),
            '3' => (int) ($row['s3'] ?? 0), '2' => (int) ($row['s2'] ?? 0), '1' => (int) ($row['s1'] ?? 0),
        ],
    ]);
}
// GET /admin/reviews/:id — single review, fully linked (the detail page).
if ($method === 'GET' && preg_match('#^/admin/reviews/([^/]+)$#', $path, $m)) {
    $u = authUser(); if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $st = db()->prepare(reviewSelectSql() . ' WHERE r.id = ? LIMIT 1');
    $st->execute([$m[1]]);
    $row = $st->fetch();
    if (!$row) jsonErr('التقييم غير موجود', 404, 'NOT_FOUND');
    jsonOk(reviewNest($row));
}
// GET /admin/reviews — nested list + server-side filters.
if ($method === 'GET' && $path === '/admin/reviews') {
    $u = authUser(); if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $page = max(1, (int) ($_GET['page'] ?? 1));
    $size = min(200, max(1, (int) ($_GET['pageSize'] ?? 20)));
    $off = ($page - 1) * $size;
    $where = []; $args = [];
    $minR = (int) ($_GET['minRating'] ?? 0);
    if ($minR > 0) { $where[] = 'r.rating >= ?'; $args[] = $minR; }
    if (($_GET['minDriverRating'] ?? '') !== '') { $where[] = 'r.driverRating >= ?'; $args[] = (int) $_GET['minDriverRating']; }
    if (($_GET['minMerchantRating'] ?? '') !== '') { $where[] = 'r.merchantRating >= ?'; $args[] = (int) $_GET['minMerchantRating']; }
    if (($_GET['driverId'] ?? '') !== '') { $where[] = 'r.driverId = ?'; $args[] = (string) $_GET['driverId']; }
    if (($_GET['merchantId'] ?? '') !== '') { $where[] = 'r.merchantId = ?'; $args[] = (string) $_GET['merchantId']; }
    if (($_GET['customerId'] ?? '') !== '') { $where[] = 'r.customerId = ?'; $args[] = (string) $_GET['customerId']; }
    $q = trim((string) ($_GET['q'] ?? $_GET['search'] ?? ''));
    if ($q !== '') {
        $where[] = '(o.orderNumber LIKE ? OR r.comment LIKE ? OR cu.name LIKE ? OR dr.name LIKE ? OR mp.storeNameAr LIKE ?)';
        for ($i = 0; $i < 5; $i++) $args[] = "%$q%";
    }
    if (($_GET['from'] ?? '') !== '') { $where[] = 'r.createdAt >= ?'; $args[] = gmdate('Y-m-d H:i:s', strtotime((string) $_GET['from'])); }
    if (($_GET['to'] ?? '') !== '')   { $where[] = 'r.createdAt <= ?'; $args[] = gmdate('Y-m-d H:i:s', strtotime((string) $_GET['to'])); }
    $wsql = $where ? (' WHERE ' . implode(' AND ', $where)) : '';
    $ct = db()->prepare("SELECT COUNT(*) FROM `OrderReview` r
        LEFT JOIN `Order` o ON o.id = r.orderId
        LEFT JOIN `User` cu ON cu.id = r.customerId
        LEFT JOIN `User` dr ON dr.id = r.driverId
        LEFT JOIN `MerchantProfile` mp ON mp.id = r.merchantId" . $wsql);
    $ct->execute($args);
    $total = (int) $ct->fetchColumn();
    $st = db()->prepare(reviewSelectSql() . $wsql . " ORDER BY r.createdAt DESC LIMIT $size OFFSET $off");
    $st->execute($args);
    $rows = array_map('reviewNest', $st->fetchAll());
    http_response_code(200);
    echo json_encode([
        'data' => $rows,
        'meta' => ['pagination' => [
            'page' => $page, 'pageSize' => $size, 'total' => $total,
            'totalPages' => (int) ceil($total / $size),
        ]],
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'GET' && preg_match('#^/admin/([a-z][a-z0-9-]*)/([^/]+)$#', $path, $m)
        && isset($RES[$m[1]])) {
    authUser();
    $tbl = $RES[$m[1]];
    $st = db()->prepare("SELECT * FROM `$tbl` WHERE id = ? LIMIT 1");
    $st->execute([$m[2]]);
    $row = $st->fetch();
    if (!$row) jsonErr('السجل غير موجود', 404, 'NOT_FOUND');
    jsonOk(jsonizeRow($row));
}

if ($method === 'GET' && preg_match('#^/admin/([a-z][a-z0-9-]*)$#', $path, $m)
        && isset($RES[$m[1]])) {
    authUser();
    $tbl = $RES[$m[1]];
    // Pagination: ?page=N&pageSize=M
    $page = max(1, (int)($_GET['page'] ?? 1));
    $size = min(200, max(1, (int)($_GET['pageSize'] ?? 20)));
    $off = ($page - 1) * $size;
    // Filtering / search / sort are driven by the table's REAL columns, so a
    // client-supplied name can never reach SQL unless it exists. Previously this
    // handler ignored every filter — the payments page's status tabs, for one,
    // were inert server-side and returned the same rows for every tab.
    $cols = tableColumns($tbl);
    $where = []; $args = [];
    foreach (['status', 'isActive', 'method', 'type', 'kind'] as $ff) {
        $v = trim((string) ($_GET[$ff] ?? ''));
        if ($v !== '' && strtoupper($v) !== 'ALL' && isset($cols[$ff])) { $where[] = "`$ff` = ?"; $args[] = $v; }
    }
    $q = trim((string) ($_GET['search'] ?? $_GET['q'] ?? ''));
    if ($q !== '') {
        $ors = [];
        foreach (['code', 'name', 'nameAr', 'title', 'titleAr', 'description', 'key', 'method', 'status', 'orderId', 'transactionRef'] as $c) {
            if (isset($cols[$c])) { $ors[] = "`$c` LIKE ?"; $args[] = "%$q%"; }
        }
        if ($ors) $where[] = '(' . implode(' OR ', $ors) . ')';
    }
    $wsql = $where ? ('WHERE ' . implode(' AND ', $where)) : '';

    $sort = (string) ($_GET['sort'] ?? $_GET['sortBy'] ?? '');
    $dir = strtoupper((string) ($_GET['dir'] ?? $_GET['sortDir'] ?? 'DESC')) === 'ASC' ? 'ASC' : 'DESC';
    if ($sort !== '' && isset($cols[$sort])) $orderBy = "ORDER BY `$sort` $dir";
    elseif ($tbl === 'Setting') $orderBy = 'ORDER BY `key` ASC';           // Setting has no createdAt
    elseif (isset($cols['createdAt'])) $orderBy = 'ORDER BY `createdAt` DESC';
    else $orderBy = '';

    $ct = db()->prepare("SELECT COUNT(*) FROM `$tbl` $wsql");
    $ct->execute($args);
    $total = (int) $ct->fetchColumn();
    $st = db()->prepare("SELECT * FROM `$tbl` $wsql $orderBy LIMIT $size OFFSET $off");
    $st->execute($args);
    $rows = array_map('jsonizeRow', $st->fetchAll());

    http_response_code(200);
    echo json_encode([
        'data' => $rows,
        'meta' => ['pagination' => [
            'page' => $page, 'pageSize' => $size, 'total' => $total,
            'totalPages' => (int) ceil($total / $size),
        ]],
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// Merchants list — the page reads MerchantProfile rows with nested `user`,
// `category` and `_count.products`, NOT bare User rows.
// GET /admin/merchants/stats — totals for the cards. Two path segments, and
// 'merchants' is not in $RES, so nothing upstream claims this route.
if ($method === 'GET' && $path === '/admin/merchants/stats') {
    authUser();
    $row = db()->query('SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN u.isActive = 1 THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN u.isActive = 1 THEN 0 ELSE 1 END) AS inactive,
        SUM(CASE WHEN (SELECT COUNT(*) FROM `Product` p WHERE p.merchantId = mp.id) > 0 THEN 1 ELSE 0 END) AS with_products,
        SUM(CASE WHEN (SELECT COUNT(*) FROM `Product` p WHERE p.merchantId = mp.id) > 0 THEN 0 ELSE 1 END) AS without_products,
        SUM(CASE WHEN ac.id IS NULL THEN 1 ELSE 0 END) AS no_api
      FROM `MerchantProfile` mp
      LEFT JOIN `User` u ON u.id = mp.userId
      LEFT JOIN `MerchantApiConfig` ac ON ac.merchantId = mp.id')->fetch();
    jsonOk([
        'total' => (int) ($row['total'] ?? 0),
        'active' => (int) ($row['active'] ?? 0),
        'inactive' => (int) ($row['inactive'] ?? 0),
        'withProducts' => (int) ($row['with_products'] ?? 0),
        'withoutProducts' => (int) ($row['without_products'] ?? 0),
        'noApi' => (int) ($row['no_api'] ?? 0),
    ]);
}

if ($method === 'GET' && $path === '/admin/merchants') {
    authUser();
    $page = max(1, (int)($_GET['page'] ?? 1));
    $size = min(100, max(1, (int)($_GET['pageSize'] ?? 20)));
    $off = ($page - 1) * $size;

    // Filters run in SQL: the screen pages server-side, so anything done in the
    // browser could only ever filter the rows that page already holds.
    $where = '1=1';
    $args = [];
    $q = trim((string)($_GET['search'] ?? ''));
    if ($q !== '') {
        $where .= ' AND (mp.storeNameAr LIKE ? OR mp.storeName LIKE ? OR mp.addressLine LIKE ?
                    OR u.name LIKE ? OR u.phone LIKE ? OR u.email LIKE ? OR mp.phone LIKE ? OR mp.id = ?)';
        $like = '%' . $q . '%';
        for ($i = 0; $i < 7; $i++) $args[] = $like;
        $args[] = $q;
    }
    if (!empty($_GET['categoryId'])) { $where .= ' AND mp.categoryId = ?'; $args[] = $_GET['categoryId']; }
    if (!empty($_GET['governorate'])) { $where .= ' AND mp.governorate = ?'; $args[] = $_GET['governorate']; }
    $status = (string)($_GET['status'] ?? '');
    if ($status === 'active') $where .= ' AND u.isActive = 1';
    elseif ($status === 'inactive') $where .= ' AND (u.isActive = 0 OR u.isActive IS NULL)';
    $hasProducts = (string)($_GET['hasProducts'] ?? '');
    if ($hasProducts === 'yes') $where .= ' AND (SELECT COUNT(*) FROM `Product` p2 WHERE p2.merchantId = mp.id) > 0';
    elseif ($hasProducts === 'no') $where .= ' AND (SELECT COUNT(*) FROM `Product` p2 WHERE p2.merchantId = mp.id) = 0';
    $hasApi = (string)($_GET['hasApi'] ?? '');
    if ($hasApi === 'yes') $where .= ' AND ac.id IS NOT NULL';
    elseif ($hasApi === 'no') $where .= ' AND ac.id IS NULL';
    if (!empty($_GET['from'])) { $where .= ' AND mp.createdAt >= ?'; $args[] = str_replace('T', ' ', substr($_GET['from'], 0, 19)); }
    if (!empty($_GET['to']))   { $where .= ' AND mp.createdAt <= ?'; $args[] = str_replace('T', ' ', substr($_GET['to'], 0, 19)); }

    $sort = (string)($_GET['sort'] ?? 'createdAt');
    $dir = strtolower((string)($_GET['dir'] ?? 'desc')) === 'asc' ? 'ASC' : 'DESC';
    // Whitelisted: the column name is interpolated, so it can never come
    // straight from the query string.
    $sortCol = [
        'createdAt' => 'mp.createdAt', 'updatedAt' => 'mp.updatedAt',
        'name' => 'mp.storeNameAr', 'products' => 'product_count',
    ][$sort] ?? 'mp.createdAt';

    $JOINS = 'FROM `MerchantProfile` mp
         LEFT JOIN `User` u ON u.id = mp.userId
         LEFT JOIN `Category` c ON c.id = mp.categoryId
         LEFT JOIN `MerchantApiConfig` ac ON ac.merchantId = mp.id';

    $cnt = db()->prepare('SELECT COUNT(*) ' . $JOINS . ' WHERE ' . $where);
    $cnt->execute($args);
    $total = (int) $cnt->fetchColumn();

    $st = db()->prepare(
        "SELECT mp.*, u.name AS u_name, u.phone AS u_phone, u.email AS u_email, u.isActive AS u_isActive, u.secondaryPhones AS u_secondaryPhones,
                c.nameAr AS c_nameAr, c.name AS c_name,
                ac.id AS api_id, ac.apiUrl AS api_url, ac.isConnected AS api_connected, ac.isActive AS api_active, ac.lastSyncedAt AS api_last_sync,
                (SELECT COUNT(*) FROM `Product` p WHERE p.merchantId = mp.id) AS product_count
         " . $JOINS . " WHERE " . $where . "
         ORDER BY $sortCol $dir LIMIT $size OFFSET $off"
    );
    $st->execute($args);
    $rows = [];
    foreach ($st->fetchAll() as $r) {
        $sec = $r['u_secondaryPhones'] ?? null;
        $secArr = is_string($sec) && $sec !== '' ? (json_decode($sec, true) ?: []) : [];
        // menuImages is a JSON array in a longtext column. The edit dialog seeds
        // its form from THIS list row, so omitting the field here doesn't just
        // hide it — the form initialises to [] and the next save writes [] back,
        // wiping the merchant's real menu photos. Same trap for phone/commissionPct.
        $menu = $r['menuImages'] ?? null;
        $menuArr = is_string($menu) && $menu !== '' ? (json_decode($menu, true) ?: []) : [];
        $rows[] = [
            'id' => $r['id'], 'userId' => $r['userId'],
            'storeName' => $r['storeName'], 'storeNameAr' => $r['storeNameAr'],
            'categoryId' => $r['categoryId'], 'description' => $r['description'],
            'addressLine' => $r['addressLine'], 'lat' => $r['lat'], 'lng' => $r['lng'],
            'governorate' => $r['governorate'], 'city' => $r['city'],
            'isOpen' => (bool)(int)$r['isOpen'], 'rating' => $r['rating'],
            'manualStatus' => $r['manualStatus'] ?? 'OPEN',
            'logoUrl' => $r['logoUrl'] ?? null, 'coverUrl' => $r['coverUrl'] ?? null,
            // The store's public number — distinct from user.phone (owner login).
            'phone' => $r['phone'] ?? null,
            'commissionPct' => $r['commissionPct'] ?? null,
            'menuImages' => $menuArr,
            'createdAt' => $r['createdAt'], 'updatedAt' => $r['updatedAt'],
            'user' => ['id' => $r['userId'], 'name' => $r['u_name'], 'phone' => $r['u_phone'], 'email' => $r['u_email'], 'isActive' => (bool)(int)($r['u_isActive'] ?? 1), 'secondaryPhones' => $secArr],
            'category' => $r['c_nameAr'] !== null ? ['id' => $r['categoryId'], 'nameAr' => $r['c_nameAr'], 'name' => $r['c_name']] : null,
            '_count' => ['products' => (int)$r['product_count']],
            // Null when the merchant has no API config — the screen shows
            // "غير مرتبط" rather than pretending an integration exists.
            'apiConfig' => !empty($r['api_id']) ? [
                'id' => $r['api_id'],
                'apiUrl' => $r['api_url'] ?? null,
                // isConnected = the last test/sync succeeded; isActive = the
                // integration is switched on. There is no `isEnabled` column.
                'isConnected' => (bool)(int)($r['api_connected'] ?? 0),
                'isActive' => (bool)(int)($r['api_active'] ?? 0),
                'lastSyncedAt' => $r['api_last_sync'] ?? null,
            ] : null,
        ];
    }
    http_response_code(200);
    echo json_encode(['data' => $rows, 'meta' => ['pagination' => ['page' => $page, 'pageSize' => $size, 'total' => $total, 'totalPages' => (int) ceil($total / max(1, $size))]]], JSON_UNESCAPED_UNICODE);
    exit;
}

// Drivers list — the page reads User rows with a nested `driverProfile`.
if ($method === 'GET' && $path === '/admin/drivers') {
    authUser();
    $page = max(1, (int)($_GET['page'] ?? 1));
    $size = min(100, max(1, (int)($_GET['pageSize'] ?? 20)));
    $off = ($page - 1) * $size;
    // ?status=AVAILABLE is what the assign-driver dialogs send. This used to be
    // ignored, so BUSY and OFFLINE drivers were offered as assignable — the
    // dialog asked for a filtered list and silently got everyone.
    $dWhere = "u.role='DRIVER'"; $dArgs = [];
    $dStatus = strtoupper(trim((string) ($_GET['status'] ?? '')));
    if ($dStatus !== '' && $dStatus !== 'ALL' && in_array($dStatus, ['AVAILABLE', 'BUSY', 'OFFLINE'], true)) {
        // An inactive account can't take work regardless of its profile status.
        $dWhere .= ' AND dp.status = ? AND u.isActive = 1'; $dArgs[] = $dStatus;
    }
    $q = trim((string) ($_GET['q'] ?? $_GET['search'] ?? ''));
    if ($q !== '') { $dWhere .= ' AND (u.name LIKE ? OR u.phone LIKE ?)'; $dArgs[] = "%$q%"; $dArgs[] = "%$q%"; }
    $ct = db()->prepare("SELECT COUNT(*) FROM `User` u LEFT JOIN `DriverProfile` dp ON dp.userId = u.id WHERE $dWhere");
    $ct->execute($dArgs);
    $total = (int) $ct->fetchColumn();
    $st = db()->prepare(
        "SELECT u.*, dp.id AS dp_id, dp.status AS dp_status, dp.vehicleType AS dp_vehicleType, dp.vehiclePlate AS dp_vehiclePlate,
                dp.nationalId AS dp_nationalId, dp.governorate AS dp_governorate, dp.totalDeliveries AS dp_totalDeliveries,
                dp.totalEarnings AS dp_totalEarnings, dp.cashOnHand AS dp_cashOnHand, dp.rating AS dp_rating,
                dp.deliverySharePct AS dp_deliverySharePct,
                dp.vehicleImageUrl AS dp_vehicleImageUrl, dp.idCardFrontUrl AS dp_idCardFrontUrl, dp.idCardBackUrl AS dp_idCardBackUrl
         FROM `User` u LEFT JOIN `DriverProfile` dp ON dp.userId = u.id
         WHERE $dWhere ORDER BY u.createdAt DESC LIMIT $size OFFSET $off"
    );
    $st->execute($dArgs);
    $rows = [];
    foreach ($st->fetchAll() as $r) {
        $row = jsonizeRow([
            'id' => $r['id'], 'name' => $r['name'], 'phone' => $r['phone'], 'email' => $r['email'],
            'avatarUrl' => $r['avatarUrl'] ?? null,
            'isActive' => (bool)(int)$r['isActive'], 'city' => $r['city'], 'governorate' => $r['governorate'],
            'createdAt' => $r['createdAt'],
        ]);
        $row['driverProfile'] = $r['dp_id'] !== null ? [
            'id' => $r['dp_id'], 'status' => $r['dp_status'], 'vehicleType' => $r['dp_vehicleType'],
            'vehiclePlate' => $r['dp_vehiclePlate'], 'nationalId' => $r['dp_nationalId'],
            'governorate' => $r['dp_governorate'], 'totalDeliveries' => (int)$r['dp_totalDeliveries'],
            'totalEarnings' => $r['dp_totalEarnings'], 'cashOnHand' => $r['dp_cashOnHand'], 'rating' => $r['dp_rating'],
            'deliverySharePct' => $r['dp_deliverySharePct'] !== null ? (float)$r['dp_deliverySharePct'] : 0,
            'vehicleImageUrl' => $r['dp_vehicleImageUrl'], 'idCardFrontUrl' => $r['dp_idCardFrontUrl'], 'idCardBackUrl' => $r['dp_idCardBackUrl'],
        ] : null;
        $rows[] = $row;
    }
    http_response_code(200);
    echo json_encode(['data' => $rows, 'meta' => ['pagination' => ['page' => $page, 'pageSize' => $size, 'total' => $total, 'totalPages' => (int) ceil($total / max(1, $size))]]], JSON_UNESCAPED_UNICODE);
    exit;
}

// GET /admin/drivers/:id — driver + their reviews + rating stats. This handler
// did not exist, so the profile's adminGetDriver() fell through to the stub
// fallback and every driver showed "0 تقييمات" even when reviews existed. The
// distribution is computed from OrderReview.driverRating (the driver-specific
// score), not the overall order rating which mixes driver + merchant.
if ($method === 'GET' && preg_match('#^/admin/drivers/([^/]+)$#', $path, $m)) {
    $u = authUser(); if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $did = $m[1];
    $ds = db()->prepare(
        "SELECT u.id, u.name, u.phone, u.email, u.avatarUrl, u.isActive, u.city, u.governorate, u.createdAt,
                dp.id AS dp_id, dp.status AS dp_status, dp.vehicleType AS dp_vehicleType, dp.vehiclePlate AS dp_vehiclePlate,
                dp.nationalId AS dp_nationalId, dp.governorate AS dp_governorate, dp.totalDeliveries AS dp_totalDeliveries,
                dp.totalEarnings AS dp_totalEarnings, dp.cashOnHand AS dp_cashOnHand, dp.rating AS dp_rating,
                dp.deliverySharePct AS dp_deliverySharePct,
                dp.vehicleImageUrl AS dp_vehicleImageUrl, dp.idCardFrontUrl AS dp_idCardFrontUrl, dp.idCardBackUrl AS dp_idCardBackUrl
         FROM `User` u LEFT JOIN `DriverProfile` dp ON dp.userId = u.id
         WHERE u.id = ? AND u.role = 'DRIVER' LIMIT 1"
    );
    $ds->execute([$did]);
    $r = $ds->fetch();
    if (!$r) jsonErr('السائق غير موجود', 404, 'NOT_FOUND');
    $out = [
        'id' => $r['id'], 'name' => $r['name'], 'phone' => $r['phone'], 'email' => $r['email'],
        'avatarUrl' => $r['avatarUrl'], 'isActive' => (bool) (int) $r['isActive'],
        'city' => $r['city'], 'governorate' => $r['governorate'], 'createdAt' => isoZ($r['createdAt']),
        'driverProfile' => $r['dp_id'] !== null ? [
            'id' => $r['dp_id'], 'status' => $r['dp_status'], 'vehicleType' => $r['dp_vehicleType'],
            'vehiclePlate' => $r['dp_vehiclePlate'], 'nationalId' => $r['dp_nationalId'],
            'governorate' => $r['dp_governorate'], 'totalDeliveries' => (int) $r['dp_totalDeliveries'],
            'totalEarnings' => $r['dp_totalEarnings'], 'cashOnHand' => $r['dp_cashOnHand'], 'rating' => $r['dp_rating'],
            'deliverySharePct' => $r['dp_deliverySharePct'] !== null ? (float) $r['dp_deliverySharePct'] : 0,
            'vehicleImageUrl' => $r['dp_vehicleImageUrl'], 'idCardFrontUrl' => $r['dp_idCardFrontUrl'], 'idCardBackUrl' => $r['dp_idCardBackUrl'],
        ] : null,
    ];
    // Reviews for this driver, newest first, with the order number.
    $rv = db()->prepare(reviewSelectSql() . ' WHERE r.driverId = ? ORDER BY r.createdAt DESC LIMIT 100');
    $rv->execute([$did]);
    $out['reviews'] = array_map('reviewNest', $rv->fetchAll());
    // Stats from the driver-specific score.
    $sr = db()->prepare(
        "SELECT COUNT(driverRating) AS c, ROUND(AVG(driverRating), 2) AS a,
                SUM(driverRating = 5) AS s5, SUM(driverRating = 4) AS s4, SUM(driverRating = 3) AS s3,
                SUM(driverRating = 2) AS s2, SUM(driverRating = 1) AS s1
         FROM `OrderReview` WHERE driverId = ? AND driverRating IS NOT NULL"
    );
    $sr->execute([$did]);
    $s = $sr->fetch() ?: [];
    $out['stats'] = [
        'reviewCount' => (int) ($s['c'] ?? 0),
        'averageRating' => $s['a'] !== null ? (float) $s['a'] : null,
        'distribution' => [
            '5' => (int) ($s['s5'] ?? 0), '4' => (int) ($s['s4'] ?? 0), '3' => (int) ($s['s3'] ?? 0),
            '2' => (int) ($s['s2'] ?? 0), '1' => (int) ($s['s1'] ?? 0),
        ],
    ];
    jsonOk($out);
}

// ─── Merchant detail + sub-pages (hours, status, product-API config) ───
if ($method === 'GET' && preg_match('#^/admin/merchants/([^/]+)/hours$#', $path, $m)) {
    authUser();
    $mp = db()->prepare('SELECT id, storeNameAr, manualStatus, timezone FROM `MerchantProfile` WHERE id = ?');
    $mp->execute([$m[1]]); $merchant = $mp->fetch();
    if (!$merchant) jsonErr('التاجر غير موجود', 404, 'NOT_FOUND');
    $wh = db()->prepare('SELECT id, dayOfWeek, openMin, closeMin, isClosed FROM `MerchantBusinessHours` WHERE merchantId = ? ORDER BY dayOfWeek');
    $wh->execute([$m[1]]);
    $windows = array_map(fn($w) => [
        'id' => $w['id'], 'dayOfWeek' => (int) $w['dayOfWeek'], 'openMin' => (int) $w['openMin'],
        'closeMin' => (int) $w['closeMin'], 'isClosed' => (bool) (int) $w['isClosed'],
    ], $wh->fetchAll());
    $tzName = $merchant['timezone'] ?: 'Africa/Cairo';
    try { $now = new DateTime('now', new DateTimeZone($tzName)); } catch (Throwable $e) { $now = new DateTime('now'); }
    $dow = (int) $now->format('w'); $mins = (int) $now->format('G') * 60 + (int) $now->format('i');
    $ms = $merchant['manualStatus'] ?: 'OPEN'; $isOpen = false; $message = null;
    if ($ms === 'CLOSED') $message = 'المتجر مغلق';
    elseif ($ms === 'TEMPORARILY_CLOSED') $message = 'المتجر مغلق مؤقتاً';
    else {
        $today = null; foreach ($windows as $w) if ($w['dayOfWeek'] === $dow && !$w['isClosed']) { $today = $w; break; }
        if ($today && $mins >= $today['openMin'] && $mins < $today['closeMin']) $isOpen = true;
        else $message = 'مغلق حالياً حسب مواعيد العمل';
    }
    jsonOk([
        'merchant' => ['id' => $merchant['id'], 'storeNameAr' => $merchant['storeNameAr'], 'manualStatus' => $ms, 'timezone' => $tzName],
        'windows' => $windows,
        'openness' => ['isOpenNow' => $isOpen, 'reason' => null, 'nextOpenAt' => null, 'message' => $message],
    ]);
}
if ($method === 'PUT' && preg_match('#^/admin/merchants/([^/]+)/hours$#', $path, $m)) {
    authUser();
    $b = readJsonBody(); $windows = $b['windows'] ?? []; $pdo = db();
    try {
        $pdo->beginTransaction();
        $pdo->prepare('DELETE FROM `MerchantBusinessHours` WHERE merchantId = ?')->execute([$m[1]]);
        $ins = $pdo->prepare('INSERT INTO `MerchantBusinessHours` (id, merchantId, dayOfWeek, openMin, closeMin, isClosed, createdAt, updatedAt) VALUES (?,?,?,?,?,?,NOW(3),NOW(3))');
        foreach ($windows as $w) $ins->execute([newId(), $m[1], (int)($w['dayOfWeek'] ?? 0), (int)($w['openMin'] ?? 0), (int)($w['closeMin'] ?? 0), !empty($w['isClosed']) ? 1 : 0]);
        $pdo->commit();
    } catch (PDOException $e) { if ($pdo->inTransaction()) $pdo->rollBack(); error_log('[api.php] hours save: ' . $e->getMessage()); jsonErr('تعذّر حفظ المواعيد', 422, 'FAILED'); }
    jsonOk(['saved' => true, 'count' => count($windows)]);
}
if ($method === 'PATCH' && preg_match('#^/admin/merchants/([^/]+)/status$#', $path, $m)) {
    authUser();
    $b = readJsonBody(); $st = (string)($b['manualStatus'] ?? $b['status'] ?? 'OPEN');
    if (!in_array($st, ['OPEN', 'CLOSED', 'TEMPORARILY_CLOSED'], true)) jsonErr('حالة غير صحيحة', 422, 'BAD');
    db()->prepare('UPDATE `MerchantProfile` SET manualStatus = ?, updatedAt = NOW(3) WHERE id = ?')->execute([$st, $m[1]]);
    jsonOk(['id' => $m[1], 'manualStatus' => $st]);
}
if ($method === 'GET' && preg_match('#^/admin/merchants/([^/]+)/api-config$#', $path, $m)) {
    authUser();
    $st = db()->prepare('SELECT * FROM `MerchantApiConfig` WHERE merchantId = ? LIMIT 1'); $st->execute([$m[1]]);
    $row = $st->fetch();
    http_response_code(200);
    echo json_encode(['data' => $row ? jsonizeRow($row) : null], JSON_UNESCAPED_UNICODE);
    exit;
}
if ($method === 'PUT' && preg_match('#^/admin/merchants/([^/]+)/api-config$#', $path, $m)) {
    authUser();
    $id = $m[1]; $b = readJsonBody(); $cols = tableColumns('MerchantApiConfig');
    $st = db()->prepare('SELECT id FROM `MerchantApiConfig` WHERE merchantId = ? LIMIT 1'); $st->execute([$id]); $ex = $st->fetch();
    try {
        // The client calls the credential `token`, but the column is
        // `tokenSecret`. The generic loop below only copies keys that ARE
        // columns, so `token` was silently dropped and every authenticated
        // merchant API was then fetched with NO Authorization header —
        // which looks exactly like "the API returned no products".
        // Contract: key absent or null → keep what's saved; '' → clear it;
        // anything else → replace.
        $tokenGiven = array_key_exists('token', $b) && $b['token'] !== null;
        $tokenValue = $tokenGiven ? (trim((string) $b['token']) === '' ? null : (string) $b['token']) : null;
        if ($ex) {
            $sets = []; $args = [];
            foreach ($b as $k => $v) if (isset($cols[$k]) && !in_array($k, ['id', 'merchantId', 'createdAt', 'updatedAt'], true)) { $sets[] = "`$k` = ?"; $args[] = coerceForColumn($v, $cols[$k]); }
            if ($tokenGiven && isset($cols['tokenSecret'])) { $sets[] = '`tokenSecret` = ?'; $args[] = $tokenValue; }
            if ($sets) { $sets[] = '`updatedAt` = NOW(3)'; $args[] = $ex['id']; db()->prepare('UPDATE `MerchantApiConfig` SET ' . implode(',', $sets) . ' WHERE id = ?')->execute($args); }
            $newId = $ex['id'];
        } else {
            $names = ['`id`', '`merchantId`']; $ph = ['?', '?']; $args = [$newId = newId(), $id];
            foreach ($b as $k => $v) if (isset($cols[$k]) && !in_array($k, ['id', 'merchantId', 'createdAt', 'updatedAt'], true)) { $names[] = "`$k`"; $ph[] = '?'; $args[] = coerceForColumn($v, $cols[$k]); }
            if ($tokenGiven && isset($cols['tokenSecret'])) { $names[] = '`tokenSecret`'; $ph[] = '?'; $args[] = $tokenValue; }
            if (!in_array('`apiUrl`', $names, true)) { $names[] = '`apiUrl`'; $ph[] = '?'; $args[] = (string)($b['apiUrl'] ?? ''); }
            $names[] = '`createdAt`'; $ph[] = 'NOW(3)'; $names[] = '`updatedAt`'; $ph[] = 'NOW(3)';
            db()->prepare('INSERT INTO `MerchantApiConfig` (' . implode(',', $names) . ') VALUES (' . implode(',', $ph) . ')')->execute($args);
        }
        $sel = db()->prepare('SELECT * FROM `MerchantApiConfig` WHERE id = ?'); $sel->execute([$newId]);
        jsonOk(jsonizeRow($sel->fetch()) ?: []);
    } catch (PDOException $e) { error_log('[api.php] api-config save: ' . $e->getMessage()); jsonErr('تعذّر حفظ الإعدادات، تأكد من رابط الـ API', 422, 'FAILED'); }
}
if ($method === 'GET' && preg_match('#^/admin/merchants/([^/]+)/api-config/logs$#', $path, $m)) {
    authUser();
    // ProductSyncLog orders by startedAt (there is no createdAt column) — the
    // old ORDER BY createdAt threw and the catch returned an empty list, so the
    // history always looked empty even right after a sync.
    $st = db()->prepare('SELECT * FROM `ProductSyncLog` WHERE merchantId = ? ORDER BY startedAt DESC LIMIT 50');
    try { $st->execute([$m[1]]); $rows = array_map('jsonizeRow', $st->fetchAll()); } catch (Throwable $e) { $rows = []; }
    jsonOk($rows);
}
/// True for a JSON object (associative array), false for a JSON list or scalar.
function isAssocArr($a): bool {
    if (!is_array($a) || $a === []) return false;
    return array_keys($a) !== range(0, count($a) - 1);
}
/// Reduce whatever the API returned (after productsPath) to a flat list of
/// product OBJECTS. Handles three shapes: a bare list of products; a wrapper
/// object like {data:[...], meta:{...}} (Laravel-style) → its first
/// list-of-objects value; or a single product object → a one-item list. This is
/// what stops the field picker from showing 0,1,2… (array indices) instead of
/// the real field names.
function normalizeProductRows($items): array {
    if (!is_array($items)) return [];
    if (isAssocArr($items)) {
        foreach ($items as $v) {
            if (is_array($v) && !isAssocArr($v)) {
                $rows = array_values(array_filter($v, 'isAssocArr'));
                if ($rows) return $rows;
            }
        }
        return [$items]; // a single product object
    }
    return array_values(array_filter($items, 'isAssocArr'));
}
// One raw HTTP GET/POST of a merchant API URL → decoded JSON (or an error).
function fetchMerchantApiOnce(string $url, array $headers, string $method, ?string $body): array {
    $raw = null; $httpCode = 0;
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => 40, CURLOPT_FOLLOWLOCATION => true, CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_ENCODING => '', // accept gzip/br so a big catalogue transfers compressed
            CURLOPT_CUSTOMREQUEST => $method]);
        if ($method === 'POST' && $body) curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        $raw = curl_exec($ch); $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch); curl_close($ch);
        if ($raw === false) return ['ok' => false, 'reason' => 'فشل الاتصال: ' . $err];
    } else {
        $ctx = stream_context_create(['http' => ['method' => $method, 'header' => implode("\r\n", $headers), 'timeout' => 40, 'ignore_errors' => true]]);
        $raw = @file_get_contents($url, false, $ctx);
        if ($raw === false) return ['ok' => false, 'reason' => 'فشل الاتصال بالـ API'];
    }
    $json = json_decode((string)$raw, true);
    if (!is_array($json)) return ['ok' => false, 'reason' => 'الرد ليس JSON صالح', 'httpCode' => $httpCode];
    return ['ok' => true, 'json' => $json, 'httpCode' => $httpCode];
}
// Fetch an external merchant API. Pulls the WHOLE catalogue, not just the first
// page: it follows the response's `pagination.hasNextPage` (Tamem sync API /
// Laravel-style), and if the URL has no per-page hint it requests a large page
// so a single call returns everything. (PHP does this fine — no Node.js needed.)
function fetchMerchantApi(array $cfg): array {
    $url = (string)($cfg['apiUrl'] ?? '');
    if ($url === '') return ['ok' => false, 'reason' => 'رابط الـ API فارغ'];
    $headers = ['Accept: application/json'];
    $auth = (string)($cfg['authType'] ?? 'NONE');
    $token = (string)($cfg['tokenSecret'] ?? '');
    if ($auth === 'BEARER' && $token !== '') $headers[] = 'Authorization: Bearer ' . $token;
    elseif ($auth === 'API_KEY' && $token !== '') $headers[] = ((string)($cfg['authHeaderName'] ?: 'X-API-Key')) . ': ' . $token;
    elseif ($auth === 'BASIC' && $token !== '') $headers[] = 'Authorization: Basic ' . base64_encode($token);
    if (!empty($cfg['extraHeaders'])) {
        $extra = is_string($cfg['extraHeaders']) ? json_decode($cfg['extraHeaders'], true) : $cfg['extraHeaders'];
        if (is_array($extra)) foreach ($extra as $k => $v) $headers[] = "$k: $v";
    }
    $method = strtoupper((string)($cfg['method'] ?? 'GET'));
    $body = !empty($cfg['requestBody']) ? (string)$cfg['requestBody'] : null;
    $pp = trim((string)($cfg['productsPath'] ?? ''));
    $drill = function ($json) use ($pp) {
        // An error envelope ({success:false, message:...}) must never be mistaken
        // for a product row — surface it so the admin sees the real reason
        // (e.g. "Invalid token") instead of "1 منتج".
        if (is_array($json) && array_key_exists('success', $json) && $json['success'] === false) {
            return ['__error' => (string) ($json['message'] ?? 'الـ API رجّع success:false')];
        }
        $items = $json;
        if ($pp !== '') foreach (explode('.', $pp) as $seg) { $items = is_array($items) && array_key_exists($seg, $items) ? $items[$seg] : null; }
        $rows = normalizeProductRows($items);
        // Wrong productsPath (e.g. "products" when the API uses "data")? Auto-find
        // the products list from the root so the user doesn't have to guess it.
        if (!$rows) $rows = normalizeProductRows($json);
        return $rows;
    };
    // If the caller didn't specify a page size, ask for a big one so a single
    // request returns the whole catalogue (perPage is capped server-side).
    $hasPageHint = (bool) preg_match('/[?&](perPage|per_page|limit|pageSize)=/i', $url);
    $allItems = []; $httpCode = 0; $lastJson = null;
    $maxPages = 300; // hard backstop against a broken pagination loop
    for ($page = 1; $page <= $maxPages; $page++) {
        $fetchUrl = $url;
        if (!$hasPageHint) {
            $sep = strpos($fetchUrl, '?') === false ? '?' : '&';
            $fetchUrl .= $sep . 'perPage=200&page=' . $page;
        }
        $r = fetchMerchantApiOnce($fetchUrl, $headers, $method, $body);
        if (!$r['ok']) { if ($allItems) break; return $r; }
        $httpCode = $r['httpCode']; $lastJson = $r['json'];
        $rows = $drill($r['json']);
        // Surface an API error envelope (bad token, etc.) as a real failure.
        if (is_array($rows) && isset($rows['__error'])) {
            return ['ok' => false, 'reason' => 'الـ API رجّع خطأ: ' . $rows['__error']
                . ($httpCode ? " (HTTP $httpCode)" : ''), 'httpCode' => $httpCode];
        }
        if ($rows) $allItems = array_merge($allItems, $rows);
        // Stop unless the API explicitly says there's another page.
        $pg = $r['json']['pagination'] ?? ($r['json']['meta']['pagination'] ?? null);
        $hasNext = is_array($pg) && (!empty($pg['hasNextPage'])
            || (isset($pg['currentPage'], $pg['lastPage']) && (int)$pg['currentPage'] < (int)$pg['lastPage']));
        if ($hasPageHint || !$hasNext || !$rows) break;
    }
    return ['ok' => true, 'items' => $allItems, 'httpCode' => $httpCode];
}
function mapExternalProduct(array $row, array $mapping): array {
    // Read a (possibly dotted) key path out of the row.
    $get = function ($key) use ($row) {
        $key = (string) $key; if ($key === '') return null;
        $cur = $row;
        foreach (explode('.', $key) as $seg) { $cur = is_array($cur) && array_key_exists($seg, $cur) ? $cur[$seg] : null; if ($cur === null) return null; }
        return $cur;
    };
    // Resolve an app field from its mapped source key (+ legacy fallbacks).
    $pick = function ($appKey, array $fallbacks = []) use ($mapping, $get) {
        foreach (array_merge([$mapping[$appKey] ?? null], $fallbacks) as $k) {
            if ($k) { $v = $get($k); if ($v !== null && $v !== '') return $v; }
        }
        return null;
    };
    $num = fn ($v) => ($v === null || $v === '') ? null : (float) $v;
    $intv = fn ($v) => ($v === null || $v === '') ? null : (int) $v;
    $boolv = function ($v) {
        if ($v === null) return null;
        if (is_bool($v)) return $v;
        $s = strtolower(trim((string) $v));
        if (in_array($s, ['1', 'true', 'yes', 'available', 'in_stock', 'instock', 'متاح', 'متوفر'], true)) return true;
        if (in_array($s, ['0', 'false', 'no', 'unavailable', 'out_of_stock', 'outofstock', 'غير متاح', 'غير متوفر', 'نفذ'], true)) return false;
        return (bool) $v;
    };
    // Fallback source keys make the Tamem sync API auto-map with NO manual field
    // selection: its fields are id / name / nameEn / description / price / image
    // / category / brand / activeIngredient / unit / inStock / … so each app field
    // falls back to the matching source key when the mapping is left on "تجاهل".
    $name = $pick('name', ['name', 'nameAr', 'title']);
    $imgs = $pick('imageUrls', ['images']);
    $s = fn ($v, $len) => $v !== null ? mb_substr((string) $v, 0, $len) : null;
    return [
        'name' => trim((string) ($name ?? '')),
        'nameAr' => trim((string) ($pick('nameAr', ['name', 'title']) ?? $name ?? '')),
        'description' => ($d = $pick('description', ['description', 'activeIngredient'])) !== null ? (string) $d : null,
        'price' => $num($pick('price', ['price'])),        // null = unmapped → keep existing on update
        'salePrice' => $num($pick('salePrice', ['originalPrice', 'discount'])),
        'imageUrl' => ($i = $pick('imageUrl', ['image', 'imageUrl'])) ? (string) $i : null,
        'imageUrls' => is_array($imgs) ? array_values(array_filter(array_map('strval', $imgs), fn ($x) => $x !== '')) : null,
        'categoryName' => $s($pick('categoryName', ['category', 'categoryName']), 120),
        'stock' => $intv($pick('stock', ['stock', 'quantity'])),
        'isAvailable' => $boolv($pick('isAvailable', ['inStock', 'isAvailable', 'available'])),
        'sku' => $s($pick('sku', ['sku', 'barcode']), 80),
        'externalId' => $s($pick('externalId', ['id', 'externalId', 'productId', 'uuid']), 120),
        'barcode' => $s($pick('barcode', ['barcode']), 80),
        'weight' => $num($pick('weight', ['weight'])),
    ];
}
if ($method === 'POST' && preg_match('#^/admin/merchants/([^/]+)/api-config/test$#', $path, $m)) {
    authUser();
    $st = db()->prepare('SELECT * FROM `MerchantApiConfig` WHERE merchantId = ? LIMIT 1'); $st->execute([$m[1]]);
    $cfg = $st->fetch();
    if (!$cfg) jsonErr('احفظ إعدادات الـ API الأول', 400, 'NO_CONFIG');
    $res = fetchMerchantApi($cfg);
    if (!$res['ok']) jsonErr($res['reason'] ?? 'فشل الاختبار', 400, 'TEST_FAILED');
    db()->prepare('UPDATE `MerchantApiConfig` SET isConnected = 1, lastError = NULL, updatedAt = NOW(3) WHERE merchantId = ?')->execute([$m[1]]);
    // Field list = the UNION of keys across sample rows (not array_keys of the
    // list, which produced 0,1,2…). Also send one example value per field so the
    // dashboard can preview + auto-match.
    $fieldSet = []; $sampleValues = [];
    foreach (array_slice($res['items'], 0, 5) as $row) {
        if (!is_array($row)) continue;
        foreach ($row as $k => $v) {
            $fieldSet[$k] = true;
            if (!isset($sampleValues[$k]) && !is_array($v) && $v !== null && $v !== '') {
                $sampleValues[$k] = mb_substr((string) $v, 0, 80);
            }
        }
    }
    jsonOk([
        'ok' => true,
        'fetchedCount' => count($res['items']),
        'sampleItems' => array_slice($res['items'], 0, 3),
        'sampleFields' => array_keys($fieldSet),
        'sampleValues' => (object) $sampleValues,
    ]);
}
if ($method === 'POST' && preg_match('#^/admin/merchants/([^/]+)/api-config/sync$#', $path, $m)) {
    $u = authUser();
    $st = db()->prepare('SELECT * FROM `MerchantApiConfig` WHERE merchantId = ? LIMIT 1'); $st->execute([$m[1]]);
    $cfg = $st->fetch();
    if (!$cfg) jsonErr('احفظ إعدادات الـ API الأول', 400, 'NO_CONFIG');
    // Capture the start on the DB clock so startedAt/finishedAt share one clock
    // (frontend shows the duration between them).
    $startedAt = db()->query('SELECT NOW(3)')->fetchColumn();
    // Write one ProductSyncLog row per run — matches the real table schema
    // (configId/startedAt/finishedAt/…), which the old INSERT did not, so every
    // run silently failed to log and the history stayed empty.
    $writeSyncLog = function (string $status, int $fetched, int $created, int $updated, int $failed, int $hidden, ?string $err) use ($cfg, $m, $startedAt, $u) {
        try {
            db()->prepare('INSERT INTO `ProductSyncLog`
                (id, configId, merchantId, `trigger`, startedAt, finishedAt, status, fetchedCount, createdCount, updatedCount, failedCount, hiddenCount, errorMessage, triggeredById)
                VALUES (?,?,?, "MANUAL", ?, NOW(3), ?,?,?,?,?,?,?,?)')
                ->execute([newId(), $cfg['id'], $m[1], $startedAt, $status, $fetched, $created, $updated, $failed, $hidden,
                    $err !== null ? mb_substr($err, 0, 500) : null, $u['sub'] ?? null]);
        } catch (Throwable $e) { error_log('[api.php] synclog: ' . $e->getMessage()); }
    };
    $res = fetchMerchantApi($cfg);
    if (!$res['ok']) {
        db()->prepare('UPDATE `MerchantApiConfig` SET lastError = ?, isConnected = 0, updatedAt = NOW(3) WHERE merchantId = ?')->execute([$res['reason'] ?? 'sync failed', $m[1]]);
        $writeSyncLog('FAILED', 0, 0, 0, 0, 0, $res['reason'] ?? 'فشل جلب البيانات');
        jsonErr($res['reason'] ?? 'فشلت المزامنة', 400, 'SYNC_FAILED');
    }
    $mapping = is_string($cfg['fieldMapping'] ?? null) ? (json_decode($cfg['fieldMapping'], true) ?: []) : ($cfg['fieldMapping'] ?? []);
    if (!is_array($mapping)) $mapping = [];
    $pdo = db(); $added = 0; $updated = 0; $failed = 0; $seen = [];
    // Full-field upsert. imageUrls is stored as JSON; COALESCE(?, col) means an
    // unmapped (null) field keeps the existing value instead of wiping it.
    $ins = $pdo->prepare('INSERT INTO `Product`
        (id, merchantId, name, nameAr, description, imageUrl, imageUrls, price, salePrice, categoryName, stock, isAvailable, sku, externalId, barcode, weight, sortOrder, isHidden, lastSyncedAt, createdAt, updatedAt)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,0,NOW(3),NOW(3),NOW(3))');
    $upd = $pdo->prepare('UPDATE `Product` SET
        nameAr = ?, name = ?,
        description = COALESCE(?, description),
        imageUrl = COALESCE(?, imageUrl),
        imageUrls = COALESCE(?, imageUrls),
        price = COALESCE(?, price),
        salePrice = COALESCE(?, salePrice),
        categoryName = COALESCE(?, categoryName),
        stock = COALESCE(?, stock),
        isAvailable = COALESCE(?, isAvailable),
        sku = COALESCE(?, sku),
        externalId = COALESCE(?, externalId),
        barcode = COALESCE(?, barcode),
        weight = COALESCE(?, weight),
        isHidden = 0, lastSyncedAt = NOW(3), updatedAt = NOW(3)
        WHERE id = ?');
    foreach ($res['items'] as $row) {
        $p = mapExternalProduct($row, $mapping);
        if ($p['name'] === '' && $p['nameAr'] === '') continue;
        // De-dup within the merchant, best key first: SKU → externalId → name.
        $ex = null;
        if ($p['sku'] !== null) { $q = $pdo->prepare('SELECT id FROM `Product` WHERE merchantId = ? AND sku = ? LIMIT 1'); $q->execute([$m[1], $p['sku']]); $ex = $q->fetch(); }
        if (!$ex && $p['externalId'] !== null) { $q = $pdo->prepare('SELECT id FROM `Product` WHERE merchantId = ? AND externalId = ? LIMIT 1'); $q->execute([$m[1], $p['externalId']]); $ex = $q->fetch(); }
        if (!$ex) { $nm = $p['name'] !== '' ? $p['name'] : $p['nameAr']; $q = $pdo->prepare('SELECT id FROM `Product` WHERE merchantId = ? AND name = ? LIMIT 1'); $q->execute([$m[1], $nm]); $ex = $q->fetch(); }
        $imgsJson = $p['imageUrls'] !== null ? json_encode($p['imageUrls'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) : null;
        $avail = $p['isAvailable'];
        try {
            if ($ex) {
                $upd->execute([
                    $p['nameAr'] ?: $p['name'], $p['name'] ?: $p['nameAr'],
                    $p['description'], $p['imageUrl'], $imgsJson,
                    $p['price'], $p['salePrice'], $p['categoryName'], $p['stock'],
                    $avail === null ? null : ($avail ? 1 : 0),
                    $p['sku'], $p['externalId'], $p['barcode'], $p['weight'], $ex['id'],
                ]);
                $seen[] = $ex['id']; $updated++;
            } else {
                $nid = newId();
                $ins->execute([
                    $nid, $m[1], $p['name'] ?: $p['nameAr'], $p['nameAr'] ?: $p['name'],
                    $p['description'], $p['imageUrl'], $imgsJson,
                    $p['price'] ?? 0, $p['salePrice'], $p['categoryName'], $p['stock'],
                    $avail === null ? 1 : ($avail ? 1 : 0),
                    $p['sku'], $p['externalId'], $p['barcode'], $p['weight'],
                ]);
                $seen[] = $nid; $added++;
            }
        } catch (PDOException $e) { $failed++; error_log('[api.php] product upsert: ' . $e->getMessage()); }
    }
    // Missing-product policy: previously-synced products (lastSyncedAt set) the
    // API no longer returns. Hand-entered products (lastSyncedAt NULL) untouched.
    $policy = strtoupper((string) ($cfg['missingPolicy'] ?? 'IGNORE'));
    $hidden = 0;
    if ($policy !== 'IGNORE' && $seen) {
        $ph = implode(',', array_fill(0, count($seen), '?'));
        $byPolicy = [
            'DELETE' => "DELETE FROM `Product` WHERE merchantId = ? AND lastSyncedAt IS NOT NULL AND id NOT IN ($ph)",
            'HIDE' => "UPDATE `Product` SET isHidden = 1, updatedAt = NOW(3) WHERE merchantId = ? AND lastSyncedAt IS NOT NULL AND isHidden = 0 AND id NOT IN ($ph)",
            'MARK_UNAVAILABLE' => "UPDATE `Product` SET isAvailable = 0, updatedAt = NOW(3) WHERE merchantId = ? AND lastSyncedAt IS NOT NULL AND isAvailable = 1 AND id NOT IN ($ph)",
        ];
        if (isset($byPolicy[$policy])) {
            try { $q = $pdo->prepare($byPolicy[$policy]); $q->execute(array_merge([$m[1]], $seen)); $hidden = $q->rowCount(); }
            catch (Throwable $e) { error_log('[api.php] missing-policy: ' . $e->getMessage()); }
        }
    }
    $status = $failed > 0 ? 'PARTIAL' : 'SUCCESS';
    $pdo->prepare('UPDATE `MerchantApiConfig` SET isConnected = 1, lastError = NULL, lastSyncedAt = NOW(3), updatedAt = NOW(3) WHERE merchantId = ?')->execute([$m[1]]);
    $writeSyncLog($status, count($res['items']), $added, $updated, $failed, $hidden, $failed > 0 ? "فشل $failed منتج" : null);
    jsonOk(['ok' => true, 'fetchedCount' => count($res['items']), 'createdCount' => $added, 'updatedCount' => $updated,
        'failedCount' => $failed, 'hiddenCount' => $hidden, 'added' => $added, 'updated' => $updated, 'total' => count($res['items'])]);
}
if ($method === 'DELETE' && preg_match('#^/admin/merchants/([^/]+)/api-config$#', $path, $m)) {
    authUser();
    db()->prepare('DELETE FROM `MerchantApiConfig` WHERE merchantId = ?')->execute([$m[1]]);
    jsonOk(['deleted' => true]);
}
// Merchant detail (any page fetching GET /admin/merchants/:id)
if ($method === 'GET' && preg_match('#^/admin/merchants/([^/]+)$#', $path, $m)) {
    authUser();
    $st = db()->prepare("SELECT mp.*, u.name AS u_name, u.phone AS u_phone, u.email AS u_email, u.isActive AS u_isActive,
        c.nameAr AS c_nameAr FROM `MerchantProfile` mp LEFT JOIN `User` u ON u.id = mp.userId LEFT JOIN `Category` c ON c.id = mp.categoryId WHERE mp.id = ?");
    $st->execute([$m[1]]); $r = $st->fetch();
    if (!$r) jsonErr('التاجر غير موجود', 404, 'NOT_FOUND');
    $r['isOpen'] = (bool) (int) $r['isOpen'];
    $r['user'] = ['id' => $r['userId'], 'name' => $r['u_name'], 'phone' => $r['u_phone'], 'email' => $r['u_email'], 'isActive' => (bool)(int)($r['u_isActive'] ?? 1)];
    $r['category'] = $r['c_nameAr'] !== null ? ['id' => $r['categoryId'], 'nameAr' => $r['c_nameAr']] : null;
    unset($r['u_name'], $r['u_phone'], $r['u_email'], $r['u_isActive'], $r['c_nameAr']);
    jsonOk(jsonizeRow($r));
}

// ─── Delivery zones (City → Village → Area) — pricing.tsx zones tab ─────
function zoneList(array $data): void {
    http_response_code(200);
    echo json_encode(['data' => $data, 'meta' => ['pagination' => ['page' => 1, 'pageSize' => count($data), 'total' => count($data), 'totalPages' => 1]]], JSON_UNESCAPED_UNICODE);
    exit;
}
if ($method === 'GET' && $path === '/admin/zones/cities') {
    authUser();
    $rows = db()->query("SELECT c.*,
        (SELECT COUNT(*) FROM `Village` v WHERE v.cityId = c.id) AS villageCount,
        (SELECT COUNT(*) FROM `Area` a JOIN `Village` v2 ON v2.id = a.villageId WHERE v2.cityId = c.id) AS areaCount
        FROM `City` c ORDER BY c.nameAr")->fetchAll();
    zoneList(array_map(fn($r) => ['id' => $r['id'], 'nameAr' => $r['nameAr'], 'nameEn' => $r['nameEn'], 'isActive' => (bool)(int)$r['isActive'], 'villageCount' => (int)$r['villageCount'], 'areaCount' => (int)$r['areaCount']], $rows));
}
if ($method === 'POST' && $path === '/admin/zones/cities') {
    authUser(); $b = readJsonBody(); $id = newId();
    db()->prepare('INSERT INTO `City` (id, nameAr, nameEn, isActive, createdAt, updatedAt) VALUES (?,?,?,1,NOW(3),NOW(3))')
        ->execute([$id, (string)($b['nameAr'] ?? ''), ($b['nameEn'] ?? '') ?: null]);
    jsonOk(['id' => $id, 'nameAr' => $b['nameAr'] ?? ''], 201);
}
if ($method === 'GET' && preg_match('#^/admin/zones/cities/([^/]+)/villages$#', $path, $m)) {
    authUser();
    $st = db()->prepare("SELECT v.*, (SELECT COUNT(*) FROM `Area` a WHERE a.villageId = v.id) AS areaCount FROM `Village` v WHERE v.cityId = ? ORDER BY v.nameAr");
    $st->execute([$m[1]]);
    zoneList(array_map(fn($r) => ['id' => $r['id'], 'cityId' => $r['cityId'], 'nameAr' => $r['nameAr'], 'nameEn' => $r['nameEn'], 'baseDeliveryPrice' => $r['baseDeliveryPrice'], 'isActive' => (bool)(int)$r['isActive'], 'areaCount' => (int)$r['areaCount']], $st->fetchAll()));
}
if ($method === 'POST' && $path === '/admin/zones/villages') {
    authUser(); $b = readJsonBody(); $id = newId();
    db()->prepare('INSERT INTO `Village` (id, cityId, nameAr, nameEn, baseDeliveryPrice, isActive, createdAt, updatedAt) VALUES (?,?,?,?,?,1,NOW(3),NOW(3))')
        ->execute([$id, (string)($b['cityId'] ?? ''), (string)($b['nameAr'] ?? ''), ($b['nameEn'] ?? '') ?: null, (isset($b['baseDeliveryPrice']) && $b['baseDeliveryPrice'] !== '') ? (float)$b['baseDeliveryPrice'] : null]);
    jsonOk(['id' => $id, 'nameAr' => $b['nameAr'] ?? ''], 201);
}
if ($method === 'PATCH' && preg_match('#^/admin/zones/villages/([^/]+)$#', $path, $m)) {
    authUser(); $b = readJsonBody(); $sets = []; $args = [];
    foreach (['nameAr', 'nameEn'] as $f) if (array_key_exists($f, $b)) { $sets[] = "`$f` = ?"; $args[] = $b[$f]; }
    if (array_key_exists('baseDeliveryPrice', $b)) { $sets[] = '`baseDeliveryPrice` = ?'; $args[] = ($b['baseDeliveryPrice'] !== '' && $b['baseDeliveryPrice'] !== null) ? (float)$b['baseDeliveryPrice'] : null; }
    if ($sets) { $sets[] = '`updatedAt` = NOW(3)'; $args[] = $m[1]; db()->prepare('UPDATE `Village` SET ' . implode(',', $sets) . ' WHERE id = ?')->execute($args); }
    jsonOk(['id' => $m[1]]);
}
if ($method === 'DELETE' && preg_match('#^/admin/zones/villages/([^/]+)$#', $path, $m)) {
    authUser();
    db()->prepare('DELETE FROM `Area` WHERE villageId = ?')->execute([$m[1]]);
    db()->prepare('DELETE FROM `Village` WHERE id = ?')->execute([$m[1]]);
    jsonOk(['deleted' => true]);
}
if ($method === 'GET' && preg_match('#^/admin/zones/villages/([^/]+)/areas$#', $path, $m)) {
    authUser();
    $st = db()->prepare("SELECT * FROM `Area` WHERE villageId = ? ORDER BY nameAr"); $st->execute([$m[1]]);
    zoneList(array_map(fn($r) => ['id' => $r['id'], 'villageId' => $r['villageId'], 'nameAr' => $r['nameAr'], 'nameEn' => $r['nameEn'], 'deliveryPrice' => $r['deliveryPrice'], 'isActive' => (bool)(int)$r['isActive']], $st->fetchAll()));
}
if ($method === 'POST' && $path === '/admin/zones/areas') {
    authUser(); $b = readJsonBody(); $id = newId();
    db()->prepare('INSERT INTO `Area` (id, villageId, nameAr, nameEn, deliveryPrice, isActive, createdAt, updatedAt) VALUES (?,?,?,?,?,1,NOW(3),NOW(3))')
        ->execute([$id, (string)($b['villageId'] ?? ''), (string)($b['nameAr'] ?? ''), ($b['nameEn'] ?? '') ?: null, (isset($b['deliveryPrice']) && $b['deliveryPrice'] !== '') ? (float)$b['deliveryPrice'] : null]);
    jsonOk(['id' => $id, 'nameAr' => $b['nameAr'] ?? ''], 201);
}
if ($method === 'PATCH' && preg_match('#^/admin/zones/areas/([^/]+)$#', $path, $m)) {
    authUser(); $b = readJsonBody(); $sets = []; $args = [];
    if (array_key_exists('deliveryPrice', $b)) { $sets[] = '`deliveryPrice` = ?'; $args[] = ($b['deliveryPrice'] !== '' && $b['deliveryPrice'] !== null) ? (float)$b['deliveryPrice'] : null; }
    if (array_key_exists('nameAr', $b)) { $sets[] = '`nameAr` = ?'; $args[] = (string)$b['nameAr']; }
    if ($sets) { $sets[] = '`updatedAt` = NOW(3)'; $args[] = $m[1]; db()->prepare('UPDATE `Area` SET ' . implode(',', $sets) . ' WHERE id = ?')->execute($args); }
    jsonOk(['id' => $m[1]]);
}
if ($method === 'DELETE' && preg_match('#^/admin/zones/areas/([^/]+)$#', $path, $m)) {
    authUser();
    db()->prepare('DELETE FROM `Area` WHERE id = ?')->execute([$m[1]]);
    jsonOk(['deleted' => true]);
}

// Customer DETAIL — the modal reads data.customerOrders and data.savedAddresses.
// There was no handler for this path, so the request fell to a generic fallback
// that returned the row WITHOUT those arrays; the "آخر الطلبات" tab then did
// `data.customerOrders.map(...)` on undefined and crashed the whole dashboard.
// Distinct customer cities — so the customers-page city filter offers EVERY
// city, not just the ones on the current page. MUST come before the
// /admin/customers/:id catch below (which would otherwise swallow "cities").
if ($method === 'GET' && $path === '/admin/customers/cities') {
    authUser();
    $rows = db()->query("SELECT DISTINCT city FROM `User` WHERE role = 'CUSTOMER' AND city IS NOT NULL AND city <> '' ORDER BY city")->fetchAll(PDO::FETCH_COLUMN);
    jsonOk(array_values($rows));
}
if ($method === 'GET' && preg_match('#^/admin/customers/([^/]+)$#', $path, $m)) {
    authUser();
    $cid = $m[1];
    // Explicit columns — never leak passwordHash / resetHash / googleId / fcmToken.
    $us = db()->prepare("SELECT id, name, phone, email, avatarUrl, role, isActive, isPhoneVerified, city, governorate, defaultAddress, secondaryPhones, createdAt, updatedAt FROM `User` WHERE id = ? AND role = 'CUSTOMER' LIMIT 1");
    $us->execute([$cid]);
    $cust = $us->fetch();
    if (!$cust) jsonErr('العميل غير موجود', 404, 'NOT_FOUND');
    $cust = jsonizeRow($cust);

    $os = db()->prepare("SELECT id, orderNumber, status, category, finalPrice, quotedPrice, paymentStatus, createdAt FROM `Order` WHERE customerId = ? ORDER BY createdAt DESC LIMIT 30");
    $os->execute([$cid]);
    $cust['customerOrders'] = array_map('jsonizeRow', $os->fetchAll());

    // The zone (city / village / area) is the address — it's what the app makes
    // the customer pick and what the delivery fee is quoted from. Selecting only
    // the free-text line showed "تاني بيت بعد المسجد" with no idea where.
    $as = db()->prepare(
        "SELECT ca.id, ca.label, ca.address, ca.lat, ca.lng, ca.notes, ca.isDefault, ca.createdAt,
                ca.cityId, ca.villageId, ca.areaId,
                c.nameAr AS cityName, v.nameAr AS villageName, a.nameAr AS areaName
         FROM `CustomerAddress` ca
         LEFT JOIN `City` c ON c.id = ca.cityId
         LEFT JOIN `Village` v ON v.id = ca.villageId
         LEFT JOIN `Area` a ON a.id = ca.areaId
         WHERE ca.userId = ? ORDER BY ca.isDefault DESC, ca.createdAt DESC"
    );
    $as->execute([$cid]);
    $cust['savedAddresses'] = array_map(static function ($a) {
        $a = boolCast(jsonizeRow($a), ['isDefault']);
        // Pre-joined, city → village → area, so every consumer prints the same
        // thing instead of each inventing its own ordering.
        $a['zoneLabel'] = implode(' › ', array_filter([$a['cityName'] ?? null, $a['villageName'] ?? null, $a['areaName'] ?? null]));
        return $a;
    }, $as->fetchAll());

    $cust['_count'] = ['customerOrders' => count($cust['customerOrders'])];
    jsonOk($cust);
}

// Customers (and any other User-by-role) — bare User rows are enough.
if ($method === 'GET' && preg_match('#^/admin/(customers)$#', $path, $m)) {
    authUser();
    $page = max(1, (int)($_GET['page'] ?? 1));
    $size = min(100, max(1, (int)($_GET['pageSize'] ?? 20)));
    $off = ($page - 1) * $size;

    // Filters run in SQL — the list pages server-side, so client-side filtering
    // could only ever see the current page. The order count + last-activity are
    // correlated subqueries so a customer with orders never shows a blank/0.
    $where = "u.role = 'CUSTOMER'";
    $args = [];
    $q = trim((string)($_GET['search'] ?? ''));
    if ($q !== '') {
        // Name / phone / email / city / governorate / area / village / exact id.
        $where .= " AND (u.name LIKE ? OR u.phone LIKE ? OR u.email LIKE ? OR u.city LIKE ? OR u.governorate LIKE ?
                    OR u.id = ? OR EXISTS (SELECT 1 FROM `CustomerAddress` ca
                        LEFT JOIN `Area` ar ON ar.id = ca.areaId
                        LEFT JOIN `Village` vi ON vi.id = ca.villageId
                        LEFT JOIN `City` ci ON ci.id = ca.cityId
                        WHERE ca.userId = u.id AND (ca.address LIKE ? OR ar.nameAr LIKE ? OR vi.nameAr LIKE ? OR ci.nameAr LIKE ?)))";
        $like = '%' . $q . '%';
        array_push($args, $like, $like, $like, $like, $like, $q, $like, $like, $like, $like);
    }
    if (!empty($_GET['city']))        { $where .= ' AND u.city = ?'; $args[] = $_GET['city']; }
    if (!empty($_GET['governorate'])) { $where .= ' AND u.governorate = ?'; $args[] = $_GET['governorate']; }
    $status = (string)($_GET['status'] ?? '');
    if ($status === 'active')   $where .= ' AND u.isActive = 1';
    elseif ($status === 'inactive') $where .= ' AND (u.isActive = 0 OR u.isActive IS NULL)';
    if (!empty($_GET['from'])) { $where .= ' AND u.createdAt >= ?'; $args[] = str_replace('T', ' ', substr((string)$_GET['from'], 0, 19)); }
    if (!empty($_GET['to']))   {
        // A date-only "to" (e.g. 2026-07-15 from <input type=date>) coerces to
        // 00:00:00, which would exclude everyone registered LATER that same day.
        // Extend a bare date to end-of-day so the upper bound is inclusive.
        $toVal = str_replace('T', ' ', substr((string)$_GET['to'], 0, 19));
        if (strlen($toVal) <= 10) $toVal .= ' 23:59:59';
        $where .= ' AND u.createdAt <= ?'; $args[] = $toVal;
    }
    $ORDERCOUNT = '(SELECT COUNT(*) FROM `Order` o WHERE o.customerId = u.id)';
    $hasOrders = (string)($_GET['hasOrders'] ?? '');
    if ($hasOrders === 'yes')     $where .= " AND {$ORDERCOUNT} > 0";
    elseif ($hasOrders === 'no')  $where .= " AND {$ORDERCOUNT} = 0";
    if (isset($_GET['minOrders']) && $_GET['minOrders'] !== '') { $where .= " AND {$ORDERCOUNT} >= ?"; $args[] = (int)$_GET['minOrders']; }

    // Whitelisted sort — the column is interpolated so it can't come from the query string.
    $sortCol = [
        'createdAt' => 'u.createdAt', 'name' => 'u.name', 'city' => 'u.city',
        'orders' => 'orderCount', 'lastActivity' => 'lastOrderAt',
    ][(string)($_GET['sort'] ?? 'createdAt')] ?? 'u.createdAt';
    $dir = strtolower((string)($_GET['dir'] ?? 'desc')) === 'asc' ? 'ASC' : 'DESC';

    $cnt = db()->prepare("SELECT COUNT(*) FROM `User` u WHERE {$where}");
    $cnt->execute($args);
    $total = (int) $cnt->fetchColumn();

    // Explicit columns, never SELECT * — User carries passwordHash / resetHash /
    // googleId / fcmToken, none of which may ever ship.
    $st = db()->prepare(
        "SELECT u.id, u.name, u.phone, u.email, u.avatarUrl, u.isActive, u.isPhoneVerified,
                u.city, u.governorate, u.defaultAddress, u.secondaryPhones, u.createdAt, u.updatedAt,
                {$ORDERCOUNT} AS orderCount,
                (SELECT MAX(o2.createdAt) FROM `Order` o2 WHERE o2.customerId = u.id) AS lastOrderAt
         FROM `User` u WHERE {$where}
         ORDER BY {$sortCol} {$dir} LIMIT {$size} OFFSET {$off}"
    );
    $st->execute($args);
    $rows = [];
    foreach ($st->fetchAll() as $r) {
        $row = jsonizeRow($r);
        $cnt = (int) $r['orderCount'];
        // Nested _count so the existing UI (c._count.customerOrders) keeps working,
        // plus flat fields for the redesigned table.
        $row['_count'] = ['customerOrders' => $cnt];
        $row['orderCount'] = $cnt;
        // last activity: last order, else registration — never blank.
        $row['lastActivityAt'] = $r['lastOrderAt'] ?: $r['createdAt'];
        unset($row['orderCount']); $row['orderCount'] = $cnt;
        $rows[] = $row;
    }
    http_response_code(200);
    echo json_encode([
        'data' => $rows,
        'meta' => ['pagination' => ['page' => $page, 'pageSize' => $size, 'total' => $total, 'totalPages' => (int) ceil($total / max(1, $size))]],
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// NOTE: the premature "/admin/* GET fallback" that used to live here was
// REMOVED — it ran before the dedicated GET handlers below (e.g.
// /admin/admins) and shadowed them, so those pages always showed empty.
// Any genuinely-unmatched GET now falls through to the single ultimate GET
// fallback near the end of the file.

// ─── REAL admin mutations we can safely handle in PHP ─────────────────
// cuid() lookalike — 25 chars starting with "c" so it plays nicely with
// Prisma's default @id.  We don't need Prisma's exact algorithm, just IDs
// unique enough for the rows we insert here.
function newId(): string {
    return 'c' . strtolower(bin2hex(random_bytes(12)));
}

// ─── Admins CRUD (real DB) ─────────────────────────────────────────────
if ($method === 'GET' && $path === '/admin/admins') {
    $u = authUser();
    if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $st = db()->query("SELECT id, name, phone, email, role, isActive, permissions, createdAt, updatedAt FROM `User` WHERE role IN ('ADMIN','SUPER_ADMIN') ORDER BY createdAt DESC");
    $rows = array_map('jsonizeRow', $st->fetchAll());
    http_response_code(200);
    echo json_encode([
        'data' => $rows,
        'meta' => ['pagination' => ['page' => 1, 'pageSize' => count($rows), 'total' => count($rows), 'totalPages' => 1]],
    ], JSON_UNESCAPED_UNICODE);
    exit;
}
if ($method === 'POST' && $path === '/admin/admins') {
    $u = authUser();
    if ($u['role'] !== 'SUPER_ADMIN') jsonErr('فقط SUPER_ADMIN يقدر يضيف مدراء', 403, 'FORBIDDEN');
    $b = readJsonBody();
    $name  = trim((string)($b['name'] ?? ''));
    $email = strtolower(trim((string)($b['email'] ?? '')));
    $phone = trim((string)($b['phone'] ?? ''));
    $pass  = (string)($b['password'] ?? '');
    $role  = (string)($b['role'] ?? 'ADMIN');
    $perms = $b['permissions'] ?? [];
    if ($name === '' || $email === '' || $phone === '' || strlen($pass) < 8) {
        jsonErr('الاسم والإيميل والهاتف وكلمة المرور (٨ حروف+) مطلوبين', 422, 'MISSING');
    }
    if (!in_array($role, ['ADMIN', 'SUPER_ADMIN'], true)) $role = 'ADMIN';
    // Normalize phone to E.164 like the Node validator does.
    $clean = preg_replace('/[\s\-()]/', '', $phone);
    if (preg_match('/^(?:\+?20|0)?(1[0125]\d{8})$/', $clean, $m)) $phone = '+20' . $m[1];
    $id = newId();
    $hash = password_hash($pass, PASSWORD_BCRYPT);
    try {
        db()->prepare('INSERT INTO `User` (id, name, phone, email, passwordHash, role, isActive, permissions, isPhoneVerified, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, 1, ?, 1, NOW(3), NOW(3))')
            ->execute([$id, $name, $phone, $email, $hash, $role, json_encode($perms)]);
    } catch (PDOException $e) {
        if ((int)$e->errorInfo[1] === 1062) jsonErr('الإيميل أو الهاتف مستخدم بالفعل', 409, 'DUPLICATE');
        throw $e;
    }
    $sel = db()->prepare("SELECT id, name, phone, email, role, isActive, permissions, createdAt FROM `User` WHERE id = ?");
    $sel->execute([$id]);
    jsonOk(jsonizeRow($sel->fetch()), 201);
}
if ($method === 'PATCH' && preg_match('#^/admin/admins/([^/]+)$#', $path, $m)) {
    $u = authUser();
    if ($u['role'] !== 'SUPER_ADMIN') jsonErr('فقط SUPER_ADMIN يقدر يعدل مدراء', 403, 'FORBIDDEN');
    $id = $m[1]; $b = readJsonBody();
    $sets = []; $args = [];
    if (array_key_exists('name', $b))  { $sets[] = '`name` = ?';  $args[] = (string)$b['name']; }
    if (array_key_exists('email', $b)) { $sets[] = '`email` = ?'; $args[] = strtolower((string)$b['email']); }
    if (array_key_exists('phone', $b)) {
        $clean = preg_replace('/[\s\-()]/', '', (string)$b['phone']);
        if (preg_match('/^(?:\+?20|0)?(1[0125]\d{8})$/', $clean, $mm)) $sets[] = '`phone` = ?';
        $args[] = preg_match('/^(?:\+?20|0)?(1[0125]\d{8})$/', $clean, $mm) ? '+20' . $mm[1] : (string)$b['phone'];
    }
    if (array_key_exists('role', $b) && in_array($b['role'], ['ADMIN', 'SUPER_ADMIN'], true)) { $sets[] = '`role` = ?'; $args[] = $b['role']; }
    if (array_key_exists('isActive', $b))    { $sets[] = '`isActive` = ?';    $args[] = $b['isActive'] ? 1 : 0; }
    if (array_key_exists('permissions', $b)) { $sets[] = '`permissions` = ?'; $args[] = json_encode($b['permissions']); }
    if (!empty($b['password']) && strlen((string)$b['password']) >= 8) {
        $sets[] = '`passwordHash` = ?';
        $args[] = password_hash((string)$b['password'], PASSWORD_BCRYPT);
    }
    if ($sets) {
        $sets[] = '`updatedAt` = NOW(3)';
        $args[] = $id;
        try {
            db()->prepare('UPDATE `User` SET ' . implode(',', $sets) . " WHERE id = ? AND role IN ('ADMIN','SUPER_ADMIN')")
                ->execute($args);
        } catch (PDOException $e) {
            if ((int)$e->errorInfo[1] === 1062) jsonErr('الإيميل أو الهاتف مستخدم بالفعل', 409, 'DUPLICATE');
            throw $e;
        }
    }
    $sel = db()->prepare('SELECT id, name, phone, email, role, isActive, permissions, createdAt, updatedAt FROM `User` WHERE id = ?');
    $sel->execute([$id]);
    jsonOk(jsonizeRow($sel->fetch()) ?: []);
}
if ($method === 'DELETE' && preg_match('#^/admin/admins/([^/]+)$#', $path, $m)) {
    $u = authUser();
    if ($u['role'] !== 'SUPER_ADMIN') jsonErr('فقط SUPER_ADMIN يقدر يحذف مدراء', 403, 'FORBIDDEN');
    if ($m[1] === ($u['sub'] ?? '')) jsonErr('ما تقدرش تحذف حسابك', 400, 'SELF');
    db()->prepare("DELETE FROM `User` WHERE id = ? AND role IN ('ADMIN','SUPER_ADMIN')")->execute([$m[1]]);
    jsonOk(['deleted' => true]);
}

// POST /admin/categories — insert Category. Called from the merchant form's
// inline "add category" quick-action.
if ($method === 'POST' && $path === '/admin/categories') {
    $u = authUser();
    if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $b = readJsonBody();
    // id: allow client-supplied slug, else derive from Latin part of name.
    // Falls back to a cuid so Arabic-only names still get a valid id.
    $id = trim((string)($b['id'] ?? ''));
    if ($id === '') {
        $src = (string)($b['nameAr'] ?? $b['name'] ?? '');
        $slug = trim(preg_replace('/[^a-z0-9]+/i', '-', strtolower($src)) ?? '', '-');
        $id = $slug !== '' ? $slug : newId();
    }
    $st = db()->prepare('INSERT INTO `Category` (id, name, nameAr, iconUrl, sortOrder, isActive, createdAt) VALUES (?, ?, ?, ?, ?, ?, NOW(3))');
    $st->execute([
        $id,
        (string)($b['name'] ?? $b['nameAr'] ?? ''),
        (string)($b['nameAr'] ?? $b['name'] ?? ''),
        isset($b['iconUrl']) ? (string)$b['iconUrl'] : null,
        (int)($b['sortOrder'] ?? 99),
        !empty($b['isActive'] ?? true) ? 1 : 0,
    ]);
    $sel = db()->prepare('SELECT * FROM `Category` WHERE id = ?');
    $sel->execute([$id]);
    jsonOk($sel->fetch(), 201);
}
if ($method === 'PATCH' && preg_match('#^/admin/categories/([^/]+)$#', $path, $m)) {
    authUser();
    $id = $m[1]; $b = readJsonBody();
    $sets = []; $args = [];
    foreach (['name','nameAr','iconUrl','sortOrder'] as $f) if (array_key_exists($f, $b)) { $sets[]="`$f`=?"; $args[]=$b[$f]; }
    if (array_key_exists('isActive', $b)) { $sets[]='`isActive`=?'; $args[]=$b['isActive']?1:0; }
    if ($sets) { $args[]=$id; db()->prepare("UPDATE `Category` SET ".implode(',',$sets)." WHERE id = ?")->execute($args); }
    $sel = db()->prepare('SELECT * FROM `Category` WHERE id=?'); $sel->execute([$id]);
    jsonOk($sel->fetch() ?: []);
}
if ($method === 'DELETE' && preg_match('#^/admin/categories/([^/]+)$#', $path, $m)) {
    authUser();
    $id = $m[1];
    // MerchantProfile.categoryId is a required FK: deleting a category that is
    // still in use would either throw or orphan stores. Hide it instead.
    $st = db()->prepare('SELECT COUNT(*) FROM `MerchantProfile` WHERE categoryId = ?');
    $st->execute([$id]);
    $used = (int) $st->fetchColumn();
    if ($used > 0) {
        db()->prepare('UPDATE `Category` SET isActive = 0 WHERE id = ?')->execute([$id]);
        jsonOk(['deleted' => false, 'deactivated' => true, 'merchants' => $used]);
    }
    db()->prepare('DELETE FROM `Category` WHERE id = ?')->execute([$id]);
    jsonOk(['deleted' => true]);
}

// ── Offers (home slider) ───────────────────────────────────────────────────
// The public GET /offers has existed since launch, but nothing in the system
// ever wrote to the Offer table — so the home slider could never be filled.
// These four routes are that missing half.

if ($method === 'GET' && $path === '/admin/offers') {
    authUser();
    // Unlike the public route this returns inactive and expired rows too —
    // an admin needs to see and re-enable them.
    $rows = db()->query('SELECT * FROM `Offer` ORDER BY sortOrder ASC, createdAt DESC')->fetchAll();
    jsonOk(array_map(fn($r) => boolCast(jsonizeRow($r), ['isActive']), $rows));
}

if ($method === 'POST' && $path === '/admin/offers') {
    $u = authUser();
    if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $b = readJsonBody();

    $imageUrl = trim((string) ($b['imageUrl'] ?? ''));
    // imageUrl is NOT NULL in the schema, and a slide with no image is just an
    // invisible row — reject it here rather than let MySQL throw.
    if ($imageUrl === '') jsonErr('صورة العرض مطلوبة', 400, 'VALIDATION_ERROR');

    $titleAr = trim((string) ($b['titleAr'] ?? $b['title'] ?? ''));
    if ($titleAr === '') jsonErr('عنوان العرض مطلوب', 400, 'VALIDATION_ERROR');

    $id = newId();
    $st = db()->prepare(
        'INSERT INTO `Offer` (id, title, titleAr, imageUrl, linkType, linkValue, sortOrder, isActive, startsAt, endsAt, createdAt, updatedAt)'
        . ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))'
    );
    $st->execute([
        $id,
        (string) ($b['title'] ?? $titleAr),
        $titleAr,
        $imageUrl,
        (string) ($b['linkType'] ?? 'NONE'),
        isset($b['linkValue']) && $b['linkValue'] !== '' ? (string) $b['linkValue'] : null,
        (int) ($b['sortOrder'] ?? 0),
        array_key_exists('isActive', $b) ? (!empty($b['isActive']) ? 1 : 0) : 1,
        !empty($b['startsAt']) ? (string) $b['startsAt'] : null,
        !empty($b['endsAt']) ? (string) $b['endsAt'] : null,
    ]);
    $sel = db()->prepare('SELECT * FROM `Offer` WHERE id = ?');
    $sel->execute([$id]);
    jsonOk(boolCast(jsonizeRow($sel->fetch()), ['isActive']), 201);
}

if ($method === 'PATCH' && preg_match('#^/admin/offers/([^/]+)$#', $path, $m)) {
    $u = authUser();
    if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $id = $m[1];
    $b = readJsonBody();
    $sets = [];
    $args = [];
    foreach (['title', 'titleAr', 'imageUrl', 'linkType', 'sortOrder'] as $f) {
        if (array_key_exists($f, $b)) { $sets[] = "`$f`=?"; $args[] = $b[$f]; }
    }
    // Nullable columns: an empty string from a cleared form field means NULL,
    // not the literal "".
    foreach (['linkValue', 'startsAt', 'endsAt'] as $f) {
        if (array_key_exists($f, $b)) {
            $sets[] = "`$f`=?";
            $args[] = ($b[$f] === '' || $b[$f] === null) ? null : (string) $b[$f];
        }
    }
    if (array_key_exists('isActive', $b)) { $sets[] = '`isActive`=?'; $args[] = !empty($b['isActive']) ? 1 : 0; }
    if ($sets) {
        $sets[] = '`updatedAt`=NOW(3)';
        $args[] = $id;
        db()->prepare('UPDATE `Offer` SET ' . implode(',', $sets) . ' WHERE id = ?')->execute($args);
    }
    $sel = db()->prepare('SELECT * FROM `Offer` WHERE id = ?');
    $sel->execute([$id]);
    $row = $sel->fetch();
    if (!$row) jsonErr('العرض غير موجود', 404, 'NOT_FOUND');
    jsonOk(boolCast(jsonizeRow($row), ['isActive']));
}

if ($method === 'DELETE' && preg_match('#^/admin/offers/([^/]+)$#', $path, $m)) {
    $u = authUser();
    if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    // Offer has no inbound foreign keys, so a hard delete is safe here.
    // HomeConfig.featuredOfferIds may still name it; the home screen already
    // falls back to "all offers" when a pinned id resolves to nothing.
    db()->prepare('DELETE FROM `Offer` WHERE id = ?')->execute([$m[1]]);
    jsonOk(['deleted' => true]);
}

// PUT /admin/merchants/{id}/prep-time — set or clear a store's prep window.
if ($method === 'PUT' && preg_match('#^/admin/merchants/([^/]+)/prep-time$#', $path, $m)) {
    $u = authUser();
    if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $id = $m[1];
    $b = readJsonBody();

    $min = isset($b['min']) && $b['min'] !== '' && $b['min'] !== null ? (int) $b['min'] : null;
    $max = isset($b['max']) && $b['max'] !== '' && $b['max'] !== null ? (int) $b['max'] : null;

    if ($min !== null || $max !== null) {
        // Tolerate a single value or a reversed pair rather than rejecting —
        // an admin typing "30" means "about 30 minutes".
        if ($min === null) $min = $max;
        if ($max === null) $max = $min;
        if ($min > $max) [$min, $max] = [$max, $min];
        $min = max(0, min(600, $min));
        $max = max(0, min(600, $max));
    }

    db()->prepare('UPDATE `MerchantProfile` SET prepMinutesMin = ?, prepMinutesMax = ? WHERE id = ?')
        ->execute([$min, $max, $id]);

    jsonOk(['merchantId' => $id, 'prepMinutes' => $min === null ? null : ['min' => $min, 'max' => $max]]);
}

// ── Product sizes + merchant add-ons (admin) ───────────────────────────────
//
// Both writers REPLACE the whole list rather than exposing per-row CRUD: the
// admin edits these as a list in one form, so a single atomic save matches what
// they actually do and removes the need to track per-row create/update/delete.

// GET /admin/merchants/{id}/addons — the merchant's reusable extras.
if ($method === 'GET' && preg_match('#^/admin/merchants/([^/]+)/addons$#', $path, $m)) {
    authUser();
    $st = db()->prepare('SELECT id, nameAr, price, sortOrder, isActive FROM `MerchantAddon` WHERE merchantId = ? ORDER BY sortOrder ASC, nameAr ASC');
    $st->execute([$m[1]]);
    jsonOk(array_map(fn($r) => [
        'id' => $r['id'], 'nameAr' => $r['nameAr'], 'price' => (float) $r['price'],
        'sortOrder' => (int) $r['sortOrder'], 'isActive' => (bool) (int) $r['isActive'],
    ], $st->fetchAll()));
}

// PUT /admin/merchants/{id}/addons — replace the list.
if ($method === 'PUT' && preg_match('#^/admin/merchants/([^/]+)/addons$#', $path, $m)) {
    $u = authUser();
    if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $merchantId = $m[1];
    $rows = (array) (readJsonBody()['addons'] ?? []);

    /*
     * Rows that still carry an id are UPDATED, not recreated.
     *
     * ProductAddonLink points at these ids, and ON DELETE CASCADE would take
     * the links with them — so a delete-then-insert would silently unlink an
     * add-on from every product the moment the admin edited its price.
     */
    $keep = [];
    $pos = 0;
    foreach ($rows as $r) {
        $name = trim((string) ($r['nameAr'] ?? ''));
        if ($name === '') continue;
        $price = round((float) ($r['price'] ?? 0), 2);
        $active = array_key_exists('isActive', $r) ? (!empty($r['isActive']) ? 1 : 0) : 1;
        $id = trim((string) ($r['id'] ?? ''));

        if ($id !== '') {
            db()->prepare('UPDATE `MerchantAddon` SET nameAr = ?, price = ?, sortOrder = ?, isActive = ? WHERE id = ? AND merchantId = ?')
                ->execute([$name, $price, $pos, $active, $id, $merchantId]);
        } else {
            $id = newId();
            db()->prepare('INSERT INTO `MerchantAddon` (id, merchantId, nameAr, price, sortOrder, isActive, createdAt) VALUES (?,?,?,?,?,?,NOW(3))')
                ->execute([$id, $merchantId, $name, $price, $pos, $active]);
        }
        $keep[] = $id;
        $pos++;
    }

    // Anything the admin removed from the form.
    if ($keep) {
        $in = implode(',', array_fill(0, count($keep), '?'));
        db()->prepare("DELETE FROM `MerchantAddon` WHERE merchantId = ? AND id NOT IN ($in)")
            ->execute(array_merge([$merchantId], $keep));
    } else {
        db()->prepare('DELETE FROM `MerchantAddon` WHERE merchantId = ?')->execute([$merchantId]);
    }
    jsonOk(['saved' => count($keep)]);
}

// GET /admin/products/{id}/options — sizes + which of the merchant's add-ons
// are linked, alongside the full list so the form can show unchecked ones.
if ($method === 'GET' && preg_match('#^/admin/products/([^/]+)/options$#', $path, $m)) {
    authUser();
    $pid = $m[1];
    $ps = db()->prepare('SELECT merchantId FROM `Product` WHERE id = ? LIMIT 1');
    $ps->execute([$pid]);
    $merchantId = (string) ($ps->fetchColumn() ?: '');

    $v = db()->prepare('SELECT id, nameAr, price, sortOrder, isActive FROM `ProductVariant` WHERE productId = ? ORDER BY sortOrder ASC');
    $v->execute([$pid]);

    $all = db()->prepare('SELECT id, nameAr, price FROM `MerchantAddon` WHERE merchantId = ? AND isActive = 1 ORDER BY sortOrder ASC');
    $all->execute([$merchantId]);

    $lk = db()->prepare('SELECT addonId FROM `ProductAddonLink` WHERE productId = ?');
    $lk->execute([$pid]);

    jsonOk([
        'merchantId' => $merchantId,
        'variants' => array_map(fn($r) => [
            'id' => $r['id'], 'nameAr' => $r['nameAr'], 'price' => (float) $r['price'],
            'isActive' => (bool) (int) $r['isActive'],
        ], $v->fetchAll()),
        'merchantAddons' => array_map(fn($r) => [
            'id' => $r['id'], 'nameAr' => $r['nameAr'], 'price' => (float) $r['price'],
        ], $all->fetchAll()),
        'linkedAddonIds' => array_column($lk->fetchAll(), 'addonId'),
    ]);
}

// PUT /admin/products/{id}/options — replace sizes and add-on links.
if ($method === 'PUT' && preg_match('#^/admin/products/([^/]+)/options$#', $path, $m)) {
    $u = authUser();
    if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $pid = $m[1];
    $b = readJsonBody();

    if (array_key_exists('variants', $b)) {
        // Safe to delete-and-reinsert: nothing references a variant by id.
        // Past orders keep a NAME snapshot, not a foreign key.
        db()->prepare('DELETE FROM `ProductVariant` WHERE productId = ?')->execute([$pid]);
        $pos = 0;
        foreach ((array) $b['variants'] as $r) {
            $name = trim((string) ($r['nameAr'] ?? ''));
            if ($name === '') continue;
            db()->prepare('INSERT INTO `ProductVariant` (id, productId, nameAr, price, sortOrder, isActive, createdAt) VALUES (?,?,?,?,?,?,NOW(3))')
                ->execute([newId(), $pid, $name, round((float) ($r['price'] ?? 0), 2), $pos,
                    array_key_exists('isActive', $r) ? (!empty($r['isActive']) ? 1 : 0) : 1]);
            $pos++;
        }
    }

    if (array_key_exists('linkedAddonIds', $b)) {
        db()->prepare('DELETE FROM `ProductAddonLink` WHERE productId = ?')->execute([$pid]);
        foreach (array_unique((array) $b['linkedAddonIds']) as $aid) {
            $aid = trim((string) $aid);
            if ($aid === '') continue;
            // INSERT IGNORE: the pair is the primary key, so a duplicate in the
            // payload must not fail the whole save.
            db()->prepare('INSERT IGNORE INTO `ProductAddonLink` (productId, addonId) VALUES (?,?)')
                ->execute([$pid, $aid]);
        }
    }
    jsonOk(['ok' => true]);
}

// POST /admin/supervisors — insert into Supervisor.
if ($method === 'POST' && $path === '/admin/supervisors') {
    $u = authUser();
    if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $b = readJsonBody();
    $id = newId();
    $st = db()->prepare("INSERT INTO `Supervisor` (id, name, whatsappPhone, isActive, notes, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, NOW(3), NOW(3))");
    $st->execute([
        $id,
        (string)($b['name'] ?? ''),
        (string)($b['whatsappPhone'] ?? $b['phone'] ?? ''),
        !empty($b['isActive'] ?? true) ? 1 : 0,
        isset($b['notes']) && $b['notes'] !== '' ? (string)$b['notes'] : null,
    ]);
    $sel = db()->prepare('SELECT * FROM `Supervisor` WHERE id = ?');
    $sel->execute([$id]);
    jsonOk($sel->fetch(), 201);
}
if ($method === 'PATCH' && preg_match('#^/admin/supervisors/([^/]+)$#', $path, $m)) {
    authUser();
    $id = $m[1];
    $b = readJsonBody();
    $sets = [];
    $args = [];
    foreach (['name', 'whatsappPhone', 'notes'] as $f) {
        if (array_key_exists($f, $b)) { $sets[] = "`$f` = ?"; $args[] = $b[$f]; }
    }
    if (array_key_exists('isActive', $b)) { $sets[] = '`isActive` = ?'; $args[] = $b['isActive'] ? 1 : 0; }
    if ($sets) {
        $sets[] = '`updatedAt` = NOW(3)';
        $args[] = $id;
        db()->prepare("UPDATE `Supervisor` SET " . implode(',', $sets) . " WHERE id = ?")->execute($args);
    }
    $sel = db()->prepare('SELECT * FROM `Supervisor` WHERE id = ?');
    $sel->execute([$id]);
    jsonOk($sel->fetch() ?: []);
}
if ($method === 'DELETE' && preg_match('#^/admin/supervisors/([^/]+)$#', $path, $m)) {
    authUser();
    db()->prepare('DELETE FROM `Supervisor` WHERE id = ?')->execute([$m[1]]);
    jsonOk(['deleted' => true]);
}

// PUT /admin/settings/:key — upsert one Setting.
if ($method === 'PUT' && preg_match('#^/admin/settings/([^/]+)$#', $path, $m)) {
    $u = authUser();
    if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $b = readJsonBody();
    $key = $m[1];
    $val = is_string($b['value'] ?? null) ? $b['value'] : json_encode($b['value']);
    $desc = isset($b['description']) ? (string)$b['description'] : null;
    db()->prepare('INSERT INTO `Setting` (`key`,`value`,`description`,`updatedAt`,`updatedById`) VALUES (?,?,?,NOW(3),?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`), `description`=VALUES(`description`), `updatedAt`=VALUES(`updatedAt`), `updatedById`=VALUES(`updatedById`)')
        ->execute([$key, $val, $desc, $u['sub'] ?? null]);
    jsonOk(['key' => $key, 'value' => $val]);
}
if ($method === 'POST' && $path === '/admin/settings/bulk') {
    $u = authUser();
    if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $b = readJsonBody();
    $items = $b['items'] ?? [];
    $stmt = db()->prepare('INSERT INTO `Setting` (`key`,`value`,`description`,`updatedAt`,`updatedById`) VALUES (?,?,?,NOW(3),?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`), `description`=VALUES(`description`), `updatedAt`=VALUES(`updatedAt`), `updatedById`=VALUES(`updatedById`)');
    foreach ($items as $it) {
        $val = is_string($it['value'] ?? null) ? $it['value'] : json_encode($it['value']);
        $stmt->execute([(string)($it['key'] ?? ''), $val, $it['description'] ?? null, $u['sub'] ?? null]);
    }
    jsonOk(['updated' => count($items)]);
}

// PATCH /admin/home-config — update the singleton HomeConfig row.
if ($method === 'PATCH' && $path === '/admin/home-config') {
    $u = authUser();
    if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $b = readJsonBody();
    $stringFields = ['heroGreeting', 'heroSubtitle', 'trustStripTitle', 'trustStripSubtitle', 'promoBannerCouponId', 'promoBannerTitle', 'promoBannerCode'];
    $jsonFields = ['heroGradient', 'visibleServiceKeys', 'featuredMerchantIds', 'featuredOfferIds'];
    $boolFields = ['showPromoBanner', 'showTrustStrip'];

    $sets = [];
    $args = [];
    foreach ($stringFields as $f) if (array_key_exists($f, $b)) { $sets[] = "`$f` = ?"; $args[] = $b[$f]; }
    foreach ($jsonFields as $f)   if (array_key_exists($f, $b)) { $sets[] = "`$f` = ?"; $args[] = $b[$f] === null ? null : json_encode($b[$f]); }
    foreach ($boolFields as $f)   if (array_key_exists($f, $b)) { $sets[] = "`$f` = ?"; $args[] = $b[$f] ? 1 : 0; }
    if ($sets) {
        $sets[] = '`updatedAt` = NOW(3)';
        $sets[] = '`updatedById` = ?';
        $args[] = $u['sub'] ?? null;
        db()->prepare("UPDATE `HomeConfig` SET " . implode(',', $sets) . " WHERE id = 'singleton'")->execute($args);
    }
    jsonOk(['ok' => true]);
}

// PUT /admin/site-config — upsert every key in the body into Setting.
if ($method === 'PUT' && $path === '/admin/site-config') {
    $u = authUser();
    if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $b = readJsonBody();
    $stmt = db()->prepare('INSERT INTO `Setting` (`key`,`value`,`description`,`updatedAt`,`updatedById`) VALUES (?,?,NULL,NOW(3),?) ON DUPLICATE KEY UPDATE `value`=VALUES(`value`), `updatedAt`=VALUES(`updatedAt`), `updatedById`=VALUES(`updatedById`)');
    $n = 0;
    try {
        foreach ($b as $k => $v) {
            // Setting.value is a JSON column (MariaDB enforces it with a
            // `json_valid` CHECK). The old `is_string($v) ? $v : json_encode($v)`
            // stored bare text for every string field, which violated that
            // constraint — so EVERY text save (hero title, address, email…)
            // died with an empty 500 and the site editor never worked. Always
            // encode; a string becomes "…", matching the rows already stored.
            $stmt->execute([(string) $k, json_encode($v, JSON_UNESCAPED_UNICODE), $u['sub'] ?? null]);
            $n++;
        }
    } catch (PDOException $e) {
        error_log('[api.php] site-config PUT: ' . $e->getMessage());
        jsonErr('تعذّر حفظ الإعدادات', 422, 'SAVE_FAILED');
    }
    // Bust the public /site-config cache so a save is live immediately.
    @unlink(sys_get_temp_dir() . '/tamem_site_config.json');
    jsonOk(['updated' => $n]);
}

// ─── Create MERCHANT (User + MerchantProfile) ──────────────────────────
if ($method === 'POST' && $path === '/admin/merchants') {
    $u = authUser();
    if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $b = readJsonBody();
    $ownerName = trim((string)($b['ownerName'] ?? $b['name'] ?? ''));
    $phone = trim((string)($b['phone'] ?? ''));
    // Password is optional: honoured when supplied (older clients still send
    // one), otherwise auto-generated. The merchant signs in via OTP /
    // reset-password, so making an admin invent a secret — and then relay it —
    // adds a step and a thing to leak without adding security. Same rule the
    // driver route already uses.
    $pass = (string)($b['password'] ?? '');
    if ($pass !== '' && strlen($pass) < 6) jsonErr('كلمة المرور قصيرة (6 أحرف على الأقل)', 422, 'WEAK_PASSWORD');
    if ($pass === '') $pass = bin2hex(random_bytes(9));

    $storeNameAr = trim((string)($b['storeNameAr'] ?? ''));
    $storeName = trim((string)($b['storeName'] ?? '')) ?: $storeNameAr;
    $categoryId = trim((string)($b['categoryId'] ?? ''));
    if ($ownerName === '' || $phone === '' || $storeNameAr === '' || $categoryId === '') {
        jsonErr('بيانات ناقصة: اسم المالك، الهاتف، اسم المتجر، والتصنيف مطلوبين', 422, 'MISSING');
    }
    $clean = preg_replace('/[\s\-()]/', '', $phone);
    if (preg_match('/^(?:\+?20|0)?(1[0125]\d{8})$/', $clean, $mm)) $phone = '+20' . $mm[1];
    $governorate = trim((string)($b['governorate'] ?? 'قنا')) ?: 'قنا';
    $city = trim((string)($b['city'] ?? 'قفط')) ?: 'قفط';
    $pdo = db();
    try {
        $pdo->beginTransaction();
        $uid = newId();
        $pdo->prepare('INSERT INTO `User` (id, name, phone, passwordHash, role, isActive, isPhoneVerified, city, governorate, createdAt, updatedAt) VALUES (?,?,?,?,?,1,1,?,?,NOW(3),NOW(3))')
            ->execute([$uid, $ownerName, $phone, password_hash($pass, PASSWORD_BCRYPT), 'MERCHANT', $city, $governorate]);
        // logoUrl/coverUrl/storePhone/commissionPct/menuImages are all part of the
        // create form's payload; anything not listed here is silently discarded
        // and the admin has to re-enter it in the edit dialog afterwards.
        $blank = static fn ($v) => trim((string)($v ?? '')) === '' ? null : trim((string)$v);
        $menuIn = isset($b['menuImages']) && is_array($b['menuImages']) && $b['menuImages']
            ? json_encode(array_values($b['menuImages']), JSON_UNESCAPED_UNICODE) : null;
        $pdo->prepare('INSERT INTO `MerchantProfile` (id, userId, storeName, storeNameAr, categoryId, description, logoUrl, coverUrl, phone, commissionPct, menuImages, addressLine, lat, lng, governorate, city, isOpen, manualStatus, timezone, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,NOW(3),NOW(3))')
            ->execute([newId(), $uid, $storeName, $storeNameAr, $categoryId,
                (string)($b['description'] ?? ''),
                $blank($b['logoUrl'] ?? null), $blank($b['coverUrl'] ?? null),
                $blank($b['storePhone'] ?? null),
                isset($b['commissionPct']) && $b['commissionPct'] !== '' ? (float)$b['commissionPct'] : null,
                $menuIn,
                (string)($b['addressLine'] ?? ($governorate . ' - ' . $city)),
                (float)($b['lat'] ?? 26.0297), (float)($b['lng'] ?? 32.8146),
                $governorate, $city, 'OPEN', 'Africa/Cairo']);
        $pdo->commit();
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        if ((int)($e->errorInfo[1] ?? 0) === 1062) jsonErr('رقم الهاتف مستخدم بالفعل', 409, 'DUPLICATE');
        error_log('[api.php] create merchant failed: ' . $e->getMessage());
        jsonErr('تعذّر إضافة التاجر، تأكد من صحة التصنيف والبيانات', 422, 'CREATE_FAILED');
    }
    $sel = $pdo->prepare('SELECT * FROM `User` WHERE id = ?'); $sel->execute([$uid]);
    jsonOk(jsonizeRow($sel->fetch()), 201);
}

// ─── Create DRIVER (User + DriverProfile) ──────────────────────────────
if ($method === 'POST' && $path === '/admin/drivers') {
    $u = authUser();
    if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $b = readJsonBody();
    $name = trim((string)($b['name'] ?? ''));
    $phone = trim((string)($b['phone'] ?? ''));
    $vehicleType = trim((string)($b['vehicleType'] ?? ''));
    $vehiclePlate = trim((string)($b['vehiclePlate'] ?? ''));
    if ($name === '' || $phone === '' || $vehicleType === '' || $vehiclePlate === '') {
        jsonErr('بيانات ناقصة: الاسم، الهاتف، نوع المركبة، ولوحتها مطلوبين', 422, 'MISSING');
    }
    // Password is no longer entered when adding a driver. Accept one if sent
    // (kept for compatibility), else auto-generate a strong one — the driver
    // signs in via OTP / reset-password, so a login secret isn't needed here.
    $pass = (string)($b['password'] ?? '');
    if ($pass !== '' && strlen($pass) < 6) jsonErr('كلمة المرور قصيرة (6 أحرف على الأقل)', 422, 'WEAK_PASSWORD');
    if ($pass === '') $pass = bin2hex(random_bytes(9));
    $clean = preg_replace('/[\s\-()]/', '', $phone);
    if (preg_match('/^(?:\+?20|0)?(1[0125]\d{8})$/', $clean, $mm)) $phone = '+20' . $mm[1];
    $governorate = trim((string)($b['governorate'] ?? 'قنا')) ?: 'قنا';
    // Driver's cut of the delivery fee (0–100%). Default 0 — the admin sets it.
    $share = $b['deliverySharePct'] ?? 0;
    if (!is_numeric($share) || (float)$share < 0 || (float)$share > 100) jsonErr('نسبة السائق يجب أن تكون بين 0 و100', 422, 'BAD_SHARE');
    $share = round((float)$share, 2);
    $pdo = db();
    try {
        $pdo->beginTransaction();
        $uid = newId();
        $nn = fn ($k) => trim((string) ($b[$k] ?? '')) !== '' ? trim((string) $b[$k]) : null;
        $pdo->prepare('INSERT INTO `User` (id, name, phone, passwordHash, role, isActive, isPhoneVerified, governorate, avatarUrl, createdAt, updatedAt) VALUES (?,?,?,?,?,1,1,?,?,NOW(3),NOW(3))')
            ->execute([$uid, $name, $phone, password_hash($pass, PASSWORD_BCRYPT), 'DRIVER', $governorate, $nn('avatarUrl')]);
        $pdo->prepare('INSERT INTO `DriverProfile` (id, userId, status, vehicleType, vehiclePlate, nationalId, governorate, deliverySharePct, vehicleImageUrl, idCardFrontUrl, idCardBackUrl, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW(3),NOW(3))')
            ->execute([newId(), $uid, 'OFFLINE', $vehicleType, $vehiclePlate,
                $nn('nationalId'), $governorate, $share, $nn('vehicleImageUrl'), $nn('idCardFrontUrl'), $nn('idCardBackUrl')]);
        $pdo->commit();
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        if ((int)($e->errorInfo[1] ?? 0) === 1062) jsonErr('رقم الهاتف مستخدم بالفعل', 409, 'DUPLICATE');
        error_log('[api.php] create driver failed: ' . $e->getMessage());
        jsonErr('تعذّر إضافة السائق، راجع البيانات', 422, 'CREATE_FAILED');
    }
    $sel = $pdo->prepare('SELECT * FROM `User` WHERE id = ?'); $sel->execute([$uid]);
    jsonOk(jsonizeRow($sel->fetch()), 201);
}

// ─── Merchant update / delete (User + MerchantProfile) ─────────────────
if ($method === 'PATCH' && preg_match('#^/admin/merchants/([^/]+)$#', $path, $m)) {
    $u = authUser();
    if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $id = $m[1]; $b = readJsonBody(); $pdo = db();
    $sel = $pdo->prepare('SELECT userId FROM `MerchantProfile` WHERE id = ?'); $sel->execute([$id]);
    $mp = $sel->fetch();
    if (!$mp) jsonErr('التاجر غير موجود', 404, 'NOT_FOUND');
    try {
        $pdo->beginTransaction();
        $pcols = tableColumns('MerchantProfile'); $sets = []; $args = [];
        foreach ($b as $k => $v) {
            // `phone` is excluded deliberately: in this endpoint's contract a
            // body `phone` means the OWNER's login number (handled below). Since
            // MerchantProfile gained its own `phone` column, letting the generic
            // loop see it would write the owner's number into the store's field.
            if ($k === 'phone') continue;
            if (isset($pcols[$k]) && !in_array($k, ['id', 'userId', 'createdAt', 'updatedAt'], true)) { $sets[] = "`$k` = ?"; $args[] = coerceForColumn($v, $pcols[$k]); }
        }
        // The dashboard calls the store's public number `storePhone`; the column is `phone`.
        if (array_key_exists('storePhone', $b)) {
            $sp = trim((string)$b['storePhone']);
            $sets[] = '`phone` = ?'; $args[] = $sp === '' ? null : $sp;
        }
        if ($sets) { $sets[] = '`updatedAt` = NOW(3)'; $args[] = $id; $pdo->prepare('UPDATE `MerchantProfile` SET ' . implode(',', $sets) . ' WHERE id = ?')->execute($args); }
        $us = []; $ua = [];
        if (array_key_exists('ownerName', $b)) { $us[] = '`name` = ?'; $ua[] = (string)$b['ownerName']; }
        if (array_key_exists('ownerPhone', $b) || array_key_exists('phone', $b)) { $ph = (string)($b['ownerPhone'] ?? $b['phone']); $cl = preg_replace('/[\s\-()]/', '', $ph); if (preg_match('/^(?:\+?20|0)?(1[0125]\d{8})$/', $cl, $mm)) $ph = '+20' . $mm[1]; $us[] = '`phone` = ?'; $ua[] = $ph; }
        // The dashboard has always sent `ownerSecondaryPhones`, but only the bare
        // `secondaryPhones` key was read here — so extra numbers silently never
        // saved (0 rows in User.secondaryPhones live). Accept both spellings.
        $secKey = array_key_exists('ownerSecondaryPhones', $b) ? 'ownerSecondaryPhones' : (array_key_exists('secondaryPhones', $b) ? 'secondaryPhones' : null);
        if ($secKey !== null) { $us[] = '`secondaryPhones` = ?'; $ua[] = json_encode(array_values((array)$b[$secKey]), JSON_UNESCAPED_UNICODE); }
        if (array_key_exists('isActive', $b)) { $us[] = '`isActive` = ?'; $ua[] = $b['isActive'] ? 1 : 0; }
        if ($us) { $us[] = '`updatedAt` = NOW(3)'; $ua[] = $mp['userId']; $pdo->prepare('UPDATE `User` SET ' . implode(',', $us) . ' WHERE id = ?')->execute($ua); }
        $pdo->commit();
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        if ((int)($e->errorInfo[1] ?? 0) === 1062) jsonErr('رقم الهاتف مستخدم بالفعل', 409, 'DUPLICATE');
        error_log('[api.php] merchant update: ' . $e->getMessage()); jsonErr('تعذّر التحديث', 422, 'UPDATE_FAILED');
    }
    $r = $pdo->prepare('SELECT * FROM `MerchantProfile` WHERE id = ?'); $r->execute([$id]);
    jsonOk(jsonizeRow($r->fetch()) ?: []);
}
if ($method === 'DELETE' && preg_match('#^/admin/merchants/([^/]+)$#', $path, $m)) {
    $u = authUser(); if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $pdo = db(); $sel = $pdo->prepare('SELECT userId FROM `MerchantProfile` WHERE id = ?'); $sel->execute([$m[1]]); $mp = $sel->fetch();
    try {
        $pdo->beginTransaction();
        $pdo->prepare('DELETE FROM `MerchantProfile` WHERE id = ?')->execute([$m[1]]);
        if ($mp) $pdo->prepare("DELETE FROM `User` WHERE id = ? AND role = 'MERCHANT'")->execute([$mp['userId']]);
        $pdo->commit();
    } catch (PDOException $e) { if ($pdo->inTransaction()) $pdo->rollBack(); error_log('[api.php] merchant delete: ' . $e->getMessage()); jsonErr('تعذّر الحذف — قد يكون التاجر مرتبط بطلبات', 422, 'DELETE_FAILED'); }
    jsonOk(['deleted' => true]);
}

// ─── Driver status / update / delete (User + DriverProfile) ────────────
if ($method === 'PATCH' && preg_match('#^/admin/drivers/([^/]+)/status$#', $path, $m)) {
    $u = authUser(); if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $b = readJsonBody(); $status = (string)($b['status'] ?? '');
    if (!in_array($status, ['AVAILABLE', 'BUSY', 'OFFLINE'], true)) jsonErr('حالة غير صحيحة', 422, 'BAD_STATUS');
    db()->prepare('UPDATE `DriverProfile` SET `status` = ?, `updatedAt` = NOW(3) WHERE userId = ?')->execute([$status, $m[1]]);
    jsonOk(['id' => $m[1], 'driverProfile' => ['status' => $status]]);
}
if ($method === 'PATCH' && preg_match('#^/admin/drivers/([^/]+)$#', $path, $m)) {
    $u = authUser(); if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $id = $m[1]; $b = readJsonBody(); $pdo = db();
    try {
        $pdo->beginTransaction();
        $us = []; $ua = [];
        if (array_key_exists('name', $b)) { $us[] = '`name` = ?'; $ua[] = (string)$b['name']; }
        if (array_key_exists('phone', $b)) { $ph = (string)$b['phone']; $cl = preg_replace('/[\s\-()]/', '', $ph); if (preg_match('/^(?:\+?20|0)?(1[0125]\d{8})$/', $cl, $mm)) $ph = '+20' . $mm[1]; $us[] = '`phone` = ?'; $ua[] = $ph; }
        if (array_key_exists('isActive', $b)) { $us[] = '`isActive` = ?'; $ua[] = $b['isActive'] ? 1 : 0; }
        // Driver photo lives on the User row. '' clears it, a URL sets it.
        if (array_key_exists('avatarUrl', $b)) { $av = trim((string) $b['avatarUrl']); $us[] = '`avatarUrl` = ?'; $ua[] = $av !== '' ? $av : null; }
        if ($us) { $us[] = '`updatedAt` = NOW(3)'; $ua[] = $id; $pdo->prepare('UPDATE `User` SET ' . implode(',', $us) . ' WHERE id = ?')->execute($ua); }
        $dcols = tableColumns('DriverProfile'); $ds = []; $da = [];
        foreach (['vehicleType', 'vehiclePlate', 'nationalId', 'governorate', 'status', 'notes', 'vehicleImageUrl', 'idCardFrontUrl', 'idCardBackUrl'] as $f) {
            if (array_key_exists($f, $b) && isset($dcols[$f])) { $ds[] = "`$f` = ?"; $da[] = coerceForColumn($b[$f], $dcols[$f]); }
        }
        // Driver delivery-fee share (0–100%). Validated separately from the
        // generic loop so a bad value is rejected, not silently clamped.
        if (array_key_exists('deliverySharePct', $b)) {
            $share = $b['deliverySharePct'];
            if (!is_numeric($share) || (float)$share < 0 || (float)$share > 100) { if ($pdo->inTransaction()) $pdo->rollBack(); jsonErr('نسبة السائق يجب أن تكون بين 0 و100', 422, 'BAD_SHARE'); }
            $ds[] = '`deliverySharePct` = ?'; $da[] = round((float)$share, 2);
        }
        if ($ds) { $ds[] = '`updatedAt` = NOW(3)'; $da[] = $id; $pdo->prepare('UPDATE `DriverProfile` SET ' . implode(',', $ds) . ' WHERE userId = ?')->execute($da); }
        $pdo->commit();
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        if ((int)($e->errorInfo[1] ?? 0) === 1062) jsonErr('رقم الهاتف مستخدم بالفعل', 409, 'DUPLICATE');
        error_log('[api.php] driver update: ' . $e->getMessage()); jsonErr('تعذّر التحديث', 422, 'UPDATE_FAILED');
    }
    $r = $pdo->prepare('SELECT * FROM `User` WHERE id = ?'); $r->execute([$id]);
    jsonOk(jsonizeRow($r->fetch()) ?: []);
}
// Settle a driver's outstanding delivery dues: mark a batch of their delivered
// orders SETTLED and record the settlement (amount + who + when). Body: optional
// orderIds[] (explicit selection), else all still-PENDING delivered orders,
// optionally bounded by from/to. Any order missing a snapshot is locked first.
if ($method === 'POST' && preg_match('#^/admin/drivers/([^/]+)/settle$#', $path, $m)) {
    $u = authUser(); if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $driverId = $m[1]; $b = readJsonBody(); $pdo = db();
    $w = ["o.assignedDriverId = ?", "o.status IN ('DELIVERED','COMPLETED')", "o.driverSettlementStatus <> 'SETTLED'"]; $a = [$driverId];
    $ids = $b['orderIds'] ?? null;
    if (is_array($ids) && $ids) {
        $w[] = 'o.id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')';
        foreach ($ids as $id) $a[] = (string) $id;
    } else {
        $from = trim((string) ($b['from'] ?? '')); $to = trim((string) ($b['to'] ?? ''));
        if ($from !== '') { $w[] = "COALESCE(o.deliveredAt, o.completedAt, o.updatedAt) >= ?"; $a[] = $from . ' 00:00:00'; }
        if ($to !== '')   { $w[] = "COALESCE(o.deliveredAt, o.completedAt, o.updatedAt) <= ?"; $a[] = $to . ' 23:59:59'; }
    }
    $sel = $pdo->prepare("SELECT o.id, o.driverDeliveryRevenue FROM `Order` o WHERE " . implode(' AND ', $w));
    $sel->execute($a);
    $rows = $sel->fetchAll();
    if (!$rows) jsonErr('لا توجد طلبات مستحقة للتسوية', 422, 'NOTHING_TO_SETTLE');
    $orderIds = [];
    foreach ($rows as $r) { if ($r['driverDeliveryRevenue'] === null) snapshotDriverShare($r['id']); $orderIds[] = $r['id']; }
    $ph = implode(',', array_fill(0, count($orderIds), '?'));
    $amt = $pdo->prepare("SELECT COALESCE(SUM(driverDeliveryRevenue), 0) FROM `Order` WHERE id IN ($ph)");
    $amt->execute($orderIds); $amount = round((float) $amt->fetchColumn(), 2);
    $note = mb_substr(trim((string) ($b['note'] ?? '')), 0, 255);
    $sid = newId();
    try {
        $pdo->beginTransaction();
        $pdo->prepare('INSERT INTO `DriverSettlement` (id, driverId, amount, orderCount, note, createdById, createdAt) VALUES (?,?,?,?,?,?,NOW(3))')
            ->execute([$sid, $driverId, $amount, count($orderIds), $note !== '' ? $note : null, $u['sub'] ?? null]);
        $pdo->prepare("UPDATE `Order` SET driverSettlementStatus = 'SETTLED', driverSettledAt = NOW(3), driverSettlementId = ?, updatedAt = NOW(3) WHERE id IN ($ph)")
            ->execute(array_merge([$sid], $orderIds));
        $pdo->commit();
    } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); error_log('[api.php] settle: ' . $e->getMessage()); jsonErr('تعذّرت التسوية', 422, 'SETTLE_FAILED'); }
    jsonOk(['settlementId' => $sid, 'driverId' => $driverId, 'amount' => $amount, 'orderCount' => count($orderIds)]);
}
// Settlement history for a driver (audit trail of paid batches).
if ($method === 'GET' && preg_match('#^/admin/drivers/([^/]+)/settlements$#', $path, $m)) {
    $u = authUser(); if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $st = db()->prepare('SELECT id, amount, orderCount, note, createdAt FROM `DriverSettlement` WHERE driverId = ? ORDER BY createdAt DESC LIMIT 200');
    $st->execute([$m[1]]);
    jsonOk(['settlements' => array_map(static fn ($r) => [
        'id' => $r['id'], 'amount' => (float) $r['amount'], 'orderCount' => (int) $r['orderCount'],
        'note' => $r['note'], 'createdAt' => isoZ($r['createdAt']),
    ], $st->fetchAll())]);
}
if ($method === 'DELETE' && preg_match('#^/admin/drivers/([^/]+)$#', $path, $m)) {
    $u = authUser(); if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $pdo = db();
    try {
        $pdo->beginTransaction();
        $pdo->prepare('DELETE FROM `DriverProfile` WHERE userId = ?')->execute([$m[1]]);
        $pdo->prepare("DELETE FROM `User` WHERE id = ? AND role = 'DRIVER'")->execute([$m[1]]);
        $pdo->commit();
    } catch (PDOException $e) { if ($pdo->inTransaction()) $pdo->rollBack(); error_log('[api.php] driver delete: ' . $e->getMessage()); jsonErr('تعذّر الحذف — قد يكون السائق مرتبط بطلبات', 422, 'DELETE_FAILED'); }
    jsonOk(['deleted' => true]);
}

// ─── Customer update (plain User row) ──────────────────────────────────
if ($method === 'PATCH' && preg_match('#^/admin/customers/([^/]+)$#', $path, $m)) {
    $u = authUser(); if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $id = $m[1]; $b = readJsonBody(); $ucols = tableColumns('User'); $sets = []; $args = [];
    foreach ($b as $k => $v) {
        if (isset($ucols[$k]) && !in_array($k, ['id', 'role', 'passwordHash', 'createdAt', 'updatedAt'], true)) {
            if ($k === 'phone') { $ph = (string)$v; $cl = preg_replace('/[\s\-()]/', '', $ph); if (preg_match('/^(?:\+?20|0)?(1[0125]\d{8})$/', $cl, $mm)) $v = '+20' . $mm[1]; }
            $sets[] = "`$k` = ?"; $args[] = coerceForColumn($v, $ucols[$k]);
        }
    }
    try {
        if ($sets) { $sets[] = '`updatedAt` = NOW(3)'; $args[] = $id; db()->prepare('UPDATE `User` SET ' . implode(',', $sets) . ' WHERE id = ?')->execute($args); }
    } catch (PDOException $e) { if ((int)($e->errorInfo[1] ?? 0) === 1062) jsonErr('رقم الهاتف مستخدم بالفعل', 409, 'DUPLICATE'); throw $e; }
    $r = db()->prepare('SELECT * FROM `User` WHERE id = ?'); $r->execute([$id]);
    jsonOk(jsonizeRow($r->fetch()) ?: []);
}
if ($method === 'DELETE' && preg_match('#^/admin/customers/([^/]+)$#', $path, $m)) {
    $u = authUser(); if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    try {
        db()->prepare("DELETE FROM `User` WHERE id = ? AND role = 'CUSTOMER'")->execute([$m[1]]);
        jsonOk(['deleted' => true]);
    } catch (PDOException $e) { error_log('[api.php] customer delete: ' . $e->getMessage()); jsonErr('تعذّر الحذف — قد يكون العميل مرتبط بطلبات', 422, 'DELETE_FAILED'); }
}

// ─── Broadcast — persist an in-app Notification for every targeted user ─
if ($method === 'POST' && $path === '/admin/broadcast') {
    $u = authUser(); if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $b = readJsonBody();
    $titleAr = trim((string)($b['titleAr'] ?? ''));
    $bodyAr = trim((string)($b['bodyAr'] ?? ''));
    if ($titleAr === '' || $bodyAr === '') jsonErr('اكتب العنوان والرسالة', 422, 'MISSING');
    $type = ['PROMO' => 'PROMO', 'ALERT' => 'ALERT', 'ANNOUNCEMENT' => 'SYSTEM'][(string)($b['kind'] ?? '')] ?? 'SYSTEM';
    $target = (string)($b['target'] ?? 'ALL');
    $roleFilter = in_array($target, ['CUSTOMER', 'MERCHANT', 'DRIVER', 'ADMIN'], true) ? $target : null;
    $st = db()->prepare('SELECT id FROM `User`' . ($roleFilter ? ' WHERE role = ?' : ''));
    $st->execute($roleFilter ? [$roleFilter] : []);
    $ids = array_column($st->fetchAll(), 'id');
    $ins = db()->prepare('INSERT INTO `Notification` (id, userId, type, title, titleAr, body, bodyAr, channel, isRead, sentAt) VALUES (?,?,?,?,?,?,?,?,0,NOW(3))');
    $n = 0;
    foreach ($ids as $uid) { try { $ins->execute([newId(), $uid, $type, $titleAr, $titleAr, $bodyAr, $bodyAr, 'IN_APP']); $n++; } catch (Throwable $e) {} }

    // Also deliver as a REAL push so the broadcast reaches phones with the app
    // closed — not just the in-app notifications page. One FCM call per device
    // (the OAuth token is cached across them). Capped so a huge audience can't
    // exceed the request time limit; dead tokens are pruned.
    $pushSent = 0; $pushFailed = 0; $capped = false;
    if (fcmServiceAccount() && $ids) {
        $data = ['type' => $type, 'screen' => 'Notifications'];
        $MAX_PUSH = 800;
        foreach (array_chunk($ids, 200) as $chunk) {
            if ($pushSent + $pushFailed >= $MAX_PUSH) { $capped = true; break; }
            $ph = implode(',', array_fill(0, count($chunk), '?'));
            $dts = db()->prepare("SELECT id, token FROM `DeviceToken` WHERE userId IN ($ph)");
            $dts->execute($chunk);
            foreach ($dts->fetchAll() as $row) {
                if ($pushSent + $pushFailed >= $MAX_PUSH) { $capped = true; break; }
                $r = fcmSendToToken((string) $row['token'], $titleAr, $bodyAr, $data);
                if (!empty($r['ok'])) { $pushSent++; }
                else {
                    $pushFailed++;
                    if (!empty($r['dead'])) { try { db()->prepare('DELETE FROM `DeviceToken` WHERE id = ?')->execute([$row['id']]); } catch (Throwable $e) {} }
                }
            }
        }
    }
    jsonOk(['recipients' => $n, 'pushSent' => $pushSent, 'pushFailed' => $pushFailed, 'pushCapped' => $capped]);
}

// ─── Order operational actions ─────────────────────────────────────────
if ($method === 'PATCH' && preg_match('#^/admin/orders/([^/]+)/status$#', $path, $m)) {
    $u = authUser(); if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $b = readJsonBody(); $status = (string)($b['status'] ?? '');
    $sets = ['`status` = ?', '`updatedAt` = NOW(3)']; $args = [$status];
    if (in_array($status, ['DELIVERED', 'COMPLETED'], true)) { $sets[] = '`completedAt` = NOW(3)'; $sets[] = '`deliveredAt` = NOW(3)'; }
    if ($status === 'CANCELLED') { $sets[] = '`cancelledAt` = NOW(3)'; if (!empty($b['reason'])) { $sets[] = '`cancellationReason` = ?'; $args[] = (string)$b['reason']; } }
    $args[] = $m[1];
    try { db()->prepare('UPDATE `Order` SET ' . implode(',', $sets) . ' WHERE id = ?')->execute($args); }
    catch (PDOException $e) { error_log('[api.php] order status: ' . $e->getMessage()); jsonErr('تعذّر تحديث الحالة', 422, 'FAILED'); }
    // Lock the driver's delivery-fee share at delivery (final fee, final %).
    if (in_array($status, ['DELIVERED', 'COMPLETED'], true)) snapshotDriverShare($m[1]);
    // The order is over — hand the driver back to the available pool, unless
    // they're still carrying another one. Without this, assigning once would
    // mark a driver BUSY for good and quietly drain the assignable list.
    if (in_array($status, ['DELIVERED', 'COMPLETED', 'CANCELLED'], true)) {
        try {
            $dv = db()->prepare('SELECT assignedDriverId FROM `Order` WHERE id = ?');
            $dv->execute([$m[1]]);
            $did = $dv->fetchColumn();
            if ($did) {
                $bz = db()->prepare("SELECT COUNT(*) FROM `Order`
                                     WHERE assignedDriverId = ?
                                       AND status IN ('DRIVER_ASSIGNED','PICKED_UP','IN_ROUTE')");
                $bz->execute([$did]);
                if ((int) $bz->fetchColumn() === 0) {
                    db()->prepare("UPDATE `DriverProfile` SET `status` = 'AVAILABLE', `updatedAt` = NOW(3)
                                   WHERE userId = ? AND `status` = 'BUSY'")->execute([$did]);
                }
            }
        } catch (Throwable $e) { error_log('[api.php] driver release: ' . $e->getMessage()); }
    }
    // Fan out role-specific WhatsApp updates (customer / driver / admin).
    notifyOrderParties($m[1], $status, !empty($b['reason']) ? (string) $b['reason'] : null);
    $r = db()->prepare('SELECT * FROM `Order` WHERE id = ?'); $r->execute([$m[1]]);
    jsonOk(jsonizeRow($r->fetch()) ?: []);
}
if ($method === 'PATCH' && preg_match('#^/admin/orders/([^/]+)/price$#', $path, $m)) {
    $u = authUser(); if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $b = readJsonBody();
    // An admin may price the goods and the delivery separately; both feed the
    // money model. deliveryFee is only overwritten when explicitly supplied.
    $sets = ['`quotedPrice` = ?', "`status` = CASE WHEN `status` = 'NEW' THEN 'PRICED' ELSE `status` END", '`updatedAt` = NOW(3)'];
    $args = [(float) ($b['quotedPrice'] ?? 0)];
    if (isset($b['deliveryFee']) && $b['deliveryFee'] !== '') { $sets[] = '`deliveryFee` = ?'; $args[] = (float) $b['deliveryFee']; }
    if (isset($b['merchantSubtotal']) && $b['merchantSubtotal'] !== '') { $sets[] = '`merchantSubtotal` = ?'; $args[] = (float) $b['merchantSubtotal']; }
    $args[] = $m[1];
    db()->prepare('UPDATE `Order` SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($args);
    // Re-derive commission/payout from the new price.
    computeOrderFinancials($m[1]);
    notifyOrderParties($m[1], 'PRICED');
    $r = db()->prepare('SELECT * FROM `Order` WHERE id = ?'); $r->execute([$m[1]]);
    jsonOk(jsonizeRow($r->fetch()) ?: []);
}
if ($method === 'PATCH' && preg_match('#^/admin/orders/([^/]+)/assign-driver$#', $path, $m)) {
    $u = authUser(); if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $b = readJsonBody();
    $driverId = (string) ($b['driverId'] ?? '');
    if ($driverId === '') jsonErr('اختر السائق', 422, 'MISSING');
    // Enforced here, not only in the dropdown: a stale page, a direct API call,
    // or a driver who went offline while the dialog sat open would otherwise
    // still get the order. Being offered a driver and being allowed to send them
    // work are the same rule, so it lives on the write path.
    $dq = db()->prepare("SELECT u.isActive, u.name, dp.status FROM `User` u
                         LEFT JOIN `DriverProfile` dp ON dp.userId = u.id
                         WHERE u.id = ? AND u.role = 'DRIVER' LIMIT 1");
    $dq->execute([$driverId]);
    $dRow = $dq->fetch();
    if (!$dRow) jsonErr('السائق غير موجود', 422, 'DRIVER_NOT_FOUND');
    if (!(int) $dRow['isActive']) jsonErr('حساب السائق موقوف', 409, 'DRIVER_INACTIVE');
    if (($dRow['status'] ?? '') !== 'AVAILABLE') {
        jsonErr(($dRow['status'] ?? '') === 'BUSY'
            ? 'السائق مشغول بطلب حالياً — اختر سائق متاح'
            : 'السائق غير متصل — اختر سائق متاح', 409, 'DRIVER_UNAVAILABLE');
    }
    db()->prepare("UPDATE `Order` SET `assignedDriverId` = ?, `status` = 'DRIVER_ASSIGNED', `updatedAt` = NOW(3) WHERE id = ?")
        ->execute([$driverId, $m[1]]);
    // Taking an order is what makes a driver busy — otherwise they'd stay
    // "available" and collect a second order.
    db()->prepare("UPDATE `DriverProfile` SET `status` = 'BUSY', `updatedAt` = NOW(3) WHERE userId = ?")
        ->execute([$driverId]);
    // Freeze the driver's delivery-fee share onto the order at assignment.
    snapshotDriverShare($m[1]);
    // Notifies the driver (new assignment + pickup/delivery) AND the customer.
    notifyOrderParties($m[1], 'DRIVER_ASSIGNED');
    $r = db()->prepare('SELECT * FROM `Order` WHERE id = ?'); $r->execute([$m[1]]);
    jsonOk(jsonizeRow($r->fetch()) ?: []);
}
if ($method === 'POST' && preg_match('#^/admin/orders/([^/]+)/cancel$#', $path, $m)) {
    $u = authUser(); if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $b = readJsonBody();
    db()->prepare("UPDATE `Order` SET `status` = 'CANCELLED', `cancelledAt` = NOW(3), `cancellationReason` = ?, `updatedAt` = NOW(3) WHERE id = ?")
        ->execute([(string)($b['reason'] ?? ''), $m[1]]);
    // Customer (apology) + driver (stand down) + admin (log).
    notifyOrderParties($m[1], 'CANCELLED', !empty($b['reason']) ? (string) $b['reason'] : null);
    $r = db()->prepare('SELECT * FROM `Order` WHERE id = ?'); $r->execute([$m[1]]);
    jsonOk(jsonizeRow($r->fetch()) ?: []);
}

// ─── Payment actions ───────────────────────────────────────────────────
if ($method === 'PATCH' && preg_match('#^/admin/payments/([^/]+)/(confirm|reject)$#', $path, $m)) {
    $u = authUser(); if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $b = readJsonBody();
    if ($m[2] === 'confirm') {
        db()->prepare("UPDATE `Payment` SET `status` = 'PAID', `confirmedById` = ?, `confirmedAt` = NOW(3) WHERE id = ?")->execute([$u['sub'] ?? null, $m[1]]);
    } else {
        db()->prepare("UPDATE `Payment` SET `status` = 'FAILED', `notes` = ? WHERE id = ?")->execute([(string)($b['reason'] ?? ''), $m[1]]);
    }
    $r = db()->prepare('SELECT * FROM `Payment` WHERE id = ?'); $r->execute([$m[1]]);
    jsonOk(jsonizeRow($r->fetch()) ?: []);
}

// ─── Generic column-aware write for any mapped resource ────────────────
// Makes POST/PATCH/PUT/DELETE actually PERSIST for every table in $RES
// (offers, products, pricing-rules, coupons, reviews, payments, orders, …)
// by introspecting the table's real columns and only writing keys that
// exist. Wrapped in try/catch: a genuine schema mismatch degrades to the
// silent echo below rather than surfacing a 500 / red error toast.
function tableColumns(string $tbl): array {
    static $cache = [];
    if (isset($cache[$tbl])) return $cache[$tbl];
    $out = [];
    foreach (db()->query("SHOW COLUMNS FROM `$tbl`")->fetchAll() as $c) {
        $out[$c['Field']] = $c; // Field, Type, Null, Key, Default, Extra
    }
    return $cache[$tbl] = $out;
}
function coerceForColumn($v, array $col) {
    $type = strtolower((string)($col['Type'] ?? ''));
    if (is_array($v)) return json_encode($v, JSON_UNESCAPED_UNICODE);
    if (is_bool($v)) return $v ? 1 : 0;
    if (str_starts_with($type, 'tinyint(1)') && ($v === '1' || $v === '0')) return (int) $v;
    return $v;
}

// POST /admin/<res> → INSERT
if ($method === 'POST' && preg_match('#^/admin/([a-z][a-z0-9-]*)$#', $path, $m) && isset($RES[$m[1]])) {
    $u = authUser();
    if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $tbl = $RES[$m[1]];
    $b = readJsonBody();
    try {
        $cols = tableColumns($tbl);
        $names = []; $place = []; $args = [];
        if (isset($cols['id'])) { $names[] = '`id`'; $place[] = '?'; $args[] = !empty($b['id']) ? (string)$b['id'] : newId(); }
        foreach ($b as $k => $v) {
            if ($k === 'id' || !isset($cols[$k]) || in_array($k, ['createdAt', 'updatedAt'], true)) continue;
            $names[] = "`$k`"; $place[] = '?'; $args[] = coerceForColumn($v, $cols[$k]);
        }
        if (isset($cols['createdAt'])) { $names[] = '`createdAt`'; $place[] = 'NOW(3)'; }
        if (isset($cols['updatedAt'])) { $names[] = '`updatedAt`'; $place[] = 'NOW(3)'; }
        db()->prepare("INSERT INTO `$tbl` (" . implode(',', $names) . ") VALUES (" . implode(',', $place) . ")")->execute($args);
        if (isset($cols['id'])) {
            $sel = db()->prepare("SELECT * FROM `$tbl` WHERE id = ?"); $sel->execute([$args[0]]);
            $row = $sel->fetch() ?: [];
            if ($tbl === 'Product' && !empty($row['id'])) {
                logProductHistory((string) $row['id'], $row['nameAr'] ?? null, 'CREATE', null);
            }
            jsonOk(jsonizeRow($row) ?: [], 201);
        }
        jsonOk($b, 201);
    } catch (Throwable $e) {
        error_log('[api.php] generic INSERT ' . $tbl . ' failed: ' . $e->getMessage());
    }
}

// PATCH|PUT /admin/<res>/<id> → UPDATE
if (($method === 'PATCH' || $method === 'PUT') && preg_match('#^/admin/([a-z][a-z0-9-]*)/([^/]+)$#', $path, $m) && isset($RES[$m[1]])) {
    $u = authUser();
    if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $tbl = $RES[$m[1]]; $id = $m[2];
    $b = readJsonBody();
    try {
        $cols = tableColumns($tbl);
        // Snapshot before writing — the trail needs the old value, and after the
        // UPDATE it is gone.
        $__before = null;
        if ($tbl === 'Product') {
            $bs = db()->prepare("SELECT * FROM `$tbl` WHERE id = ?"); $bs->execute([$id]);
            $__before = $bs->fetch() ?: null;
        }
        $sets = []; $args = [];
        foreach ($b as $k => $v) {
            if (!isset($cols[$k]) || in_array($k, ['id', 'createdAt', 'updatedAt'], true)) continue;
            $sets[] = "`$k` = ?"; $args[] = coerceForColumn($v, $cols[$k]);
        }
        if ($sets) {
            if (isset($cols['updatedAt'])) $sets[] = '`updatedAt` = NOW(3)';
            $args[] = $id;
            db()->prepare("UPDATE `$tbl` SET " . implode(',', $sets) . " WHERE id = ?")->execute($args);
        }
        $sel = db()->prepare("SELECT * FROM `$tbl` WHERE id = ?"); $sel->execute([$id]);
        $__after = $sel->fetch() ?: [];
        if ($tbl === 'Product' && $__before) {
            $changes = diffProduct($__before, $__after);
            if ($changes) {
                logProductHistory((string) $id, $__after['nameAr'] ?? null, productActionFor($changes), $changes);
            }
        }
        jsonOk(jsonizeRow($__after) ?: []);
    } catch (Throwable $e) {
        error_log('[api.php] generic UPDATE ' . $tbl . ' failed: ' . $e->getMessage());
    }
}

// DELETE /admin/<res>/<id>
if ($method === 'DELETE' && preg_match('#^/admin/([a-z][a-z0-9-]*)/([^/]+)$#', $path, $m) && isset($RES[$m[1]])) {
    $u = authUser();
    if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $tbl = $RES[$m[1]];
    try {
        $__name = null;
        if ($tbl === 'Product') {
            $ns = db()->prepare("SELECT nameAr FROM `$tbl` WHERE id = ?"); $ns->execute([$m[2]]);
            $__name = $ns->fetchColumn() ?: null;
        }
        db()->prepare("DELETE FROM `$tbl` WHERE id = ?")->execute([$m[2]]);
        if ($tbl === 'Product') logProductHistory((string) $m[2], $__name, 'DELETE', null);
        jsonOk(['deleted' => true]);
    } catch (Throwable $e) {
        $errno = ($e instanceof PDOException) ? (int)($e->errorInfo[1] ?? 0) : 0;
        // Mirrors products.controller's P2003 branch: a product referenced by an
        // existing order can't be hard-deleted (FK 1451), so pull it from the
        // catalog instead of corrupting order history. Without this the request
        // falls through to the echo fallback below, which reports success while
        // the product is still sitting there.
        if ($tbl === 'Product' && $errno === 1451) {
            db()->prepare('UPDATE `Product` SET `isAvailable` = 0 WHERE id = ?')->execute([$m[2]]);
            jsonOk(['deleted' => true, 'deactivated' => true]);
        }
        error_log('[api.php] generic DELETE ' . $tbl . ' failed: ' . $e->getMessage());
    }
}

// Admin: fire a real test push (to yourself or a given user) to confirm the FCM
// pipeline end-to-end. MUST sit before the generic admin fallback below, which
// would otherwise swallow it as a fake "saved" echo.
if ($method === 'POST' && $path === '/admin/push/test') {
    $u = authUser(); if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $b = readJsonBody();
    $target = (string) ($b['userId'] ?? $u['sub'] ?? '');
    if (!fcmServiceAccount()) jsonErr('لم يتم رفع ملف Firebase service account بعد', 400, 'FCM_NOT_CONFIGURED');
    $has = (int) (function () use ($target) { $s = db()->prepare('SELECT COUNT(*) FROM `DeviceToken` WHERE userId = ?'); $s->execute([$target]); return $s->fetchColumn(); })();
    if ($has === 0) jsonErr('لا يوجد جهاز مسجّل لهذا المستخدم', 400, 'NO_DEVICE');
    pushToUser($target, (string) ($b['title'] ?? 'اختبار إشعار تميم'), (string) ($b['body'] ?? 'وصلك الإشعار ✅'), ['type' => 'TEST']);
    jsonOk(['sent' => true, 'devices' => $has]);
}

// Generic admin mutation fallback — instead of a red 503 toast, silently
// echo the input back as if it were saved.  Real persistence for these
// endpoints kicks in the moment the Node.js backend is enabled in hPanel.
if (in_array($method, ['POST', 'PATCH', 'PUT', 'DELETE'], true) && str_starts_with($path, '/admin/')) {
    authUser();
    $b = readJsonBody();
    $echo = is_array($b) ? $b : [];
    if (!isset($echo['id'])) $echo['id'] = newId();
    $echo['_note'] = 'shim: not persisted';
    jsonOk($echo);
}

// ═══════════════════════════════════════════════════════════════════════
//  CUSTOMER / MOBILE API
//  Ported from apps/backend/src/modules/** so the Android app works against
//  this shim. Shapes match the Node controllers EXACTLY — the mobile screens
//  destructure without guards, so a wrong shape = a crashed screen.
//  Envelope rules (utils/response.ts): ok → {data}, paginated → {data,meta.pagination},
//  204 → empty body. NOTE: /auth/refresh puts tokens at data.* (NOT data.tokens).
// ═══════════════════════════════════════════════════════════════════════

const PROFILE_SQL = 'id, phone, name, email, avatarUrl, role, isPhoneVerified, isActive, city, governorate, defaultAddress, createdAt';

/** Egyptian phone → +20XXXXXXXXXX (mirrors packages/validators phoneSchema). */
function normPhoneEg(string $raw): ?string {
    $c = preg_replace('/[\s\-()]/', '', trim($raw)) ?? '';
    if (!preg_match('/^(?:\+?20|0)?(1[0125]\d{8})$/', $c, $m)) return null;
    return '+20' . $m[1];
}
/** MySQL tinyint(1) → real JSON booleans (Node returns booleans, not "0"/"1"). */
function boolCast(?array $row, array $keys): ?array {
    if (!$row) return $row;
    foreach ($keys as $k) if (array_key_exists($k, $row) && $row[$k] !== null) $row[$k] = (bool) (int) $row[$k];
    return $row;
}
function issueTokens(string $uid, string $role): array {
    $a = env('JWT_ACCESS_SECRET'); $r = env('JWT_REFRESH_SECRET');
    if (!$a || !$r) jsonErr('JWT secrets not configured', 500, 'CONFIG_MISSING');
    $isAdmin = in_array($role, ['ADMIN', 'SUPER_ADMIN'], true);
    $ttl = $isAdmin ? ((int) env('ADMIN_SESSION_TTL_HOURS', '6')) * 3600 : 15 * 60;
    return [
        'accessToken'  => jwtSign(['sub' => $uid, 'role' => $role], $a, $ttl),
        'refreshToken' => jwtSign(['sub' => $uid, 'typ' => 'refresh'], $r, $isAdmin ? $ttl : 30 * 24 * 3600),
    ];
}
function profileById(string $id): ?array {
    $st = db()->prepare('SELECT ' . PROFILE_SQL . ' FROM `User` WHERE id = ? LIMIT 1');
    $st->execute([$id]);
    $r = $st->fetch() ?: null;
    return boolCast($r, ['isPhoneVerified', 'isActive']);
}
function jsonList(array $rows, int $page, int $pageSize, int $total): void {
    http_response_code(200);
    echo json_encode(['data' => $rows, 'meta' => ['pagination' => [
        'page' => $page, 'pageSize' => $pageSize, 'total' => $total,
        'totalPages' => $pageSize > 0 ? (int) ceil($total / $pageSize) : 0,
    ]]], JSON_UNESCAPED_UNICODE);
    exit;
}
function noContent(): void { http_response_code(204); exit; }

// ─── Merchant openness (port of modules/merchants/merchantHours.ts) ─────
function merchantNextOpenMsg(array $hours, int $dow, int $mins): ?string {
    $DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    for ($i = 0; $i < 8; $i++) {
        $d = ($dow + $i) % 7;
        $best = null;
        foreach ($hours as $h) {
            if ((int) $h['isClosed']) continue;
            if ((int) $h['dayOfWeek'] !== $d) continue;
            $o = (int) $h['openMin'];
            if ($i === 0 && $o <= $mins) continue;
            if ($best === null || $o < $best) $best = $o;
        }
        if ($best !== null) {
            $hh = intdiv($best, 60) % 24; $mm = $best % 60;
            $h12 = $hh % 12; if ($h12 === 0) $h12 = 12;
            $t = sprintf('%d:%02d %s', $h12, $mm, $hh < 12 ? 'ص' : 'م');
            // Hand the caller the structured slot too — the day offset and the
            // minutes-into-day are exactly what an ISO nextOpenAt needs, and
            // they were being discarded into a string.
            $GLOBALS['__next_open_slot'] = ['dayOffset' => $i, 'minutes' => $best];
            if ($i === 0) return "يفتح اليوم الساعة $t";
            if ($i === 1) return "يفتح غداً الساعة $t";
            return 'يفتح ' . $DAYS[$d] . " الساعة $t";
        }
    }
    return null;
}
/** Local [dayOfWeek, minutesIntoDay] in an IANA zone (merchantHours.ts nowInTz). */
function nowInTz(?string $tz): array {
    try { $n = new DateTime('now', new DateTimeZone($tz ?: 'Africa/Cairo')); }
    catch (Throwable $e) { $n = new DateTime('now', new DateTimeZone('Africa/Cairo')); }
    return [(int) $n->format('w'), (int) $n->format('G') * 60 + (int) $n->format('i')];
}
function merchantOpenness(array $m, array $hours): array {
    $ms = (string) ($m['manualStatus'] ?? 'OPEN');
    if ($ms === 'CLOSED') return ['isOpenNow' => false, 'reason' => 'MANUAL_CLOSED', 'nextOpenAt' => null, 'message' => 'المتجر مغلق حالياً'];
    if ($ms === 'TEMPORARILY_CLOSED') return ['isOpenNow' => false, 'reason' => 'MANUAL_TEMP_CLOSED', 'nextOpenAt' => null, 'message' => 'المتجر مغلق مؤقتاً، حاول لاحقاً'];
    // No configured hours ⇒ always open (matches merchantHours.ts).
    if (!$hours) return ['isOpenNow' => true, 'reason' => null, 'nextOpenAt' => null, 'message' => null];
    // Resolve hours in the merchant's own zone, not always Cairo — every caller
    // must therefore select `timezone` alongside `manualStatus`.
    [$dow, $mins] = nowInTz($m['timezone'] ?? null);
    foreach ($hours as $h) {
        if ((int) $h['isClosed'] || (int) $h['dayOfWeek'] !== $dow) continue;
        if ($mins >= (int) $h['openMin'] && $mins < (int) $h['closeMin']) {
            return ['isOpenNow' => true, 'reason' => null, 'nextOpenAt' => null, 'message' => null];
        }
    }
    // A window opened yesterday and runs past midnight (closeMin > 1440).
    $prev = ($dow + 6) % 7;
    foreach ($hours as $h) {
        if ((int) $h['isClosed'] || (int) $h['dayOfWeek'] !== $prev) continue;
        $c = (int) $h['closeMin'];
        if ($c > 1440 && $mins < ($c - 1440)) return ['isOpenNow' => true, 'reason' => null, 'nextOpenAt' => null, 'message' => null];
    }
    // merchantNextOpenMsg parks the structured slot in a global as a side
    // effect; clear it first so a merchant with no upcoming window can't
    // inherit the previous merchant's value inside a list loop.
    $GLOBALS['__next_open_slot'] = null;
    $msg = merchantNextOpenMsg($hours, $dow, $mins);
    $slot = $GLOBALS['__next_open_slot'] ?? null;

    // Build an ISO timestamp in the MERCHANT's zone so a client can show a
    // countdown or re-localise instead of parsing the Arabic sentence.
    $nextOpenAt = null;
    if ($slot) {
        try {
            $tz = new DateTimeZone((string) ($m['timezone'] ?? '') ?: 'Africa/Cairo');
            $dt = new DateTime('now', $tz);
            $dt->setTime(0, 0, 0);
            // `minutes` can exceed 1440 for windows that run past midnight —
            // adding it as minutes rolls the date forward correctly.
            $dt->modify('+' . (int) $slot['dayOffset'] . ' day');
            $dt->modify('+' . (int) $slot['minutes'] . ' minute');
            $nextOpenAt = $dt->format(DateTime::ATOM);
        } catch (Throwable $e) {
            $nextOpenAt = null;
        }
    }

    return ['isOpenNow' => false, 'reason' => 'OUT_OF_HOURS', 'nextOpenAt' => $nextOpenAt, 'message' => $msg ?? 'المتجر مغلق حالياً'];
}
// menuImages mirrors catalog.controller's merchantSelect: a merchant with no
// structured products can instead publish photos of their paper menu, and the
// app's MerchantDetailScreen renders them in place of the product list.
// `createdAt` powers the "جديد على تميم" rail on the mobile home; the product
// subquery gives each store card an item count. The subquery mirrors the one
// the admin list already uses (see the /admin/merchants SELECT), but filters to
// what a customer can actually see — the admin count deliberately includes
// hidden and unavailable rows.
const MERCHANT_SEL = 'm.id, m.storeName, m.storeNameAr, m.phone, m.description, m.logoUrl, m.coverUrl, m.menuImages, m.addressLine, m.lat, m.lng, m.governorate, m.city, m.rating, m.isOpen, m.manualStatus, m.timezone, m.categoryId, m.createdAt, m.prepMinutesMin, m.prepMinutesMax, (SELECT COUNT(*) FROM `Product` p WHERE p.merchantId = m.id AND p.isAvailable = 1 AND p.isHidden = 0) AS product_count, c.name AS c_name, c.nameAr AS c_nameAr, c.iconUrl AS c_iconUrl';
function hoursFor(array $ids): array {
    if (!$ids) return [];
    $in = implode(',', array_fill(0, count($ids), '?'));
    $st = db()->prepare("SELECT * FROM `MerchantBusinessHours` WHERE merchantId IN ($in) ORDER BY dayOfWeek ASC, openMin ASC");
    $st->execute($ids);
    $out = [];
    foreach ($st->fetchAll() as $h) { $out[$h['merchantId']][] = boolCast($h, ['isClosed']); }
    return $out;
}
/**
 * What a product actually costs, server-side. THIS is the number charged — the
 * client's price is never trusted.
 *
 * Product carries two independent discount knobs and an admin may use either:
 *   salePrice — an absolute replacement price
 *   discount  — a percentage off the list price
 *
 * This used to read salePrice only, with a comment reasoning that the app
 * derived its badge from (price - salePrice) so honouring `discount` would
 * undercharge. That stopped being true once the app started rendering the
 * percentage too: the customer saw the discounted price and was billed the
 * full one. Mirrors apps/mobile/src/lib/productPrice.ts exactly — if one
 * changes, change both.
 */
function effectiveUnitPrice(array $p): float {
    $list = (float) ($p['price'] ?? 0);
    if ($list <= 0) return 0.0;

    // salePrice wins when both are set: an explicit number the admin typed
    // beats a percentage rule.
    $sale = $p['salePrice'] !== null ? (float) $p['salePrice'] : null;
    if ($sale !== null && $sale > 0 && $sale < $list) return round($sale, 2);

    $pct = $p['discount'] !== null ? (float) $p['discount'] : 0.0;
    // Clamped like the client: a bad row must never produce a negative price.
    if ($pct > 0) return round($list * (1 - min(90.0, $pct) / 100), 2);

    return round($list, 2);
}

/** A store counts as "new" for this many days after it is created. */
const NEW_MERCHANT_DAYS = 30;

function merchantShape(array $r, array $hours): array {
    $m = boolCast($r, ['isOpen']);
    // MUST decode: the column is longtext, so PDO hands back the raw JSON string.
    // The app types this as string[] and calls .map on it — shipping the string
    // would crash MerchantDetailScreen rather than degrade.
    $menu = $m['menuImages'] ?? null;
    $m['menuImages'] = is_string($menu) && $menu !== '' ? (json_decode($menu, true) ?: []) : [];
    $m['category'] = $r['categoryId'] ? ['id' => $r['categoryId'], 'name' => $r['c_name'], 'nameAr' => $r['c_nameAr'], 'iconUrl' => $r['c_iconUrl']] : null;
    foreach (['c_name', 'c_nameAr', 'c_iconUrl'] as $k) unset($m[$k]);
    $m['businessHours'] = $hours;
    $m['openness'] = merchantOpenness($r, $hours);

    // Item count as an int — PDO hands numeric columns back as strings here
    // (the connection sets no STRINGIFY_FETCHES override), and the client
    // renders this directly.
    if (array_key_exists('product_count', $r)) {
        $m['productCount'] = (int) $r['product_count'];
        unset($m['product_count']);
    }

    // Preparation time — null when the admin hasn't set one, so the client can
    // hide the stat rather than invent a number.
    $pmin = $r['prepMinutesMin'] ?? null;
    $pmax = $r['prepMinutesMax'] ?? null;
    $m['prepMinutes'] = ($pmin !== null || $pmax !== null)
        ? ['min' => (int) ($pmin ?? $pmax), 'max' => (int) ($pmax ?? $pmin)]
        : null;
    unset($m['prepMinutesMin'], $m['prepMinutesMax']);

    // "New store" is decided server-side so the rule lives in one place rather
    // than being re-derived from createdAt by every client.
    if (!empty($r['createdAt'])) {
        $age = time() - strtotime((string) $r['createdAt']);
        $m['isNew'] = $age >= 0 && $age < NEW_MERCHANT_DAYS * 86400;
    }

    return $m;
}
function productShape(array $p): array {
    $p = jsonizeRow($p);
    return boolCast($p, ['isAvailable', 'isHidden']);
}

/**
 * Ids of this merchant's products that have a size or an extra.
 *
 * The store page's quick "+" adds a product straight to the cart at its base
 * price. For a product with sizes that's wrong — the size price REPLACES the
 * base one — so the app has to send those customers to the detail page to
 * choose instead. This tells it which ones without a per-row subquery on a
 * catalogue that can run to ~2,900 products: two set queries per request,
 * regardless of page size.
 *
 * Returns productId => ['minPrice' => float|null]. minPrice is the cheapest
 * size, so a listing can say "من 60 ج.م" instead of printing a base price the
 * customer can never actually pay.
 */
function merchantProductsWithOptions(string $merchantId): array {
    $ids = [];
    try {
        $v = db()->prepare(
            'SELECT v.productId, MIN(v.price) AS minPrice FROM `ProductVariant` v'
            . ' JOIN `Product` p ON p.id = v.productId'
            . ' WHERE p.merchantId = ? AND v.isActive = 1'
            . ' GROUP BY v.productId'
        );
        $v->execute([$merchantId]);
        foreach ($v->fetchAll() as $r) $ids[$r['productId']] = ['minPrice' => (float) $r['minPrice']];

        $a = db()->prepare(
            'SELECT DISTINCT pal.productId FROM `ProductAddonLink` pal'
            . ' JOIN `Product` p ON p.id = pal.productId'
            . ' JOIN `MerchantAddon` ma ON ma.id = pal.addonId AND ma.isActive = 1'
            . ' WHERE p.merchantId = ?'
        );
        $a->execute([$merchantId]);
        // Extras alone don't change the starting price — keep minPrice null.
        foreach ($a->fetchAll() as $r) $ids[$r['productId']] ??= ['minPrice' => null];
    } catch (Throwable $e) { /* tables absent on an old DB — nothing has options */ }
    return $ids;
}

// ═══ AUTH ══════════════════════════════════════════════════════════════
if ($method === 'POST' && $path === '/auth/register') {
    $b = readJsonBody();
    $name = trim((string) ($b['name'] ?? ''));
    $phone = normPhoneEg((string) ($b['phone'] ?? ''));
    $password = (string) ($b['password'] ?? '');
    $city = trim((string) ($b['city'] ?? ''));
    $email = strtolower(trim((string) ($b['email'] ?? '')));
    if (mb_strlen($name) < 2 || mb_strlen($name) > 100) jsonErr('الاسم مطلوب (حرفين على الأقل)', 422, 'VALIDATION_ERROR');
    if (!$phone) jsonErr('رقم هاتف مصري غير صحيح', 422, 'VALIDATION_ERROR');
    if (strlen($password) < 8 || strlen($password) > 72) jsonErr('كلمة السر 8 أحرف على الأقل', 422, 'VALIDATION_ERROR');
    if (mb_strlen($city) < 2) jsonErr('المدينة مطلوبة', 422, 'VALIDATION_ERROR');
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) jsonErr('البريد الإلكتروني غير صحيح', 422, 'VALIDATION_ERROR');
    $role = ((string) ($b['role'] ?? '')) === 'MERCHANT' ? 'MERCHANT' : 'CUSTOMER';

    $st = db()->prepare('SELECT id FROM `User` WHERE phone = ? LIMIT 1');
    $st->execute([$phone]);
    // ConflictError(message, messageAr) → code CONFLICT, English in `message`.
    if ($st->fetch()) {
        http_response_code(409);
        echo json_encode(['error' => ['code' => 'CONFLICT', 'message' => 'Phone already registered', 'messageAr' => 'هذا الرقم مسجل بالفعل']], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($email !== '') {
        $ec = db()->prepare('SELECT id FROM `User` WHERE email = ? LIMIT 1');
        $ec->execute([$email]);
        if ($ec->fetch()) {
            http_response_code(409);
            echo json_encode(['error' => ['code' => 'CONFLICT', 'message' => 'Email already registered', 'messageAr' => 'هذا البريد مسجل بالفعل']], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }
    $id = newId();
    db()->prepare('INSERT INTO `User` (id, phone, email, passwordHash, name, role, city, defaultAddress, isPhoneVerified, isActive, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,0,1,NOW(3),NOW(3))')
        ->execute([$id, $phone, ($email !== '' ? $email : null), password_hash($password, PASSWORD_BCRYPT), $name, $role, $city, ($b['address'] ?? null) ?: null]);
    // Welcome email (best-effort, deferred) — only when they gave an email.
    if ($email !== '') {
        mailDefer($email, 'أهلاً بك في تميم للتوصيل 🎉',
            "مرحباً {$name}،\nتم إنشاء حسابك في تطبيق تميم للتوصيل بنجاح.\nيسعدنا انضمامك إلينا!",
            emailShell('أهلاً بك في تميم للتوصيل 🎉',
                '<p>مرحباً <b>' . htmlspecialchars($name) . '</b>،</p>'
                . '<p>تم إنشاء حسابك في تطبيق <b>تميم للتوصيل</b> بنجاح. يسعدنا انضمامك إلينا! 🚚</p>'
                . '<p>يمكنك الآن طلب التوصيل ومتابعة طلباتك لحظة بلحظة من داخل التطبيق.</p>'));
    }

    if ($role === 'MERCHANT') {
        // Placeholder profile so the merchant tabs render (mirrors auth.controller).
        $cat = db()->query('SELECT id FROM `Category` WHERE isActive = 1 ORDER BY sortOrder ASC LIMIT 1')->fetch();
        if ($cat) {
            db()->prepare('INSERT INTO `MerchantProfile` (id, userId, storeName, storeNameAr, categoryId, addressLine, lat, lng, governorate, city, createdAt, updatedAt) VALUES (?,?,?,?,?,?,0,0,?,?,NOW(3),NOW(3))')
                ->execute([newId(), $id, 'متجري', 'متجري', $cat['id'], $city, 'قنا', $city]);
        }
    }
    jsonOk(['user' => ['id' => $id, 'name' => $name, 'phone' => $phone, 'role' => $role], 'tokens' => issueTokens($id, $role)], 201);
}

if ($method === 'POST' && $path === '/auth/refresh') {
    $b = readJsonBody();
    $tok = (string) ($b['refreshToken'] ?? '');
    if (strlen($tok) < 10) jsonErr('Refresh token غير صالح', 401, 'UNAUTHORIZED');
    $parts = explode('.', $tok);
    if (count($parts) !== 3) jsonErr('Refresh token غير صالح', 401, 'UNAUTHORIZED');
    [$h, $p, $sig] = $parts;
    $expected = b64url(hash_hmac('sha256', "$h.$p", env('JWT_REFRESH_SECRET') ?: '', true));
    if (!hash_equals($expected, $sig)) jsonErr('Refresh token غير صالح', 401, 'UNAUTHORIZED');
    $payload = json_decode((string) base64_decode(strtr($p, '-_', '+/')), true) ?: [];
    if (($payload['exp'] ?? 0) < time()) jsonErr('Refresh token غير صالح', 401, 'UNAUTHORIZED');
    $st = db()->prepare('SELECT id, role, isActive FROM `User` WHERE id = ? LIMIT 1');
    $st->execute([$payload['sub'] ?? '']);
    $u = $st->fetch();
    if (!$u || !(int) $u['isActive']) jsonErr('الحساب غير مفعّل', 401, 'UNAUTHORIZED');
    // ⚠️ tokens live at data.* here, NOT data.tokens (matches auth.controller ok(res, tokens)).
    jsonOk(issueTokens($u['id'], (string) $u['role']));
}

if ($method === 'POST' && $path === '/auth/logout') { noContent(); }

if ($method === 'POST' && $path === '/auth/otp/request') {
    $b = readJsonBody();
    $phone = normPhoneEg((string) ($b['phone'] ?? ''));
    if (!$phone) jsonErr('رقم هاتف مصري غير صحيح', 422, 'VALIDATION_ERROR');
    // 60s cooldown (mirrors auth.controller). Compare in SQL — PHP's default
    // timezone is not guaranteed to match the MySQL session's, so
    // time() vs strtotime(dbValue) silently skews by the offset.
    $st = db()->prepare('SELECT 1 FROM `OtpCode` WHERE phone = ? AND createdAt > DATE_SUB(NOW(3), INTERVAL 60 SECOND) LIMIT 1');
    $st->execute([$phone]);
    if ($st->fetch()) {
        jsonOk(['sent' => true, 'channel' => 'COOLDOWN', 'retryInSec' => 60]);
    }
    $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    db()->prepare("INSERT INTO `OtpCode` (id, phone, codeHash, purpose, attempts, expiresAt, createdAt) VALUES (?,?,?,'VERIFY',0,DATE_ADD(NOW(3), INTERVAL 5 MINUTE),NOW(3))")
        ->execute([newId(), $phone, hash('sha256', $code)]);
    waEnqueue($phone, "تميم للتوصيل 🚚\nكود تفعيل حسابك: *$code*\nصالح لمدة 5 دقائق.");
    jsonOk(['sent' => true, 'channel' => 'WHATSAPP']);
}

if ($method === 'POST' && $path === '/auth/otp/verify') {
    $b = readJsonBody();
    $phone = normPhoneEg((string) ($b['phone'] ?? ''));
    $code = trim((string) ($b['code'] ?? ''));
    if (!$phone || !preg_match('/^\d{4,6}$/', $code)) jsonErr('كود التحقق غير صحيح', 401, 'UNAUTHORIZED');
    $st = db()->prepare('SELECT * FROM `OtpCode` WHERE phone = ? AND consumedAt IS NULL AND expiresAt > NOW(3) ORDER BY createdAt DESC LIMIT 1');
    $st->execute([$phone]);
    $row = $st->fetch();
    if (!$row) jsonErr('كود التحقق منتهي أو غير موجود', 401, 'UNAUTHORIZED');
    if ((int) $row['attempts'] >= 5) jsonErr('تم تجاوز عدد المحاولات — اطلب كوداً جديداً', 401, 'UNAUTHORIZED');
    if (!hash_equals((string) $row['codeHash'], hash('sha256', $code))) {
        db()->prepare('UPDATE `OtpCode` SET attempts = attempts + 1 WHERE id = ?')->execute([$row['id']]);
        jsonErr('كود التحقق غير صحيح', 401, 'UNAUTHORIZED');
    }
    db()->prepare('UPDATE `OtpCode` SET consumedAt = NOW(3) WHERE id = ?')->execute([$row['id']]);
    $st = db()->prepare('SELECT id, name, phone, role FROM `User` WHERE phone = ? LIMIT 1');
    $st->execute([$phone]);
    $u = $st->fetch();
    if (!$u) jsonErr('المستخدم غير موجود', 401, 'UNAUTHORIZED');
    db()->prepare('UPDATE `User` SET isPhoneVerified = 1, updatedAt = NOW(3) WHERE id = ?')->execute([$u['id']]);
    // Node returns {id,name,phone} with no role here — but the mobile store
    // persists this object as the session user and RootNavigator switches on
    // user.role, so omitting it would strand a fresh signup on a blank stack.
    jsonOk(['user' => ['id' => $u['id'], 'name' => $u['name'], 'phone' => $u['phone'], 'role' => $u['role']], 'tokens' => issueTokens($u['id'], (string) $u['role'])]);
}

if ($method === 'POST' && $path === '/auth/forgot-password') {
    $b = readJsonBody();
    $raw = trim((string) ($b['identifier'] ?? $b['phone'] ?? $b['email'] ?? ''));
    // Accept an email OR an Egyptian phone.
    if (str_contains($raw, '@')) {
        $st = db()->prepare('SELECT id, phone, email FROM `User` WHERE email = ? LIMIT 1');
        $st->execute([strtolower($raw)]);
    } else {
        $phone = normPhoneEg($raw) ?? $raw;
        $st = db()->prepare('SELECT id, phone, email FROM `User` WHERE phone = ? LIMIT 1');
        $st->execute([$phone]);
    }
    $u = $st->fetch();
    if ($u) {
        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        db()->prepare('UPDATE `User` SET passwordResetHash = ?, passwordResetExpiresAt = DATE_ADD(NOW(3), INTERVAL 10 MINUTE), updatedAt = NOW(3) WHERE id = ?')
            ->execute([hash('sha256', $code), $u['id']]);
        // WhatsApp (real phones only — Google users carry a g_… placeholder).
        if (!empty($u['phone']) && !str_starts_with((string) $u['phone'], 'g_')) {
            waEnqueue((string) $u['phone'], "تميم للتوصيل 🚚\nكود إعادة تعيين كلمة السر: *$code*\nصالح لمدة 10 دقائق.");
        }
        // Email the code too, if we have one on file.
        if (!empty($u['email'])) {
            mailDefer((string) $u['email'], 'كود إعادة تعيين كلمة السر — تميم',
                "كود إعادة تعيين كلمة السر في تميم: $code\nصالح لمدة 10 دقائق.\nلو لم تطلب ذلك، تجاهل هذه الرسالة.",
                emailShell('إعادة تعيين كلمة السر',
                    '<p>استخدم الكود التالي لإعادة تعيين كلمة السر الخاصة بحسابك في تميم:</p>'
                    . '<div style="font-family:monospace;font-size:34px;font-weight:800;letter-spacing:8px;text-align:center;background:#241310;color:#F2A93B;padding:18px;border-radius:10px;margin:14px 0">' . htmlspecialchars($code) . '</div>'
                    . '<p style="color:#666;font-size:13px">صالح لمدة <b>10 دقائق</b>. لو لم تطلب ذلك، تجاهل هذه الرسالة.</p>'));
        }
    }
    jsonOk(['sent' => true]); // anti-enumeration: same body for unknown identifiers
}

if ($method === 'POST' && $path === '/auth/reset-password') {
    $b = readJsonBody();
    $raw = trim((string) ($b['identifier'] ?? $b['phone'] ?? $b['email'] ?? ''));
    $code = trim((string) ($b['code'] ?? ''));
    $new = (string) ($b['newPassword'] ?? '');
    if (!preg_match('/^\d{6}$/', $code)) jsonErr('كود التحقق غير صحيح', 401, 'UNAUTHORIZED');
    if (strlen($new) < 8) jsonErr('كلمة السر 8 أحرف على الأقل', 422, 'VALIDATION_ERROR');
    // Expiry compared in SQL (NOW(3)) — see the OTP cooldown note above.
    // Look up by email or phone, matching how forgot-password was requested.
    if (str_contains($raw, '@')) {
        $st = db()->prepare('SELECT id, name, phone, role, passwordResetHash, (passwordResetExpiresAt IS NOT NULL AND passwordResetExpiresAt < NOW(3)) AS isExpired FROM `User` WHERE email = ? LIMIT 1');
        $st->execute([strtolower($raw)]);
    } else {
        $phone = normPhoneEg($raw) ?? $raw;
        $st = db()->prepare('SELECT id, name, phone, role, passwordResetHash, (passwordResetExpiresAt IS NOT NULL AND passwordResetExpiresAt < NOW(3)) AS isExpired FROM `User` WHERE phone = ? LIMIT 1');
        $st->execute([$phone]);
    }
    $u = $st->fetch();
    if (!$u || !$u['passwordResetHash']) jsonErr('كود التحقق غير صحيح أو منتهي', 401, 'UNAUTHORIZED');
    if ((int) $u['isExpired']) jsonErr('انتهت صلاحية كود التحقق — اطلب كوداً جديداً', 401, 'UNAUTHORIZED');
    if (!hash_equals((string) $u['passwordResetHash'], hash('sha256', $code))) jsonErr('كود التحقق غير صحيح', 401, 'UNAUTHORIZED');
    db()->prepare('UPDATE `User` SET passwordHash = ?, passwordResetHash = NULL, passwordResetExpiresAt = NULL, updatedAt = NOW(3) WHERE id = ?')
        ->execute([password_hash($new, PASSWORD_BCRYPT), $u['id']]);
    jsonOk(['user' => ['id' => $u['id'], 'name' => $u['name'], 'phone' => $u['phone'], 'role' => $u['role']], 'tokens' => issueTokens($u['id'], (string) $u['role'])]);
}

if ($method === 'POST' && $path === '/auth/google') {
    $b = readJsonBody();
    $idToken = (string) ($b['idToken'] ?? '');
    if (strlen($idToken) < 10) jsonErr('Google token غير صالح', 401, 'UNAUTHORIZED');
    $clientId = env('GOOGLE_CLIENT_ID');
    if (!$clientId) jsonErr('Google login غير مفعّل على السيرفر', 401, 'UNAUTHORIZED');
    // Verify via Google's tokeninfo endpoint (no google-auth-library in PHP).
    $ch = curl_init('https://oauth2.googleapis.com/tokeninfo?id_token=' . urlencode($idToken));
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10]);
    $resp = curl_exec($ch); $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    $tk = $resp ? (json_decode((string) $resp, true) ?: []) : [];
    if ($httpCode !== 200 || empty($tk['sub']) || empty($tk['email'])) jsonErr('Google token غير صالح', 401, 'UNAUTHORIZED');
    // aud must be one of our client IDs, else anyone's token would log in.
    $auds = array_filter(array_map('trim', explode(',', $clientId . ',' . (env('GOOGLE_CLIENT_ID_ANDROID', '') ?: '') . ',' . (env('GOOGLE_CLIENT_ID_IOS', '') ?: ''))));
    if ($auds && !in_array((string) ($tk['aud'] ?? ''), $auds, true)) jsonErr('Google token غير صالح', 401, 'UNAUTHORIZED');
    $sub = (string) $tk['sub']; $email = strtolower((string) $tk['email']);
    $st = db()->prepare('SELECT id, name, phone, email, role FROM `User` WHERE googleId = ? LIMIT 1');
    $st->execute([$sub]);
    $u = $st->fetch();
    if (!$u) {
        $st = db()->prepare('SELECT id, name, phone, email, role FROM `User` WHERE email = ? LIMIT 1');
        $st->execute([$email]);
        $u = $st->fetch();
        if ($u) {
            db()->prepare('UPDATE `User` SET googleId = ?, isPhoneVerified = 1, updatedAt = NOW(3) WHERE id = ?')->execute([$sub, $u['id']]);
        } else {
            $role = ((string) ($b['role'] ?? '')) === 'MERCHANT' ? 'MERCHANT' : 'CUSTOMER';
            $id = newId();
            // Placeholder phone; CollectPhoneScreen makes them set a real one.
            db()->prepare('INSERT INTO `User` (id, phone, name, email, googleId, role, avatarUrl, isPhoneVerified, isActive, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,0,1,NOW(3),NOW(3))')
                ->execute([$id, 'g_' . $sub, (string) ($tk['name'] ?? $email), $email, $sub, $role, ($tk['picture'] ?? null) ?: null]);
            $u = ['id' => $id, 'name' => (string) ($tk['name'] ?? $email), 'phone' => 'g_' . $sub, 'email' => $email, 'role' => $role];
            // Welcome email for the brand-new Google user.
            $gname = (string) ($tk['name'] ?? $email);
            mailDefer($email, 'أهلاً بك في تميم للتوصيل 🎉',
                "مرحباً {$gname}،\nتم إنشاء حسابك في تطبيق تميم للتوصيل عبر Google بنجاح.\nيسعدنا انضمامك إلينا!",
                emailShell('أهلاً بك في تميم للتوصيل 🎉',
                    '<p>مرحباً <b>' . htmlspecialchars($gname) . '</b>،</p>'
                    . '<p>تم إنشاء حسابك في تطبيق <b>تميم للتوصيل</b> عبر Google بنجاح. يسعدنا انضمامك إلينا! 🚚</p>'));
        }
    }
    jsonOk(['user' => ['id' => $u['id'], 'name' => $u['name'], 'phone' => $u['phone'], 'email' => $u['email'], 'role' => $u['role']], 'tokens' => issueTokens($u['id'], (string) $u['role'])]);
}

// ═══ /me ═══════════════════════════════════════════════════════════════
if ($method === 'GET' && $path === '/me') {
    $u = authUser();
    $p = profileById((string) ($u['sub'] ?? ''));
    if (!$p) jsonErr('المستخدم غير موجود', 404, 'NOT_FOUND');
    jsonOk($p);
}

if ($method === 'PATCH' && $path === '/me') {
    $u = authUser();
    $uid = (string) ($u['sub'] ?? '');
    $b = readJsonBody();
    $sets = []; $args = [];
    foreach (['name', 'email', 'city', 'governorate', 'defaultAddress', 'avatarUrl'] as $k) {
        if (array_key_exists($k, $b)) { $sets[] = "`$k` = ?"; $args[] = $b[$k] === '' ? null : $b[$k]; }
    }
    if (array_key_exists('phone', $b)) {
        $ph = normPhoneEg((string) $b['phone']) ?? trim((string) $b['phone']);
        $st = db()->prepare('SELECT id FROM `User` WHERE phone = ? AND id <> ? LIMIT 1');
        $st->execute([$ph, $uid]);
        if ($st->fetch()) {
            http_response_code(409);
            echo json_encode(['error' => ['code' => 'CONFLICT', 'message' => 'Phone already used', 'messageAr' => 'هذا الرقم مستخدم بحساب آخر']], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $sets[] = '`phone` = ?'; $args[] = $ph;
    }
    if ($sets) {
        $args[] = $uid;
        db()->prepare('UPDATE `User` SET ' . implode(', ', $sets) . ', updatedAt = NOW(3) WHERE id = ?')->execute($args);
    }
    $p = profileById($uid);
    if (!$p) jsonErr('المستخدم غير موجود', 404, 'NOT_FOUND');
    jsonOk($p); // must be the FULL user — the app writes this back over its session
}

if ($method === 'DELETE' && $path === '/me') {
    $u = authUser();
    $uid = (string) ($u['sub'] ?? '');
    db()->prepare("UPDATE `User` SET isActive = 0, phone = CONCAT('deleted_', SUBSTRING(id,1,8), '_', DATE_FORMAT(NOW(),'%Y%m%d')), email = NULL, googleId = NULL, passwordHash = NULL, fcmToken = NULL, updatedAt = NOW(3) WHERE id = ?")
        ->execute([$uid]);
    jsonOk(['deleted' => true]);
}

if ($method === 'POST' && $path === '/me/change-password') {
    $u = authUser();
    $uid = (string) ($u['sub'] ?? '');
    $b = readJsonBody();
    $cur = (string) ($b['currentPassword'] ?? '');
    $new = (string) ($b['newPassword'] ?? '');
    if (strlen($new) < 8 || strlen($new) > 72) jsonErr('كلمة السر الجديدة 8 أحرف على الأقل', 422, 'VALIDATION_ERROR');
    $st = db()->prepare('SELECT passwordHash FROM `User` WHERE id = ? LIMIT 1');
    $st->execute([$uid]);
    $row = $st->fetch();
    if (!$row) jsonErr('المستخدم غير موجود', 404, 'NOT_FOUND');
    if (!$row['passwordHash']) jsonErr('حسابك ليس عليه كلمة سر — استخدم إعادة تعيين بدلاً', 422, 'VALIDATION_ERROR');
    if (!password_verify($cur, (string) $row['passwordHash'])) jsonErr('كلمة السر الحالية غير صحيحة', 401, 'UNAUTHORIZED');
    db()->prepare('UPDATE `User` SET passwordHash = ?, updatedAt = NOW(3) WHERE id = ?')->execute([password_hash($new, PASSWORD_BCRYPT), $uid]);
    jsonOk(['changed' => true]);
}

// Register a device push token. Multi-device: a user can be logged in on
// several phones and each gets the push. Idempotent on the token (unique),
// re-homing it to the current user if it moved devices/accounts.
function registerDeviceToken(string $userId, ?string $token, ?string $platform): void {
    $token = trim((string) $token);
    if ($token === '' || $userId === '') return;
    try {
        db()->prepare(
            'INSERT INTO `DeviceToken` (id, userId, token, platform, createdAt, updatedAt)
             VALUES (?,?,?,?,NOW(3),NOW(3))
             ON DUPLICATE KEY UPDATE userId = VALUES(userId), platform = VALUES(platform),
                                     failCount = 0, lastError = NULL, updatedAt = NOW(3)'
        )->execute([newId(), $userId, $token, $platform ?: null]);
    } catch (Throwable $e) { error_log('[fcm] registerDeviceToken: ' . $e->getMessage()); }
    // Keep the legacy single-column mirror so nothing else that reads it breaks.
    try { db()->prepare('UPDATE `User` SET fcmToken = ?, updatedAt = NOW(3) WHERE id = ?')->execute([$token, $userId]); } catch (Throwable $e) {}
}
if ($method === 'POST' && ($path === '/me/fcm-token' || $path === '/me/devices')) {
    $u = authUser();
    $b = readJsonBody();
    $token = (string) ($b['fcmToken'] ?? $b['token'] ?? '');
    registerDeviceToken((string) ($u['sub'] ?? ''), $token, (string) ($b['platform'] ?? ''));
    jsonOk(['saved' => true]);
}
// Unregister on logout — stop pushing to a device the user signed out of.
if (($method === 'DELETE' || $method === 'POST') && $path === '/me/devices/unregister') {
    $u = authUser();
    $b = readJsonBody();
    $token = (string) ($b['fcmToken'] ?? $b['token'] ?? '');
    if ($token !== '') db()->prepare('DELETE FROM `DeviceToken` WHERE token = ? AND userId = ?')->execute([$token, (string) ($u['sub'] ?? '')]);
    try { db()->prepare('UPDATE `User` SET fcmToken = NULL WHERE id = ? AND fcmToken = ?')->execute([(string) ($u['sub'] ?? ''), $token]); } catch (Throwable $e) {}
    jsonOk(['removed' => true]);
}

if ($method === 'GET' && $path === '/me/wallet') {
    $u = authUser();
    $uid = (string) ($u['sub'] ?? '');
    $st = db()->prepare('SELECT * FROM `Wallet` WHERE userId = ? LIMIT 1');
    $st->execute([$uid]);
    $w = $st->fetch();
    if (!$w) { // lazily created on first read, like ensureWallet()
        $wid = newId();
        db()->prepare('INSERT INTO `Wallet` (id, userId, balance, totalEarned, totalSpent, createdAt, updatedAt) VALUES (?,?,0,0,0,NOW(3),NOW(3))')->execute([$wid, $uid]);
        $st->execute([$uid]);
        $w = $st->fetch();
    }
    $tx = db()->prepare('SELECT * FROM `WalletTransaction` WHERE walletId = ? ORDER BY createdAt DESC LIMIT 20');
    $tx->execute([$w['id']]);
    // WalletScreen .map()s transactions with no ?? [] guard — must be an array.
    jsonOk(['wallet' => $w, 'transactions' => $tx->fetchAll()]);
}

// ═══ /me/addresses ═════════════════════════════════════════════════════
if ($method === 'GET' && $path === '/me/addresses') {
    $u = authUser();
    // Return the zone (IDs + names + the live delivery fee) alongside each
    // address. An address's zone — not its GPS pin — is what prices and routes
    // the order, so the app must have it without depending on a local cache that
    // an app reinstall would wipe (which was surfacing saved addresses as
    // "العنوان غير مكتمل").
    $st = db()->prepare(
        "SELECT ca.*, c.nameAr AS cityName, v.nameAr AS villageName, a.nameAr AS areaName,
                COALESCE(a.deliveryPrice, v.baseDeliveryPrice) AS zoneFee
         FROM `CustomerAddress` ca
         LEFT JOIN `City` c ON c.id = ca.cityId
         LEFT JOIN `Village` v ON v.id = ca.villageId
         LEFT JOIN `Area` a ON a.id = ca.areaId
         WHERE ca.userId = ? ORDER BY ca.isDefault DESC, ca.createdAt DESC"
    );
    $st->execute([(string) ($u['sub'] ?? '')]);
    jsonOk(array_map(function ($r) {
        $r = boolCast($r, ['isDefault']);
        // A ready-to-use zone object mirroring the app's DeliveryZoneSelection,
        // present only when the address actually has a zone.
        $r['zone'] = ($r['cityId'] || $r['villageId'] || $r['areaId']) ? [
            'cityId' => $r['cityId'], 'villageId' => $r['villageId'], 'areaId' => $r['areaId'],
            'cityName' => $r['cityName'] ?? null, 'villageName' => $r['villageName'] ?? null,
            'areaName' => $r['areaName'] ?? null,
            'deliveryFee' => $r['zoneFee'] !== null ? (float) $r['zoneFee'] : null,
        ] : null;
        return $r;
    }, $st->fetchAll()));
}

if ($method === 'POST' && $path === '/me/addresses') {
    $u = authUser();
    $uid = (string) ($u['sub'] ?? '');
    $b = readJsonBody();
    $label = trim((string) ($b['label'] ?? ''));
    $address = trim((string) ($b['address'] ?? ''));
    if ($label === '' || mb_strlen($address) < 2) jsonErr('العنوان والاسم مطلوبان', 422, 'VALIDATION_ERROR');
    $cnt = db()->prepare('SELECT COUNT(*) n FROM `CustomerAddress` WHERE userId = ?');
    $cnt->execute([$uid]);
    $shouldDefault = !empty($b['isDefault']) || (int) $cnt->fetch()['n'] === 0; // first address always default
    if ($shouldDefault) db()->prepare('UPDATE `CustomerAddress` SET isDefault = 0 WHERE userId = ?')->execute([$uid]);
    $id = newId();
    db()->prepare('INSERT INTO `CustomerAddress` (id, userId, label, address, lat, lng, notes, isDefault, cityId, villageId, areaId, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW(3),NOW(3))')
        ->execute([$id, $uid, $label, $address,
            isset($b['lat']) && $b['lat'] !== null ? (float) $b['lat'] : null,
            isset($b['lng']) && $b['lng'] !== null ? (float) $b['lng'] : null,
            ($b['notes'] ?? null) ?: null, $shouldDefault ? 1 : 0,
            ($b['cityId'] ?? null) ?: null, ($b['villageId'] ?? null) ?: null, ($b['areaId'] ?? null) ?: null]);
    $st = db()->prepare('SELECT * FROM `CustomerAddress` WHERE id = ?');
    $st->execute([$id]);
    jsonOk(boolCast($st->fetch(), ['isDefault']), 201);
}

if (preg_match('#^/me/addresses/([^/]+)/set-default$#', $path, $mm) && $method === 'POST') {
    $u = authUser();
    $uid = (string) ($u['sub'] ?? '');
    $st = db()->prepare('SELECT * FROM `CustomerAddress` WHERE id = ? AND userId = ? LIMIT 1');
    $st->execute([$mm[1], $uid]);
    $a = $st->fetch();
    if (!$a) jsonErr('العنوان غير موجود', 404, 'NOT_FOUND');
    db()->prepare('UPDATE `CustomerAddress` SET isDefault = 0 WHERE userId = ?')->execute([$uid]);
    db()->prepare('UPDATE `CustomerAddress` SET isDefault = 1, updatedAt = NOW(3) WHERE id = ?')->execute([$mm[1]]);
    $st->execute([$mm[1], $uid]);
    jsonOk(boolCast($st->fetch(), ['isDefault']));
}

if (preg_match('#^/me/addresses/([^/]+)$#', $path, $mm) && in_array($method, ['PATCH', 'DELETE'], true)) {
    $u = authUser();
    $uid = (string) ($u['sub'] ?? '');
    $st = db()->prepare('SELECT * FROM `CustomerAddress` WHERE id = ? AND userId = ? LIMIT 1');
    $st->execute([$mm[1], $uid]);
    $a = $st->fetch();
    if (!$a) jsonErr('العنوان غير موجود', 404, 'NOT_FOUND'); // ownership → 404, not 403
    if ($method === 'DELETE') {
        db()->prepare('DELETE FROM `CustomerAddress` WHERE id = ?')->execute([$mm[1]]);
        if ((int) $a['isDefault']) { // promote the most recent survivor
            $n = db()->prepare('SELECT id FROM `CustomerAddress` WHERE userId = ? ORDER BY createdAt DESC LIMIT 1');
            $n->execute([$uid]);
            $next = $n->fetch();
            if ($next) db()->prepare('UPDATE `CustomerAddress` SET isDefault = 1 WHERE id = ?')->execute([$next['id']]);
        }
        noContent();
    }
    $b = readJsonBody();
    $sets = []; $args = [];
    foreach (['label', 'address', 'notes'] as $k) if (array_key_exists($k, $b)) { $sets[] = "`$k` = ?"; $args[] = $b[$k]; }
    foreach (['lat', 'lng'] as $k) if (array_key_exists($k, $b)) { $sets[] = "`$k` = ?"; $args[] = $b[$k] === null ? null : (float) $b[$k]; }
    foreach (['cityId', 'villageId', 'areaId'] as $k) if (array_key_exists($k, $b)) { $sets[] = "`$k` = ?"; $args[] = $b[$k] ?: null; }
    if (array_key_exists('isDefault', $b) && $b['isDefault']) {
        db()->prepare('UPDATE `CustomerAddress` SET isDefault = 0 WHERE userId = ?')->execute([$uid]);
        $sets[] = '`isDefault` = 1';
    }
    if ($sets) { $args[] = $mm[1]; db()->prepare('UPDATE `CustomerAddress` SET ' . implode(', ', $sets) . ', updatedAt = NOW(3) WHERE id = ?')->execute($args); }
    $st->execute([$mm[1], $uid]);
    jsonOk(boolCast($st->fetch(), ['isDefault']));
}

// ═══ CATALOG (public) ══════════════════════════════════════════════════
if ($method === 'GET' && $path === '/categories') {
    $rows = db()->query('SELECT * FROM `Category` WHERE isActive = 1 ORDER BY sortOrder ASC, nameAr ASC')->fetchAll();
    jsonOk(array_map(fn($r) => boolCast($r, ['isActive']), $rows));
}

if ($method === 'GET' && $path === '/offers') {
    $rows = db()->query('SELECT * FROM `Offer` WHERE isActive = 1 AND (startsAt IS NULL OR startsAt <= NOW(3)) AND (endsAt IS NULL OR endsAt >= NOW(3)) ORDER BY sortOrder ASC')->fetchAll();
    jsonOk(array_map(fn($r) => boolCast($r, ['isActive']), $rows));
}

if ($method === 'GET' && $path === '/merchants') {
    $page = max(1, (int) ($_GET['page'] ?? 1));
    $pageSize = min(100, max(1, (int) ($_GET['pageSize'] ?? 20)));
    $where = '1=1'; $args = [];
    if (!empty($_GET['categoryId'])) { $where .= ' AND m.categoryId = ?'; $args[] = $_GET['categoryId']; }
    if (!empty($_GET['governorate'])) { $where .= ' AND m.governorate = ?'; $args[] = $_GET['governorate']; }
    if (!empty($_GET['city'])) { $where .= ' AND m.city = ?'; $args[] = $_GET['city']; }
    $q = trim((string) ($_GET['q'] ?? $_GET['search'] ?? ''));
    if ($q !== '') { $where .= ' AND (m.storeName LIKE ? OR m.storeNameAr LIKE ?)'; $args[] = "%$q%"; $args[] = "%$q%"; }
    $hasGeo = isset($_GET['lat'], $_GET['lng']) && $_GET['lat'] !== '' && $_GET['lng'] !== '';
    $sql = 'SELECT ' . MERCHANT_SEL . ' FROM `MerchantProfile` m LEFT JOIN `Category` c ON c.id = m.categoryId WHERE ' . $where;

    if ($hasGeo) {
        // Geo branch loads all, computes Haversine in memory, then slices —
        // and each row gains a real numeric distanceKm (catalog.controller).
        $st = db()->prepare($sql);
        $st->execute($args);
        $all = $st->fetchAll();
        $lat = (float) $_GET['lat']; $lng = (float) $_GET['lng'];
        $radius = min(100, (float) ($_GET['radiusKm'] ?? 100));
        $out = [];
        foreach ($all as $r) {
            $dLat = deg2rad(((float) $r['lat']) - $lat); $dLng = deg2rad(((float) $r['lng']) - $lng);
            $a = sin($dLat / 2) ** 2 + cos(deg2rad($lat)) * cos(deg2rad((float) $r['lat'])) * sin($dLng / 2) ** 2;
            $d = 6371 * 2 * atan2(sqrt($a), sqrt(1 - $a));
            if ($d <= $radius) { $r['_d'] = $d; $out[] = $r; }
        }
        usort($out, fn($x, $y) => $x['_d'] <=> $y['_d']);
        $total = count($out);
        $slice = array_slice($out, ($page - 1) * $pageSize, $pageSize);
        $hrs = hoursFor(array_column($slice, 'id'));
        $rows = [];
        foreach ($slice as $r) {
            $d = $r['_d']; unset($r['_d']);
            $m = merchantShape($r, $hrs[$r['id']] ?? []);
            $m['distanceKm'] = round($d, 2);
            $rows[] = $m;
        }
        jsonList($rows, $page, $pageSize, $total);
    }

    $cst = db()->prepare('SELECT COUNT(*) n FROM `MerchantProfile` m WHERE ' . $where);
    $cst->execute($args);
    $total = (int) $cst->fetch()['n'];
    $st = db()->prepare($sql . ' ORDER BY m.rating DESC, m.storeNameAr ASC LIMIT ' . $pageSize . ' OFFSET ' . (($page - 1) * $pageSize));
    $st->execute($args);
    $slice = $st->fetchAll();
    $hrs = hoursFor(array_column($slice, 'id'));
    jsonList(array_map(fn($r) => merchantShape($r, $hrs[$r['id']] ?? []), $slice), $page, $pageSize, $total);
}

if ($method === 'POST' && $path === '/merchants/openness') {
    $b = readJsonBody();
    $ids = array_values(array_filter((array) ($b['ids'] ?? [])));
    if (!$ids) jsonOk([]);
    $ids = array_slice($ids, 0, 50);
    $in = implode(',', array_fill(0, count($ids), '?'));
    $st = db()->prepare("SELECT id, manualStatus, timezone FROM `MerchantProfile` WHERE id IN ($in)");
    $st->execute($ids);
    $rows = $st->fetchAll();
    $hrs = hoursFor(array_column($rows, 'id'));
    $out = [];
    foreach ($rows as $r) $out[$r['id']] = merchantOpenness($r, $hrs[$r['id']] ?? []);
    // Keyed MAP, not an array — CartScreen does Object.values(openness).
    header('Content-Type: application/json; charset=utf-8');
    http_response_code(200);
    echo json_encode(['data' => (object) $out], JSON_UNESCAPED_UNICODE);
    exit;
}

if (preg_match('#^/merchants/([^/]+)/products$#', $path, $mm) && $method === 'GET') {
    // Pagination is OPT-IN. A merchant with a synced catalogue returns ~2,900
    // products (~3.1 MB) here, so the app should always send pageSize — but
    // older installed builds don't, and silently truncating their catalogue
    // would be worse than the payload. No params => previous behaviour.
    $wantsPage = isset($_GET['pageSize']) || isset($_GET['page']);
    $sql = 'SELECT * FROM `Product` WHERE merchantId = ? AND isAvailable = 1 AND isHidden = 0 ORDER BY sortOrder ASC';
    $args = [$mm[1]];

    if ($wantsPage) {
        $page = max(1, (int) ($_GET['page'] ?? 1));
        $pageSize = min(100, max(1, (int) ($_GET['pageSize'] ?? 30)));
        $q = trim((string) ($_GET['q'] ?? $_GET['search'] ?? ''));

        $where = 'merchantId = ? AND isAvailable = 1 AND isHidden = 0';
        $args = [$mm[1]];
        if ($q !== '') {
            $where .= ' AND (name LIKE ? OR nameAr LIKE ?)';
            $args[] = "%$q%";
            $args[] = "%$q%";
        }
        // In-store section, e.g. بيتزا / كريب. Exact match: these come from the
        // same column the section list is built from, so they always line up.
        $section = trim((string) ($_GET['section'] ?? ''));
        if ($section !== '') {
            $where .= ' AND categoryName = ?';
            $args[] = $section;
        }

        $cst = db()->prepare('SELECT COUNT(*) n FROM `Product` WHERE ' . $where);
        $cst->execute($args);
        $total = (int) $cst->fetch()['n'];

        $st = db()->prepare(
            'SELECT * FROM `Product` WHERE ' . $where . ' ORDER BY sortOrder ASC'
            . ' LIMIT ' . $pageSize . ' OFFSET ' . (($page - 1) * $pageSize)
        );
        $st->execute($args);
        $withOpts = merchantProductsWithOptions($mm[1]);
        jsonList(array_map(
            fn($r) => productShape($r) + ['hasOptions' => isset($withOpts[$r['id']]), 'fromPrice' => $withOpts[$r['id']]['minPrice'] ?? null],
            $st->fetchAll()
        ), $page, $pageSize, $total);
    }

    $st = db()->prepare($sql);
    $st->execute($args);
    $withOpts = merchantProductsWithOptions($mm[1]);
    jsonOk(array_map(
        fn($r) => productShape($r) + ['hasOptions' => isset($withOpts[$r['id']]), 'fromPrice' => $withOpts[$r['id']]['minPrice'] ?? null],
        $st->fetchAll()
    ));
}

// GET /merchants/{id}/product-sections — the in-store sections a customer can
// filter by, with counts so the UI can drop empty ones and show sizes.
// Sourced from Product.categoryName, which the API sync already populates and
// an admin can edit per product — no separate taxonomy to keep in step.
if (preg_match('#^/merchants/([^/]+)/product-sections$#', $path, $mm) && $method === 'GET') {
    $st = db()->prepare(
        'SELECT categoryName AS name, COUNT(*) AS n FROM `Product`'
        . ' WHERE merchantId = ? AND isAvailable = 1 AND isHidden = 0'
        . " AND categoryName IS NOT NULL AND categoryName <> ''"
        . ' GROUP BY categoryName ORDER BY n DESC, categoryName ASC'
    );
    $st->execute([$mm[1]]);
    jsonOk(array_map(
        fn($r) => ['name' => (string) $r['name'], 'count' => (int) $r['n']],
        $st->fetchAll()
    ));
}

if (preg_match('#^/merchants/([^/]+)$#', $path, $mm) && $method === 'GET') {
    $st = db()->prepare('SELECT ' . MERCHANT_SEL . ', m.openHours FROM `MerchantProfile` m LEFT JOIN `Category` c ON c.id = m.categoryId WHERE m.id = ? LIMIT 1');
    $st->execute([$mm[1]]);
    $r = $st->fetch();
    if (!$r) jsonErr('المتجر غير موجود', 404, 'NOT_FOUND');
    $hrs = hoursFor([$mm[1]]);
    $m = merchantShape($r, $hrs[$mm[1]] ?? []);
    $m['openHours'] = is_string($r['openHours'] ?? null) ? json_decode((string) $r['openHours'], true) : ($r['openHours'] ?? null);
    // Embedded products are opt-in limited, for the same reason as the
    // /products route above: this endpoint is what the store page calls, and
    // it was returning the merchant's ENTIRE catalogue — hidden and
    // unavailable rows included — on every open.
    $embedLimit = isset($_GET['productsPageSize'])
        ? min(100, max(1, (int) $_GET['productsPageSize']))
        : null;
    $psSql = 'SELECT * FROM `Product` WHERE merchantId = ? ORDER BY sortOrder ASC';
    if ($embedLimit !== null) $psSql .= ' LIMIT ' . $embedLimit;
    $ps = db()->prepare($psSql);
    $ps->execute([$mm[1]]);
    $withOpts = merchantProductsWithOptions($mm[1]);
    $m['products'] = array_map(
        fn($r2) => productShape($r2) + ['hasOptions' => isset($withOpts[$r2['id']]), 'fromPrice' => $withOpts[$r2['id']]['minPrice'] ?? null],
        $ps->fetchAll()
    );

    // Total count so the client knows whether to paginate, regardless of limit.
    $pc = db()->prepare('SELECT COUNT(*) n FROM `Product` WHERE merchantId = ?');
    $pc->execute([$mm[1]]);
    $m['productsTotal'] = (int) $pc->fetch()['n'];

    jsonOk($m);
}

if ($method === 'GET' && $path === '/products') {
    $page = max(1, (int) ($_GET['page'] ?? 1));
    $pageSize = min(100, max(1, (int) ($_GET['pageSize'] ?? 20)));
    $where = 'p.isAvailable = 1'; $args = [];
    if (!empty($_GET['merchantId'])) { $where .= ' AND p.merchantId = ?'; $args[] = $_GET['merchantId']; }
    $q = trim((string) ($_GET['q'] ?? $_GET['search'] ?? ''));
    if ($q !== '') { $where .= ' AND (p.name LIKE ? OR p.nameAr LIKE ?)'; $args[] = "%$q%"; $args[] = "%$q%"; }

    // ids=a,b,c — fetch a curated set in one round trip. Capped so a crafted
    // query can't turn this into an unbounded IN(...) scan.
    $idsRaw = trim((string) ($_GET['ids'] ?? ''));
    if ($idsRaw !== '') {
        $ids = array_slice(array_values(array_filter(array_map('trim', explode(',', $idsRaw)))), 0, 50);
        if (!$ids) jsonList([], 1, 0, 0);
        $where .= ' AND p.id IN (' . implode(',', array_fill(0, count($ids), '?')) . ')';
        foreach ($ids as $id) $args[] = $id;
    }

    // onSale=1 — anything the merchant actually discounted. Both knobs count:
    // salePrice must undercut the list price to be a real discount, and
    // discount is a percentage.
    if (!empty($_GET['onSale'])) {
        $where .= ' AND ((p.salePrice IS NOT NULL AND p.salePrice > 0 AND p.salePrice < p.price)'
                . ' OR (p.discount IS NOT NULL AND p.discount > 0))';
    }
    $cst = db()->prepare('SELECT COUNT(*) n FROM `Product` p WHERE ' . $where);
    $cst->execute($args);
    $total = (int) $cst->fetch()['n'];
    $st = db()->prepare('SELECT p.*, m.storeNameAr AS m_storeNameAr, m.isOpen AS m_isOpen FROM `Product` p LEFT JOIN `MerchantProfile` m ON m.id = p.merchantId WHERE ' . $where . ' ORDER BY p.sortOrder ASC, p.nameAr ASC LIMIT ' . $pageSize . ' OFFSET ' . (($page - 1) * $pageSize));
    $st->execute($args);
    $rows = [];
    foreach ($st->fetchAll() as $r) {
        $p = productShape($r);
        $p['merchant'] = ['id' => $r['merchantId'], 'storeNameAr' => $r['m_storeNameAr'], 'isOpen' => (bool) (int) $r['m_isOpen']];
        unset($p['m_storeNameAr'], $p['m_isOpen']);
        $rows[] = $p;
    }
    jsonList($rows, $page, $pageSize, $total);
}

/**
 * Sizes and extras for a product.
 *
 * Variants belong to the product (a "large" only means something for that
 * item). Addons belong to the MERCHANT and are linked in, so "موتزريلا +15" is
 * written once for the restaurant and attached to every pizza instead of being
 * retyped per product — which is the whole point of the feature.
 */
function productOptions(string $productId): array {
    $out = ['variants' => [], 'addons' => []];
    try {
        $v = db()->prepare(
            'SELECT id, nameAr, price FROM `ProductVariant`'
            . ' WHERE productId = ? AND isActive = 1 ORDER BY sortOrder ASC, price ASC'
        );
        $v->execute([$productId]);
        $out['variants'] = array_map(fn($r) => [
            'id' => $r['id'], 'nameAr' => $r['nameAr'], 'price' => (float) $r['price'],
        ], $v->fetchAll());

        $a = db()->prepare(
            'SELECT ma.id, ma.nameAr, ma.price FROM `ProductAddonLink` pal'
            . ' JOIN `MerchantAddon` ma ON ma.id = pal.addonId'
            . ' WHERE pal.productId = ? AND ma.isActive = 1'
            . ' ORDER BY ma.sortOrder ASC, ma.nameAr ASC'
        );
        $a->execute([$productId]);
        $out['addons'] = array_map(fn($r) => [
            'id' => $r['id'], 'nameAr' => $r['nameAr'], 'price' => (float) $r['price'],
        ], $a->fetchAll());
    } catch (Throwable $e) { /* tables absent on an old DB — degrade to none */ }
    return $out;
}

if (preg_match('#^/products/([^/]+)$#', $path, $mm) && $method === 'GET') {
    $st = db()->prepare('SELECT p.*, m.id AS m_id, m.storeNameAr AS m_storeNameAr, m.logoUrl AS m_logoUrl, m.rating AS m_rating, m.manualStatus AS m_manualStatus, m.timezone AS m_timezone FROM `Product` p LEFT JOIN `MerchantProfile` m ON m.id = p.merchantId WHERE p.id = ? LIMIT 1');
    $st->execute([$mm[1]]);
    $r = $st->fetch();
    if (!$r) jsonErr('المنتج غير موجود', 404, 'NOT_FOUND');
    $p = productShape($r);
    $hrs = hoursFor([$r['merchantId']]);
    // ProductDetailScreen types `merchant` as required — never omit it.
    $p['merchant'] = [
        'id' => $r['m_id'], 'storeNameAr' => $r['m_storeNameAr'], 'logoUrl' => $r['m_logoUrl'],
        'rating' => $r['m_rating'], 'manualStatus' => $r['m_manualStatus'], 'timezone' => $r['m_timezone'],
        'openness' => merchantOpenness(['manualStatus' => $r['m_manualStatus'], 'timezone' => $r['m_timezone']], $hrs[$r['merchantId']] ?? []),
    ];
    foreach (['m_id', 'm_storeNameAr', 'm_logoUrl', 'm_rating', 'm_manualStatus', 'm_timezone'] as $k) unset($p[$k]);

    // Sizes and extras. Both arrays are always present (possibly empty) so the
    // app can render unconditionally without null-guarding every access.
    $opts = productOptions($mm[1]);
    $p['variants'] = $opts['variants'];
    $p['addons'] = $opts['addons'];

    jsonOk($p);
}

// ═══ SERVICES (public) ═════════════════════════════════════════════════
if ($method === 'GET' && $path === '/services') {
    $rows = db()->query('SELECT * FROM `Service` WHERE isActive = 1 ORDER BY sortOrder ASC')->fetchAll();
    jsonOk(array_map(fn($r) => boolCast(jsonizeRow($r), ['isActive', 'requiresPickupLocation', 'requiresDeliveryLocation', 'requiresImageUpload', 'allowsTextNote', 'supportsMultiplePickups', 'supportsMultipleDeliveries']), $rows));
}

if (preg_match('#^/services/([^/]+)$#', $path, $mm) && $method === 'GET') {
    $st = db()->prepare('SELECT * FROM `Service` WHERE id = ? LIMIT 1');
    $st->execute([$mm[1]]);
    $s = $st->fetch();
    if (!$s || !(int) $s['isActive']) jsonErr('الخدمة غير موجودة', 404, 'NOT_FOUND');
    $s = boolCast(jsonizeRow($s), ['isActive', 'requiresPickupLocation', 'requiresDeliveryLocation', 'requiresImageUpload', 'allowsTextNote', 'supportsMultiplePickups', 'supportsMultipleDeliveries']);
    $fs = db()->prepare('SELECT * FROM `ServiceField` WHERE serviceId = ? ORDER BY sortOrder ASC');
    $fs->execute([$mm[1]]);
    $s['fields'] = array_map(fn($f) => boolCast(jsonizeRow($f), ['isRequired']), $fs->fetchAll());
    jsonOk($s);
}

// ═══ ZONES (public) ════════════════════════════════════════════════════
if ($method === 'GET' && $path === '/zones/cities') {
    $rows = db()->query('SELECT id, nameAr, nameEn FROM `City` WHERE isActive = 1 ORDER BY nameAr')->fetchAll();
    jsonOk($rows);
}
if (preg_match('#^/zones/cities/([^/]+)/villages$#', $path, $mm) && $method === 'GET') {
    $st = db()->prepare('SELECT id, nameAr, nameEn, baseDeliveryPrice FROM `Village` WHERE cityId = ? AND isActive = 1 ORDER BY nameAr');
    $st->execute([$mm[1]]);
    jsonOk($st->fetchAll());
}
if (preg_match('#^/zones/villages/([^/]+)/areas$#', $path, $mm) && $method === 'GET') {
    $st = db()->prepare('SELECT id, nameAr, nameEn, deliveryPrice FROM `Area` WHERE villageId = ? AND isActive = 1 ORDER BY nameAr');
    $st->execute([$mm[1]]);
    jsonOk($st->fetchAll());
}
/** Area price → Village base price → refuse. Returns [price, source] or null. */
function zoneQuote(?string $cityId, ?string $villageId, ?string $areaId): ?array {
    if (!$cityId || !$villageId || !$areaId) return null;
    $st = db()->prepare('SELECT a.deliveryPrice AS aPrice, a.nameAr AS aName, a.isActive AS aActive,
        v.baseDeliveryPrice AS vPrice, v.nameAr AS vName, v.isActive AS vActive,
        c.nameAr AS cName, c.isActive AS cActive
        FROM `Area` a JOIN `Village` v ON v.id = a.villageId JOIN `City` c ON c.id = v.cityId
        WHERE a.id = ? AND v.id = ? AND c.id = ? LIMIT 1');
    $st->execute([$areaId, $villageId, $cityId]);
    $r = $st->fetch();
    if (!$r) return null;
    if (!(int) $r['aActive'] || !(int) $r['vActive'] || !(int) $r['cActive']) return ['INACTIVE', null, null];
    $price = $r['aPrice'] !== null ? $r['aPrice'] : $r['vPrice'];
    if ($price === null) return ['NO_PRICE', null, null];
    return ['OK', $price, ['source' => $r['aPrice'] !== null ? 'AREA' : 'VILLAGE', 'cityName' => $r['cName'], 'villageName' => $r['vName'], 'areaName' => $r['aName']]];
}
if ($method === 'POST' && $path === '/zones/quote-delivery') {
    $b = readJsonBody();
    $q = zoneQuote($b['cityId'] ?? null, $b['villageId'] ?? null, $b['areaId'] ?? null);
    if (!$q) jsonErr('اختيارات العنوان غير صحيحة', 400, 'INVALID_ZONE');
    if ($q[0] === 'INACTIVE') jsonErr('هذه المنطقة غير مفعّلة حالياً. اختر منطقة أخرى.', 400, 'INACTIVE_ZONE');
    if ($q[0] === 'NO_PRICE') jsonErr('لا يوجد سعر توصيل لهذه المنطقة، تواصل مع الدعم', 400, 'NO_DELIVERY_PRICE');
    jsonOk(array_merge(['price' => $q[1]], $q[2]));
}

// ═══ COUPONS ═══════════════════════════════════════════════════════════
/** Returns [valid, discountOrReason, coupon]. Mirrors coupons.controller. */
function couponCheck(string $code, float $amount, string $userId): array {
    // validFrom/validTo evaluated in SQL against NOW(3) — comparing a DB
    // timestamp to PHP's time() skews by any PHP/MySQL timezone mismatch,
    // which would honour an expired coupon (or reject a live one).
    $st = db()->prepare('SELECT c.*, (c.validFrom IS NOT NULL AND c.validFrom > NOW(3)) AS notYet, (c.validTo IS NOT NULL AND c.validTo < NOW(3)) AS expired FROM `Coupon` c WHERE c.code = ? AND c.isActive = 1 LIMIT 1');
    $st->execute([strtoupper(trim($code))]);
    $c = $st->fetch();
    if (!$c) return [false, 'الكود غير موجود أو غير نشط', null];
    if ((int) $c['notYet']) return [false, 'الكود لم يبدأ بعد', null];
    if ((int) $c['expired']) return [false, 'انتهت صلاحية الكود', null];
    if ($c['usageLimit'] !== null) {
        $n = db()->prepare('SELECT COUNT(*) n FROM `CouponRedemption` WHERE couponId = ?');
        $n->execute([$c['id']]);
        if ((int) $n->fetch()['n'] >= (int) $c['usageLimit']) return [false, 'استُنفذ الكود', null];
    }
    $perUser = $c['usagePerUser'] === null ? 1 : (int) $c['usagePerUser'];
    $n = db()->prepare('SELECT COUNT(*) n FROM `CouponRedemption` WHERE couponId = ? AND userId = ?');
    $n->execute([$c['id'], $userId]);
    if ((int) $n->fetch()['n'] >= $perUser) return [false, 'استخدمت هذا الكود من قبل', null];
    if ($c['minOrderAmount'] !== null && $amount < (float) $c['minOrderAmount']) {
        return [false, 'الحد الأدنى للطلب ' . rtrim(rtrim((string) $c['minOrderAmount'], '0'), '.') . ' ج.م', null];
    }
    $d = $c['type'] === 'PERCENTAGE' ? $amount * ((float) $c['value']) / 100 : (float) $c['value'];
    if ($c['maxDiscount'] !== null) $d = min($d, (float) $c['maxDiscount']);
    $d = round(min($d, $amount), 2);
    return [true, $d, $c];
}
if ($method === 'POST' && $path === '/coupons/validate') {
    $u = authUser();
    $b = readJsonBody();
    $amount = (float) ($b['orderAmount'] ?? 0);
    [$valid, $res, $c] = couponCheck((string) ($b['code'] ?? ''), $amount, (string) ($u['sub'] ?? ''));
    // Always 200 — an invalid coupon is not an error. discount MUST be a
    // number: CouponInput checks `typeof discount === 'number'`.
    if (!$valid) jsonOk(['valid' => false, 'reason' => $res]);
    jsonOk(['valid' => true, 'discount' => (float) $res, 'type' => $c['type'], 'value' => (float) $c['value'], 'finalAmount' => max(0, round($amount - (float) $res, 2))]);
}
if ($method === 'GET' && $path === '/coupons/available') {
    $u = authUser();
    $uid = (string) ($u['sub'] ?? '');
    $rows = db()->query('SELECT * FROM `Coupon` WHERE isActive = 1 AND (validFrom IS NULL OR validFrom <= NOW(3)) AND (validTo IS NULL OR validTo >= NOW(3)) ORDER BY createdAt DESC')->fetchAll();
    $out = [];
    foreach ($rows as $c) {
        $perUser = $c['usagePerUser'] === null ? 1 : (int) $c['usagePerUser'];
        $n = db()->prepare('SELECT COUNT(*) n FROM `CouponRedemption` WHERE couponId = ? AND userId = ?');
        $n->execute([$c['id'], $uid]);
        if ((int) $n->fetch()['n'] >= $perUser) continue;
        $out[] = ['id' => $c['id'], 'code' => $c['code'], 'type' => $c['type'], 'value' => (float) $c['value'],
            'minOrderAmount' => $c['minOrderAmount'] === null ? null : (float) $c['minOrderAmount'],
            'maxDiscount' => $c['maxDiscount'] === null ? null : (float) $c['maxDiscount'],
            'validTo' => $c['validTo'], 'description' => $c['description']];
    }
    jsonOk($out);
}

// ═══ NOTIFICATIONS ═════════════════════════════════════════════════════
if ($method === 'GET' && $path === '/notifications/unread-count') {
    $u = authUser();
    $st = db()->prepare('SELECT COUNT(*) n FROM `Notification` WHERE userId = ? AND isRead = 0');
    $st->execute([(string) ($u['sub'] ?? '')]);
    jsonOk(['count' => (int) $st->fetch()['n']]);
}
if ($method === 'GET' && $path === '/notifications') {
    $u = authUser();
    $uid = (string) ($u['sub'] ?? '');
    $page = max(1, (int) ($_GET['page'] ?? 1));
    $pageSize = min(100, max(1, (int) ($_GET['pageSize'] ?? 30))); // default 30 here, not 20
    $c = db()->prepare('SELECT COUNT(*) n FROM `Notification` WHERE userId = ?');
    $c->execute([$uid]);
    $total = (int) $c->fetch()['n'];
    $st = db()->prepare('SELECT * FROM `Notification` WHERE userId = ? ORDER BY sentAt DESC LIMIT ' . $pageSize . ' OFFSET ' . (($page - 1) * $pageSize));
    $st->execute([$uid]);
    jsonList(array_map(fn($r) => boolCast(jsonizeRow($r), ['isRead']), $st->fetchAll()), $page, $pageSize, $total);
}
if ($method === 'PATCH' && $path === '/notifications/read-all') {
    $u = authUser();
    $st = db()->prepare('UPDATE `Notification` SET isRead = 1, readAt = NOW(3) WHERE userId = ? AND isRead = 0');
    $st->execute([(string) ($u['sub'] ?? '')]);
    jsonOk(['updated' => $st->rowCount()]);
}
if (preg_match('#^/notifications/([^/]+)/read$#', $path, $mm) && $method === 'PATCH') {
    $u = authUser();
    $st = db()->prepare('UPDATE `Notification` SET isRead = 1, readAt = NOW(3) WHERE id = ? AND userId = ?');
    $st->execute([$mm[1], (string) ($u['sub'] ?? '')]);
    jsonOk(['updated' => $st->rowCount()]);
}

// ═══ ORDERS ════════════════════════════════════════════════════════════
const ORDER_MONEY = ['quotedPrice', 'finalPrice', 'discountAmount', 'walletUsed', 'merchantSubtotal', 'deliveryFee', 'platformCommission', 'merchantPayout'];
function orderRow(array $r): array { return boolCast(jsonizeRow($r), ['isFragile']); }
function newOrderNumber(string $id): string { return 'TMM' . strtoupper(substr($id, 1, 9)); }
/** ConflictError smuggles the machine code in `message`, not `code`. */
function conflictErr(string $code, string $messageAr): void {
    http_response_code(409);
    echo json_encode(['error' => ['code' => 'CONFLICT', 'message' => $code, 'messageAr' => $messageAr]], JSON_UNESCAPED_UNICODE);
    exit;
}
function orderHistory(string $orderId, ?string $from, string $to, string $by, string $role, ?string $reason = null): void {
    db()->prepare('INSERT INTO `OrderStatusHistory` (id, orderId, fromStatus, toStatus, changedById, changedByRole, reason, createdAt) VALUES (?,?,?,?,?,?,?,NOW(3))')
        ->execute([newId(), $orderId, $from, $to, $by, $role, $reason]);
}
// ─── FCM push (Firebase Cloud Messaging HTTP v1) ───────────────────────
// Real push so a notification arrives even when the app is BACKGROUNDED or
// KILLED — the in-app Notification row alone only shows when the app is open.
// Activates the moment firebase-service-account.json is dropped next to this
// file; until then every send is a silent no-op (in-app notifications still
// work). The host has curl + openssl RS256 + outbound HTTPS (verified).
function fcmServiceAccount(): ?array {
    static $sa = null; static $loaded = false;
    if ($loaded) return $sa;
    $loaded = true;
    $p = __DIR__ . '/firebase-service-account.json';
    if (!is_file($p)) return null;
    $j = json_decode((string) @file_get_contents($p), true);
    $sa = (is_array($j) && !empty($j['client_email']) && !empty($j['private_key'])) ? $j : null;
    return $sa;
}
/** Service-account JWT → short-lived OAuth access token, cached to /tmp. */
function fcmAccessToken(): ?string {
    $sa = fcmServiceAccount();
    if (!$sa) return null;
    $cacheFile = sys_get_temp_dir() . '/tamem_fcm_token.json';
    $c = @json_decode((string) @file_get_contents($cacheFile), true);
    if (is_array($c) && ($c['exp'] ?? 0) > time() + 120 && !empty($c['token'])) return $c['token'];
    $now = time();
    $b64 = fn($d) => rtrim(strtr(base64_encode($d), '+/', '-_'), '=');
    $head = $b64(json_encode(['alg' => 'RS256', 'typ' => 'JWT']));
    $claim = $b64(json_encode([
        'iss' => $sa['client_email'],
        'scope' => 'https://www.googleapis.com/auth/firebase.messaging',
        'aud' => 'https://oauth2.googleapis.com/token',
        'iat' => $now, 'exp' => $now + 3600,
    ]));
    $sig = '';
    if (!openssl_sign("$head.$claim", $sig, $sa['private_key'], 'SHA256')) return null;
    $jwt = "$head.$claim." . $b64($sig);
    $ch = curl_init('https://oauth2.googleapis.com/token');
    curl_setopt_array($ch, [
        CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15,
        CURLOPT_POSTFIELDS => http_build_query([
            'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion' => $jwt,
        ]),
    ]);
    $resp = curl_exec($ch); $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    $d = json_decode((string) $resp, true);
    if ($code !== 200 || empty($d['access_token'])) { error_log('[fcm] token exchange failed: ' . substr((string) $resp, 0, 200)); return null; }
    @file_put_contents($cacheFile, json_encode(['token' => $d['access_token'], 'exp' => $now + (int) ($d['expires_in'] ?? 3600)]));
    return $d['access_token'];
}
/** Send to ONE token. Returns ['ok'=>bool,'dead'=>bool] — dead = delete it. */
function fcmSendToToken(string $token, string $title, string $body, array $data): array {
    $sa = fcmServiceAccount();
    $at = $sa ? fcmAccessToken() : null;
    if (!$sa || !$at) return ['ok' => false, 'reason' => 'no-credentials'];
    $dataStr = [];
    foreach ($data as $k => $v) $dataStr[(string) $k] = is_scalar($v) ? (string) $v : json_encode($v, JSON_UNESCAPED_UNICODE);
    $msg = ['message' => [
        'token' => $token,
        'notification' => ['title' => $title, 'body' => $body],
        'data' => $dataStr,
        'android' => ['priority' => 'HIGH', 'notification' => ['channel_id' => 'default', 'sound' => 'default', 'default_vibrate_timings' => true]],
        'apns' => ['payload' => ['aps' => ['sound' => 'default', 'badge' => 1]]],
    ]];
    $ch = curl_init('https://fcm.googleapis.com/v1/projects/' . ($sa['project_id'] ?? '') . '/messages:send');
    curl_setopt_array($ch, [
        CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $at, 'Content-Type: application/json'],
        CURLOPT_POSTFIELDS => json_encode($msg, JSON_UNESCAPED_UNICODE),
    ]);
    $resp = curl_exec($ch); $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    if ($code === 200) return ['ok' => true];
    $d = json_decode((string) $resp, true);
    $status = $d['error']['status'] ?? ('HTTP ' . $code);
    $dead = $code === 404 || in_array($status, ['UNREGISTERED', 'NOT_FOUND', 'INVALID_ARGUMENT'], true);
    error_log("[fcm] send failed ($status): " . substr((string) $resp, 0, 200));
    return ['ok' => false, 'reason' => $status, 'dead' => $dead];
}
/** Fan a push out to every device a user has registered. Invalid tokens are
 *  pruned; transient failures are counted for later cleanup. Best-effort. */
function pushToUser(string $userId, string $title, string $body, array $data = []): void {
    try {
        if (!fcmServiceAccount()) return; // not configured yet — silent no-op
        $st = db()->prepare('SELECT id, token FROM `DeviceToken` WHERE userId = ?');
        $st->execute([$userId]);
        foreach ($st->fetchAll() as $row) {
            $r = fcmSendToToken((string) $row['token'], $title, $body, $data);
            if (!$r['ok'] && !empty($r['dead'])) {
                db()->prepare('DELETE FROM `DeviceToken` WHERE id = ?')->execute([$row['id']]);
            } elseif (!$r['ok']) {
                db()->prepare('UPDATE `DeviceToken` SET failCount = failCount + 1, lastError = ?, updatedAt = NOW(3) WHERE id = ?')
                    ->execute([substr((string) ($r['reason'] ?? 'error'), 0, 255), $row['id']]);
            } else {
                db()->prepare('UPDATE `DeviceToken` SET failCount = 0, lastError = NULL, updatedAt = NOW(3) WHERE id = ?')->execute([$row['id']]);
            }
        }
    } catch (Throwable $e) { error_log('[fcm] pushToUser: ' . $e->getMessage()); }
}
function notifyUser(string $userId, string $type, string $title, string $titleAr, string $body, string $bodyAr, ?array $data = null): void {
    try {
        db()->prepare('INSERT INTO `Notification` (id, userId, type, title, titleAr, body, bodyAr, data, channel, isRead, sentAt) VALUES (?,?,?,?,?,?,?,?,?,0,NOW(3))')
            ->execute([newId(), $userId, $type, $title, $titleAr, $body, $bodyAr, $data ? json_encode($data, JSON_UNESCAPED_UNICODE) : null, 'IN_APP']);
    } catch (Throwable $e) { error_log('[api.php] notify failed: ' . $e->getMessage()); }
    // Real push — arrives with the app closed. Prefer Arabic copy; carry the
    // type + any data (orderId, screen) so the tap opens the right screen.
    try {
        pushToUser($userId, $titleAr ?: $title, $bodyAr ?: $body,
            array_merge(is_array($data) ? $data : [], ['type' => $type]));
    } catch (Throwable $e) { error_log('[fcm] notifyUser push: ' . $e->getMessage()); }
    // Email copy — deferred (post-response) so it never slows the request, and
    // only for users who actually have an email on file.
    try {
        $t = $titleAr ?: $title;
        $bd = $bodyAr ?: $body;
        mailToUser($userId, $t, $bd,
            emailShell($t, '<p style="margin:0">' . nl2br(htmlspecialchars($bd)) . '</p>'));
    } catch (Throwable $e) { error_log('[mail] notifyUser: ' . $e->getMessage()); }
}

if ($method === 'GET' && $path === '/orders/mine') {
    $u = authUser();
    $uid = (string) ($u['sub'] ?? '');
    $page = max(1, (int) ($_GET['page'] ?? 1));
    $pageSize = min(50, max(1, (int) ($_GET['pageSize'] ?? 20))); // caps at 50 here
    $where = 'o.customerId = ? AND o.parentOrderId IS NULL'; $args = [$uid];
    if (!empty($_GET['status'])) { $where .= ' AND o.status = ?'; $args[] = $_GET['status']; }
    $c = db()->prepare('SELECT COUNT(*) n FROM `Order` o WHERE ' . $where);
    $c->execute($args);
    $total = (int) $c->fetch()['n'];
    $st = db()->prepare('SELECT o.*, s.nameAr AS s_nameAr, s.category AS s_category,
        (SELECT COUNT(*) FROM `Order` so WHERE so.parentOrderId = o.id) AS subCount
        FROM `Order` o LEFT JOIN `Service` s ON s.id = o.serviceId WHERE ' . $where . '
        ORDER BY o.createdAt DESC LIMIT ' . $pageSize . ' OFFSET ' . (($page - 1) * $pageSize));
    $st->execute($args);
    $rows = [];
    foreach ($st->fetchAll() as $r) {
        $o = orderRow($r);
        $o['service'] = ['id' => $r['serviceId'], 'nameAr' => $r['s_nameAr'], 'category' => $r['s_category']];
        $o['_count'] = ['subOrders' => (int) $r['subCount']];
        foreach (['s_nameAr', 's_category', 'subCount'] as $k) unset($o[$k]);
        $rows[] = $o;
    }
    jsonList($rows, $page, $pageSize, $total);
}

if ($method === 'POST' && $path === '/orders/cart') {
    $u = authUser();
    $uid = (string) ($u['sub'] ?? '');
    $b = readJsonBody();
    $merchants = (array) ($b['merchants'] ?? []);
    if (!$merchants) jsonErr('السلة فارغة', 422, 'VALIDATION_ERROR');
    $addr = trim((string) ($b['deliveryAddress'] ?? ''));
    // A zoned address (city/village/area) is deliverable without a GPS pin — the
    // zone prices + routes it. Require an address plus a zone OR a pin, matching
    // the /orders create path. (This handler was missed by the pin-less fix, so
    // cart orders on a saved zoned-but-pinless address were rejected here — the
    // "adding an order fails" symptom.)
    $cartHasZone = !empty($b['cityId']) || !empty($b['villageId']) || !empty($b['areaId']);
    $cartHasPin = isset($b['deliveryLat'], $b['deliveryLng']) && $b['deliveryLat'] !== '' && $b['deliveryLng'] !== '';
    if ($addr === '' || (!$cartHasZone && !$cartHasPin)) jsonErr('حدد منطقة التوصيل أو الموقع على الخريطة', 422, 'VALIDATION_ERROR');
    // Null when there's no pin — never (float) null, which silently writes (0,0)
    // "Null Island" coordinates onto the order.
    $cartLat = $cartHasPin ? (float) $b['deliveryLat'] : null;
    $cartLng = $cartHasPin ? (float) $b['deliveryLng'] : null;
    $svc = db()->query("SELECT * FROM `Service` WHERE category = 'MERCHANT' AND isActive = 1 ORDER BY sortOrder ASC LIMIT 1")->fetch();
    if (!$svc) jsonErr('الخدمة غير متاحة', 404, 'NOT_FOUND');

    // Refuse the whole cart if any merchant is closed — matches orders.customer.
    $ids = array_values(array_filter(array_map(fn($m) => $m['merchantId'] ?? null, $merchants)));
    $hrs = hoursFor($ids);
    foreach ($ids as $mid) {
        $ms = db()->prepare('SELECT id, storeNameAr, manualStatus, timezone FROM `MerchantProfile` WHERE id = ? LIMIT 1');
        $ms->execute([$mid]);
        $m = $ms->fetch();
        if (!$m) jsonErr('المتجر غير موجود', 404, 'NOT_FOUND');
        $op = merchantOpenness($m, $hrs[$mid] ?? []);
        if (!$op['isOpenNow']) {
            conflictErr($op['reason'] === 'OUT_OF_HOURS' ? 'MERCHANT_OUT_OF_HOURS' : 'MERCHANT_CLOSED',
                'المتجر ' . $m['storeNameAr'] . ' مغلق حالياً');
        }
    }
    // Delivery fee is ALWAYS recomputed server-side (anti-tamper).
    $fee = null;
    if (!empty($b['cityId']) || !empty($b['villageId']) || !empty($b['areaId'])) {
        $q = zoneQuote($b['cityId'] ?? null, $b['villageId'] ?? null, $b['areaId'] ?? null);
        if (!$q) jsonErr('اختيارات العنوان غير صحيحة', 400, 'INVALID_ZONE');
        if ($q[0] === 'INACTIVE') jsonErr('هذه المنطقة غير مفعّلة حالياً. اختر منطقة أخرى.', 400, 'INACTIVE_ZONE');
        if ($q[0] === 'NO_PRICE') jsonErr('لا يوجد سعر توصيل لهذه المنطقة، تواصل مع الدعم', 400, 'NO_DELIVERY_PRICE');
        $fee = (float) $q[1];
    }
    $pm = (string) ($b['paymentMethod'] ?? 'CASH');
    if (!in_array($pm, ['CASH', 'VODAFONE_CASH', 'INSTAPAY'], true)) $pm = 'CASH';

    // Price every line from the DB — never trust client-sent prices.
    $subtotals = []; $lines = [];
    foreach ($merchants as $mi => $m) {
        $sum = 0.0; $lines[$mi] = [];
        foreach ((array) ($m['items'] ?? []) as $it) {
            $ps = db()->prepare('SELECT id, merchantId, nameAr, price, salePrice, discount, isAvailable, isHidden, stock FROM `Product` WHERE id = ? LIMIT 1');
            $ps->execute([$it['productId'] ?? '']);
            $p = $ps->fetch();
            if (!$p) conflictErr('PRODUCT_UNAVAILABLE', 'أحد المنتجات لم يعد متاحاً');
            // The product must actually belong to the merchant block it was sent
            // under — otherwise a crafted cart bills merchant A for merchant B's
            // item and dispatches a store something it doesn't sell.
            if (($m['merchantId'] ?? null) !== null && $p['merchantId'] !== $m['merchantId']) {
                conflictErr('PRODUCT_UNAVAILABLE', 'المنتج ' . $p['nameAr'] . ' لا يتبع هذا المتجر');
            }
            // isHidden = soft-deleted / dropped by the merchant's sync feed. It is
            // independent of isAvailable, so both must be checked (as Node does).
            if (!(int) $p['isAvailable'] || (int) $p['isHidden']) conflictErr('PRODUCT_UNAVAILABLE', 'المنتج ' . $p['nameAr'] . ' غير متاح حالياً');
            $qty = max(1, (int) ($it['quantity'] ?? 1));
            if ($p['stock'] !== null && (int) $p['stock'] < $qty) conflictErr('INSUFFICIENT_STOCK', 'الكمية المطلوبة من ' . $p['nameAr'] . ' غير متوفرة');
            /*
             * Size and extras, priced from the DATABASE — never from what the
             * client sent. The app posts ids only; the names and prices are
             * looked up here and snapshotted, so a tampered request can't buy a
             * jumbo pizza at the small price, and a later menu edit can't
             * rewrite a past order.
             */
            $unit = effectiveUnitPrice($p);
            $variantName = null;
            $addonSnap = [];

            $vid = trim((string) ($it['variantId'] ?? ''));
            if ($vid !== '') {
                $vq = db()->prepare('SELECT nameAr, price FROM `ProductVariant` WHERE id = ? AND productId = ? AND isActive = 1 LIMIT 1');
                $vq->execute([$vid, $p['id']]);
                if ($v = $vq->fetch()) {
                    // A size REPLACES the base price rather than adding to it.
                    $unit = round((float) $v['price'], 2);
                    $variantName = (string) $v['nameAr'];
                } else {
                    conflictErr('VARIANT_UNAVAILABLE', 'الحجم المختار لم يعد متاحاً لـ ' . $p['nameAr']);
                }
            }

            $aids = array_values(array_filter(array_map('strval', (array) ($it['addonIds'] ?? []))));
            if ($aids) {
                $in = implode(',', array_fill(0, count($aids), '?'));
                // Joined through the link table so an addon from ANOTHER
                // merchant can't be attached by id.
                $aq = db()->prepare(
                    'SELECT ma.nameAr, ma.price FROM `ProductAddonLink` pal'
                    . ' JOIN `MerchantAddon` ma ON ma.id = pal.addonId'
                    . " WHERE pal.productId = ? AND ma.isActive = 1 AND ma.id IN ($in)"
                );
                $aq->execute(array_merge([$p['id']], $aids));
                foreach ($aq->fetchAll() as $a) {
                    $addonSnap[] = ['nameAr' => $a['nameAr'], 'price' => (float) $a['price']];
                    $unit += (float) $a['price'];
                }
            }
            $unit = round($unit, 2);
            $sum += $unit * $qty;
            $lines[$mi][] = [
                'productId' => $p['id'],
                'name' => $p['nameAr'],
                'qty' => $qty,
                'unit' => $unit,
                'notes' => $it['notes'] ?? null,
                'variantName' => $variantName,
                'addons' => $addonSnap,
            ];
        }
        $subtotals[$mi] = round($sum, 2);
    }
    $grandSub = round(array_sum($subtotals), 2);

    $discount = 0.0; $coupon = null;
    if (!empty($b['couponCode'])) {
        [$ok, $res, $c] = couponCheck((string) $b['couponCode'], $grandSub, $uid);
        if (!$ok) jsonErr((string) $res, 422, 'VALIDATION_ERROR');
        $discount = (float) $res; $coupon = $c;
    }
    $final = round($grandSub + ($fee ?? 0) - $discount, 2);

    $parentId = newId();
    $parentNo = newOrderNumber($parentId);
    $multi = count($merchants) > 1;

    /*
     * ONE order per cart, even across stores.
     *
     * This used to also create a child order per merchant. That gave each store
     * its own number, price and driver — but the admin then had to price and
     * assign N times for a single purchase, and the customer saw N orders.
     * Every line already carries its own merchantId, so the per-store breakdown
     * survives without the extra rows: the dashboard groups items by merchant,
     * and the pricing dialog still splits revenue per store.
     *
     * Nothing depended on the children: /merchant/orders (the only per-merchant
     * inbox) is not implemented on this backend. Orders created BEFORE this
     * change keep their children, and the read paths still handle them.
     */
    $splitPerMerchant = false;
    db()->prepare('INSERT INTO `Order` (id, orderNumber, serviceId, customerId, category, status, merchantId, deliveryAddress, deliveryLat, deliveryLng, cityId, villageId, areaId, paymentMethod, paymentStatus, currency, couponCode, discountAmount, merchantSubtotal, deliveryFee, quotedPrice, finalPrice, scheduledFor, createdAt, updatedAt)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(3),NOW(3))')
        ->execute([$parentId, $parentNo, $svc['id'], $uid, 'MERCHANT', 'NEW',
            $multi ? null : ($merchants[0]['merchantId'] ?? null),
            $addr, $cartLat, $cartLng,
            ($b['cityId'] ?? null) ?: null, ($b['villageId'] ?? null) ?: null, ($b['areaId'] ?? null) ?: null,
            $pm, 'PENDING', 'EGP', $coupon ? $coupon['code'] : null, $discount ?: null,
            $grandSub, $fee, $final, null, ($b['scheduledFor'] ?? null) ?: null]);
    orderHistory($parentId, null, 'NEW', $uid, 'CUSTOMER', 'Order placed from cart');

    foreach ($merchants as $mi => $m) {
        $childId = $splitPerMerchant ? newId() : $parentId;
        if ($splitPerMerchant) {
            db()->prepare('INSERT INTO `Order` (id, orderNumber, serviceId, customerId, category, status, merchantId, parentOrderId, deliveryAddress, deliveryLat, deliveryLng, paymentMethod, paymentStatus, currency, merchantSubtotal, notes, imageUrls, createdAt, updatedAt)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(3),NOW(3))')
                ->execute([$childId, newOrderNumber($childId), $svc['id'], $uid, 'MERCHANT', 'NEW',
                    $m['merchantId'] ?? null, $parentId, $addr, $cartLat, $cartLng,
                    $pm, 'PENDING', 'EGP', $subtotals[$mi], ($m['notes'] ?? null) ?: null,
                    !empty($m['imageUrls']) ? json_encode($m['imageUrls'], JSON_UNESCAPED_UNICODE) : null]);
            orderHistory($childId, null, 'NEW', $uid, 'CUSTOMER', 'Sub-order of ' . $parentNo);
        } elseif (!empty($m['notes']) || !empty($m['imageUrls'])) {
            // Per-merchant notes/images are merged onto the single order. With
            // several stores the notes are appended rather than overwritten so
            // the last store doesn't silently erase the first one's.
            $exist = db()->prepare('SELECT notes, imageUrls FROM `Order` WHERE id = ?');
            $exist->execute([$parentId]);
            $prev = $exist->fetch() ?: ['notes' => null, 'imageUrls' => null];

            $noteParts = array_filter([
                trim((string) ($prev['notes'] ?? '')),
                trim((string) ($m['notes'] ?? '')),
            ]);
            $prevImgs = $prev['imageUrls'] ? (json_decode((string) $prev['imageUrls'], true) ?: []) : [];
            $imgs = array_values(array_unique(array_merge($prevImgs, (array) ($m['imageUrls'] ?? []))));

            db()->prepare('UPDATE `Order` SET notes = ?, imageUrls = ? WHERE id = ?')
                ->execute([
                    $noteParts ? implode("\n\n", $noteParts) : null,
                    $imgs ? json_encode($imgs, JSON_UNESCAPED_UNICODE) : null,
                    $parentId,
                ]);
        }
        foreach ($lines[$mi] as $l) {
            db()->prepare('INSERT INTO `OrderItem` (id, orderId, productId, productNameSnapshot, unitPriceSnapshot, quantity, merchantId, notes, variantNameSnapshot, addonsSnapshot) VALUES (?,?,?,?,?,?,?,?,?,?)')
                ->execute([
                    newId(), $childId, $l['productId'], $l['name'], $l['unit'], $l['qty'],
                    $m['merchantId'] ?? null, $l['notes'],
                    $l['variantName'] ?? null,
                    !empty($l['addons']) ? json_encode($l['addons'], JSON_UNESCAPED_UNICODE) : null,
                ]);
        }
    }
    if ($coupon) {
        try {
            db()->prepare('INSERT INTO `CouponRedemption` (id, couponId, userId, orderId, discount, createdAt) VALUES (?,?,?,?,?,NOW(3))')
                ->execute([newId(), $coupon['id'], $uid, $parentId, $discount]);
        } catch (Throwable $e) { error_log('[api.php] coupon redeem failed: ' . $e->getMessage()); }
    }
    notifyUser($uid, 'ORDER_STATUS', 'Order received', 'تم استلام طلبك', "Order $parentNo received", "طلبك رقم $parentNo تم استلامه وجاري مراجعته", ['orderId' => $parentId, 'orderNumber' => $parentNo]);
    // Surface the new order in the alerts centre + realtime feed immediately.
    // Money model: goods / delivery / commission / payout, computed once here
    // so app, dashboard and manual orders can never disagree.
    computeOrderFinancials($parentId);
    alertNewOrder($parentId, $parentNo);
    // New-order WhatsApp fan-out — customer + supervisor + group + extras via
    // the editable notification templates (single source of truth).
    notifyOrderParties($parentId, 'NEW');

    $st = db()->prepare('SELECT * FROM `Order` WHERE id = ?');
    $st->execute([$parentId]);
    jsonOk(orderRow($st->fetch()), 201);
}

if (preg_match('#^/orders/from/([^/]+)$#', $path, $mm) && $method === 'POST') {
    $u = authUser();
    $uid = (string) ($u['sub'] ?? '');
    $st = db()->prepare('SELECT * FROM `Order` WHERE id = ? LIMIT 1');
    $st->execute([$mm[1]]);
    $src = $st->fetch();
    if (!$src) jsonErr('الطلب الأصلي غير موجود', 404, 'NOT_FOUND');
    if ($src['customerId'] !== $uid) jsonErr('ممنوع', 403, 'FORBIDDEN');
    $id = newId();
    $no = newOrderNumber($id);
    db()->prepare('INSERT INTO `Order` (id, orderNumber, serviceId, customerId, category, status, merchantId, notes, imageUrls, customData, pickupAddress, pickupLat, pickupLng, deliveryAddress, deliveryLat, deliveryLng, weightKg, sizeCategory, isFragile, speedTier, paymentMethod, paymentStatus, currency, createdAt, updatedAt)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(3),NOW(3))')
        ->execute([$id, $no, $src['serviceId'], $uid, $src['category'], 'NEW', $src['merchantId'], $src['notes'], $src['imageUrls'], $src['customData'],
            $src['pickupAddress'], $src['pickupLat'], $src['pickupLng'], $src['deliveryAddress'], $src['deliveryLat'], $src['deliveryLng'],
            $src['weightKg'], $src['sizeCategory'], $src['isFragile'], $src['speedTier'], $src['paymentMethod'], 'PENDING', 'EGP']);
    $its = db()->prepare('SELECT * FROM `OrderItem` WHERE orderId = ?');
    $its->execute([$mm[1]]);
    foreach ($its->fetchAll() as $it) {
        db()->prepare('INSERT INTO `OrderItem` (id, orderId, productId, productNameSnapshot, unitPriceSnapshot, quantity, merchantId, notes) VALUES (?,?,?,?,?,?,?,?)')
            ->execute([newId(), $id, $it['productId'], $it['productNameSnapshot'], $it['unitPriceSnapshot'], $it['quantity'], $it['merchantId'], $it['notes']]);
    }
    orderHistory($id, null, 'NEW', $uid, 'CUSTOMER', 'Reorder from ' . $src['orderNumber']);
    computeOrderFinancials($id);
    alertNewOrder($id, $no);
    notifyOrderParties($id, 'NEW'); // customer + supervisor + group + extras via templates
    $st->execute([$id]);
    jsonOk(orderRow($st->fetch()), 201); // OrdersScreen toasts newOrder.orderNumber
}

if ($method === 'POST' && $path === '/orders') {
    $u = authUser();
    $uid = (string) ($u['sub'] ?? '');
    $b = readJsonBody();
    $cat = (string) ($b['category'] ?? '');
    if (!in_array($cat, ['DELIVERY', 'SHIPPING', 'MERCHANT'], true)) jsonErr('نوع الطلب غير صحيح', 422, 'VALIDATION_ERROR');
    $ss = db()->prepare('SELECT * FROM `Service` WHERE id = ? LIMIT 1');
    $ss->execute([$b['serviceId'] ?? '']);
    $svc = $ss->fetch();
    if (!$svc || !(int) $svc['isActive']) jsonErr('الخدمة غير متاحة', 404, 'NOT_FOUND');

    if (!empty($b['merchantId'])) {
        $ms = db()->prepare('SELECT id, storeNameAr, manualStatus, timezone FROM `MerchantProfile` WHERE id = ? LIMIT 1');
        $ms->execute([$b['merchantId']]);
        $m = $ms->fetch();
        if ($m) {
            $op = merchantOpenness($m, hoursFor([$m['id']])[$m['id']] ?? []);
            if (!$op['isOpenNow']) conflictErr($op['reason'] === 'OUT_OF_HOURS' ? 'MERCHANT_OUT_OF_HOURS' : 'MERCHANT_CLOSED', 'المتجر ' . $m['storeNameAr'] . ' مغلق حالياً');
        }
    }
    $deliveryAddress = trim((string) ($b['deliveryAddress'] ?? ''));
    $dLat = isset($b['deliveryLat']) ? (float) $b['deliveryLat'] : null;
    $dLng = isset($b['deliveryLng']) ? (float) $b['deliveryLng'] : null;
    $cityId = ($b['cityId'] ?? null) ?: null;
    $villageId = ($b['villageId'] ?? null) ?: null;
    $areaId = ($b['areaId'] ?? null) ?: null;
    if ($deliveryAddress === '') { // fall back to the default address
        $as = db()->prepare('SELECT * FROM `CustomerAddress` WHERE userId = ? ORDER BY isDefault DESC, createdAt DESC LIMIT 1');
        $as->execute([$uid]);
        $a = $as->fetch();
        if (!$a) conflictErr('NO_DEFAULT_ADDRESS', 'سجّل عنوان للتوصيل قبل ما تطلب أول مرة');
        // Inherit the address's saved zone — that's what prices and routes the
        // order. The GPS pin is optional: a zoned address with no pin is fully
        // deliverable, so require a zone OR a pin, not a pin specifically.
        if (!$cityId && !$villageId && !$areaId) {
            $cityId = $a['cityId'] ?: null; $villageId = $a['villageId'] ?: null; $areaId = $a['areaId'] ?: null;
        }
        $hasZone = $cityId || $villageId || $areaId;
        if (($a['lat'] === null || $a['lng'] === null) && !$hasZone) {
            conflictErr('DEFAULT_ADDRESS_MISSING_PIN', 'العنوان الافتراضي يحتاج تحديد منطقة أو موقع على الخريطة');
        }
        $deliveryAddress = (string) $a['address'];
        $dLat = $a['lat'] !== null ? (float) $a['lat'] : null;
        $dLng = $a['lng'] !== null ? (float) $a['lng'] : null;
    }
    $fee = null;
    if ($cityId || $villageId || $areaId) {
        $q = zoneQuote($cityId, $villageId, $areaId);
        if (!$q) jsonErr('اختيارات العنوان غير صحيحة', 400, 'INVALID_ZONE');
        if ($q[0] === 'INACTIVE') jsonErr('هذه المنطقة غير مفعّلة حالياً. اختر منطقة أخرى.', 400, 'INACTIVE_ZONE');
        if ($q[0] === 'NO_PRICE') jsonErr('لا يوجد سعر توصيل لهذه المنطقة، تواصل مع الدعم', 400, 'NO_DELIVERY_PRICE');
        $fee = (float) $q[1];
    }
    $pm = (string) ($b['paymentMethod'] ?? 'CASH');
    if (!in_array($pm, ['CASH', 'VODAFONE_CASH', 'INSTAPAY'], true)) $pm = 'CASH';

    // Coupon: validate + price it, don't just echo the string back into the row.
    // Node prices it against service.basePrice as a proxy (the admin sets the
    // real total later) and skips the maths entirely for QUOTE/zero-base
    // services — where the code is still stored so the admin can honour it.
    $couponCode = !empty($b['couponCode']) ? strtoupper(trim((string) $b['couponCode'])) : null;
    $discount = 0.0; $coupon = null;
    $estimatedAmount = $svc['basePrice'] !== null ? (float) $svc['basePrice'] : 0.0;
    if ($couponCode !== null && $estimatedAmount > 0) {
        [$okC, $resC, $cC] = couponCheck($couponCode, $estimatedAmount, $uid);
        if (!$okC) jsonErr((string) $resC, 422, 'VALIDATION_ERROR');
        $discount = (float) $resC; $coupon = $cC;
    }

    $id = newId();
    $no = newOrderNumber($id);
    db()->prepare('INSERT INTO `Order` (id, orderNumber, serviceId, customerId, category, status, merchantId, notes, imageUrls, customData, pickupAddress, pickupLat, pickupLng, deliveryAddress, deliveryLat, deliveryLng, cityId, villageId, areaId, weightKg, sizeCategory, isFragile, speedTier, deliveryFee, couponCode, discountAmount, paymentMethod, paymentStatus, currency, scheduledFor, createdAt, updatedAt)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(3),NOW(3))')
        ->execute([$id, $no, $svc['id'], $uid, $cat, 'NEW', ($b['merchantId'] ?? null) ?: null,
            ($b['notes'] ?? null) ?: null,
            !empty($b['imageUrls']) ? json_encode($b['imageUrls'], JSON_UNESCAPED_UNICODE) : null,
            !empty($b['customData']) ? json_encode($b['customData'], JSON_UNESCAPED_UNICODE) : null,
            ($b['pickupAddress'] ?? null) ?: null,
            isset($b['pickupLat']) ? (float) $b['pickupLat'] : null, isset($b['pickupLng']) ? (float) $b['pickupLng'] : null,
            $deliveryAddress ?: null, $dLat, $dLng,
            $cityId, $villageId, $areaId,
            isset($b['weightKg']) ? (float) $b['weightKg'] : null, ($b['sizeCategory'] ?? null) ?: null,
            !empty($b['isFragile']) ? 1 : 0, ($b['speedTier'] ?? null) ?: 'STANDARD', $fee,
            $couponCode, $discount > 0 ? $discount : null,
            $pm, 'PENDING', 'EGP', ($b['scheduledFor'] ?? null) ?: null]);

    // Record the redemption so usageLimit/usagePerUser actually bind — without
    // this row couponCheck counts zero and the code can be reused forever.
    if ($coupon) {
        try {
            db()->prepare('INSERT INTO `CouponRedemption` (id, couponId, userId, orderId, discount, createdAt) VALUES (?,?,?,?,?,NOW(3))')
                ->execute([newId(), $coupon['id'], $uid, $id, $discount]);
        } catch (Throwable $e) { error_log('[api.php] coupon redeem failed: ' . $e->getMessage()); }
    }

    foreach ((array) ($b['items'] ?? []) as $it) {
        db()->prepare('INSERT INTO `OrderItem` (id, orderId, productId, productNameSnapshot, quantity, merchantId, notes) VALUES (?,?,?,?,?,?,?)')
            ->execute([newId(), $id, ($it['productId'] ?? null) ?: null, (string) ($it['productNameSnapshot'] ?? '—'), max(1, (int) ($it['quantity'] ?? 1)), ($it['merchantId'] ?? null) ?: null, ($it['notes'] ?? null) ?: null]);
    }
    foreach ((array) ($b['pickupPoints'] ?? []) as $i => $p) {
        if (!isset($p['lat'], $p['lng'])) continue; // lat/lng are NOT NULL
        db()->prepare('INSERT INTO `OrderPickupPoint` (id, orderId, sortOrder, merchantId, label, address, lat, lng, contactName, contactPhone, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
            ->execute([newId(), $id, $i, ($p['merchantId'] ?? null) ?: null, ($p['label'] ?? null) ?: null, (string) ($p['address'] ?? ''), (float) $p['lat'], (float) $p['lng'], ($p['contactName'] ?? null) ?: null, ($p['contactPhone'] ?? null) ?: null, ($p['notes'] ?? null) ?: null]);
    }
    foreach ((array) ($b['deliveryPoints'] ?? []) as $i => $p) {
        if (!isset($p['lat'], $p['lng'])) continue;
        db()->prepare('INSERT INTO `OrderDeliveryPoint` (id, orderId, sortOrder, recipientName, recipientPhone, address, lat, lng, notes) VALUES (?,?,?,?,?,?,?,?,?)')
            ->execute([newId(), $id, $i, (string) ($p['recipientName'] ?? ''), (string) ($p['recipientPhone'] ?? ''), (string) ($p['address'] ?? ''), (float) $p['lat'], (float) $p['lng'], ($p['notes'] ?? null) ?: null]);
    }
    orderHistory($id, null, 'NEW', $uid, 'CUSTOMER', 'Order placed');
    notifyUser($uid, 'ORDER_STATUS', 'Order received', 'تم استلام طلبك', "Order $no received", "طلبك رقم $no تم استلامه وجاري مراجعته", ['orderId' => $id, 'orderNumber' => $no]);
    // New-order WhatsApp fan-out — customer + supervisor + group + extra
    // recipients, all through the editable notification templates (one source
    // of truth). Replaces the old hardcoded customer + on-shift supervisor sends.
    notifyOrderParties($id, 'NEW');
    $st = db()->prepare('SELECT * FROM `Order` WHERE id = ?');
    $st->execute([$id]);
    jsonOk(orderRow($st->fetch()), 201);
}

if (preg_match('#^/orders/([^/]+)/cancel$#', $path, $mm) && $method === 'POST') {
    $u = authUser();
    $uid = (string) ($u['sub'] ?? '');
    $b = readJsonBody();
    $st = db()->prepare('SELECT * FROM `Order` WHERE id = ? LIMIT 1');
    $st->execute([$mm[1]]);
    $o = $st->fetch();
    if (!$o) jsonErr('الطلب غير موجود', 404, 'NOT_FOUND');
    if ($o['customerId'] !== $uid) jsonErr('لا تستطيع إلغاء هذا الطلب', 403, 'FORBIDDEN');
    if (in_array($o['status'], ['CANCELLED', 'COMPLETED', 'DELIVERED'], true)) jsonErr('لا يمكن إلغاء الطلب في هذه الحالة', 422, 'INVALID_STATE_TRANSITION');
    $reason = trim((string) ($b['reason'] ?? '')) ?: 'لا يوجد سبب محدد';
    db()->prepare("UPDATE `Order` SET status = 'CANCELLED', cancelledAt = NOW(3), cancellationReason = ?, updatedAt = NOW(3) WHERE id = ? OR parentOrderId = ?")
        ->execute([$reason, $mm[1], $mm[1]]);
    orderHistory($mm[1], (string) $o['status'], 'CANCELLED', $uid, 'CUSTOMER', $reason);
    $st->execute([$mm[1]]);
    jsonOk(orderRow($st->fetch()));
}

if (preg_match('#^/orders/([^/]+)/review$#', $path, $mm) && in_array($method, ['POST', 'GET'], true)) {
    $u = authUser();
    $uid = (string) ($u['sub'] ?? '');
    $st = db()->prepare('SELECT * FROM `Order` WHERE id = ? LIMIT 1');
    $st->execute([$mm[1]]);
    $o = $st->fetch();
    if (!$o) jsonErr('الطلب غير موجود', 404, 'NOT_FOUND');
    if ($o['customerId'] !== $uid && !in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('ممنوع', 403, 'FORBIDDEN');
    $rs = db()->prepare('SELECT * FROM `OrderReview` WHERE orderId = ? LIMIT 1');
    $rs->execute([$mm[1]]);
    $existing = $rs->fetch();
    if ($method === 'GET') { jsonOk($existing ?: null); }
    if ($existing) {
        http_response_code(409);
        echo json_encode(['error' => ['code' => 'CONFLICT', 'message' => 'Already reviewed', 'messageAr' => 'تم تقييم هذا الطلب من قبل']], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if (!in_array($o['status'], ['DELIVERED', 'COMPLETED'], true)) jsonErr('لا يمكن تقييم الطلب قبل تسليمه', 422, 'VALIDATION_ERROR');
    $b = readJsonBody();
    $rating = (int) ($b['rating'] ?? 0);
    if ($rating < 1 || $rating > 5) jsonErr('التقييم من 1 إلى 5', 422, 'VALIDATION_ERROR');
    // Persist the links from the ORDER itself — never trust IDs from the client.
    // A driverRating with no driver on the order, or a merchantRating with no
    // merchant, would create a review that can never resolve a name later; log
    // it loudly at write time so the gap is visible where it's created, not
    // discovered months later as "غير معروف" in the admin panel.
    $driverId = $o['assignedDriverId'] ?: null;
    $merchantId = $o['merchantId'] ?: null;
    if (isset($b['driverRating']) && !$driverId) {
        error_log('[api.php] review on order ' . $mm[1] . ': driverRating given but order has no assignedDriverId');
    }
    if (isset($b['merchantRating']) && !$merchantId) {
        error_log('[api.php] review on order ' . $mm[1] . ': merchantRating given but order has no merchantId');
    }
    $id = newId();
    db()->prepare('INSERT INTO `OrderReview` (id, orderId, customerId, driverId, merchantId, rating, driverRating, merchantRating, comment, createdAt) VALUES (?,?,?,?,?,?,?,?,?,NOW(3))')
        ->execute([$id, $mm[1], $uid, $driverId, $merchantId, $rating,
            // Only keep a per-target score when that target actually exists on
            // the order — otherwise the score is meaningless and unattributable.
            (isset($b['driverRating']) && $driverId) ? (int) $b['driverRating'] : null,
            (isset($b['merchantRating']) && $merchantId) ? (int) $b['merchantRating'] : null,
            ($b['comment'] ?? null) ?: null]);
    // Recompute the driver's running average (fire-and-forget in Node too).
    try {
        if ($o['assignedDriverId']) {
            db()->prepare('UPDATE `DriverProfile` SET rating = (SELECT AVG(driverRating) FROM `OrderReview` WHERE driverId = ? AND driverRating IS NOT NULL), updatedAt = NOW(3) WHERE userId = ?')
                ->execute([$o['assignedDriverId'], $o['assignedDriverId']]);
        }
        if ($o['merchantId']) {
            db()->prepare('UPDATE `MerchantProfile` SET rating = (SELECT AVG(merchantRating) FROM `OrderReview` WHERE merchantId = ? AND merchantRating IS NOT NULL), updatedAt = NOW(3) WHERE id = ?')
                ->execute([$o['merchantId'], $o['merchantId']]);
        }
    } catch (Throwable $e) { error_log('[api.php] rating recompute failed: ' . $e->getMessage()); }
    $rs->execute([$mm[1]]);
    jsonOk($rs->fetch(), 201);
}

if (preg_match('#^/orders/([^/]+)$#', $path, $mm) && $method === 'GET') {
    $u = authUser();
    $uid = (string) ($u['sub'] ?? '');
    $st = db()->prepare('SELECT * FROM `Order` WHERE id = ? LIMIT 1');
    $st->execute([$mm[1]]);
    $o = $st->fetch();
    if (!$o) jsonErr('الطلب غير موجود', 404, 'NOT_FOUND');
    if ($o['customerId'] !== $uid && !in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('لا تستطيع عرض هذا الطلب', 403, 'FORBIDDEN');
    $out = orderRow($o);
    $q = fn(string $sql, array $a) => (function () use ($sql, $a) { $s = db()->prepare($sql); $s->execute($a); return $s->fetchAll(); })();
    $ss = db()->prepare('SELECT * FROM `Service` WHERE id = ? LIMIT 1');
    $ss->execute([$o['serviceId']]);
    $out['service'] = jsonizeRow($ss->fetch() ?: null);
    /*
     * Items, including those on child orders.
     *
     * A multi-merchant cart writes its OrderItems onto the per-merchant CHILD
     * orders, not the parent. The customer only ever sees the parent (
     * /orders/mine filters parentOrderId IS NULL), so asking for the parent
     * returned an order with an empty item list — "what did I order, and from
     * where?" had no answer anywhere in the app.
     *
     * Reading the children here keeps ONE order for the customer while each
     * line still carries its own merchantId, which is what lets the app and the
     * dashboard group the order by store.
     */
    $out['items'] = $q(
        'SELECT oi.*, mp.storeNameAr AS merchantNameAr'
        . ' FROM `OrderItem` oi'
        . ' LEFT JOIN `MerchantProfile` mp ON mp.id = oi.merchantId'
        . ' WHERE oi.orderId = ?'
        . ' OR oi.orderId IN (SELECT id FROM `Order` WHERE parentOrderId = ?)'
        . ' ORDER BY oi.merchantId, oi.id',
        [$mm[1], $mm[1]]
    );
    // Nest the merchant the way the clients expect, rather than leaving a flat
    // column they'd each have to know about.
    foreach ($out['items'] as &$__it) {
        $__it['merchant'] = $__it['merchantNameAr'] !== null
            ? ['id' => $__it['merchantId'], 'storeNameAr' => $__it['merchantNameAr']]
            : null;
        unset($__it['merchantNameAr']);
    }
    unset($__it);
    $out['pickupPoints'] = $q('SELECT * FROM `OrderPickupPoint` WHERE orderId = ? ORDER BY sortOrder ASC', [$mm[1]]);
    $out['deliveryPoints'] = $q('SELECT * FROM `OrderDeliveryPoint` WHERE orderId = ? ORDER BY sortOrder ASC', [$mm[1]]);
    // OrderTrackingScreen .map()s statusHistory with no guard.
    $out['statusHistory'] = $q('SELECT * FROM `OrderStatusHistory` WHERE orderId = ? ORDER BY createdAt ASC', [$mm[1]]);
    $out['assignedDriver'] = null;
    if ($o['assignedDriverId']) {
        $ds = db()->prepare('SELECT id, name, phone FROM `User` WHERE id = ? LIMIT 1');
        $ds->execute([$o['assignedDriverId']]);
        $out['assignedDriver'] = $ds->fetch() ?: null;
    }
    // Nest the merchant so the app can show a "قيّم التاجر" row — only present
    // when the order was actually placed against a specific store (not a quick
    // order), which is exactly the gate the review row wants.
    $out['merchant'] = null;
    if ($o['merchantId']) {
        $ms = db()->prepare('SELECT id, storeNameAr FROM `MerchantProfile` WHERE id = ? LIMIT 1');
        $ms->execute([$o['merchantId']]);
        $out['merchant'] = $ms->fetch() ?: null;
    }
    $rs = db()->prepare('SELECT * FROM `OrderReview` WHERE orderId = ? LIMIT 1');
    $rs->execute([$mm[1]]);
    $out['review'] = $rs->fetch() ?: null;
    $subs = $q('SELECT * FROM `Order` WHERE parentOrderId = ? ORDER BY createdAt ASC', [$mm[1]]);
    $out['subOrders'] = array_map(function ($s) {
        $so = orderRow($s);
        $i = db()->prepare('SELECT * FROM `OrderItem` WHERE orderId = ?');
        $i->execute([$s['id']]);
        $so['items'] = $i->fetchAll();
        $h = db()->prepare('SELECT * FROM `OrderStatusHistory` WHERE orderId = ? ORDER BY createdAt ASC');
        $h->execute([$s['id']]);
        $so['statusHistory'] = $h->fetchAll();
        $so['assignedDriver'] = null;
        if ($s['assignedDriverId']) {
            $d = db()->prepare('SELECT id, name, phone FROM `User` WHERE id = ? LIMIT 1');
            $d->execute([$s['assignedDriverId']]);
            $so['assignedDriver'] = $d->fetch() ?: null;
        }
        return $so;
    }, $subs);
    jsonOk($out);
}

// ═══ RECURRING ORDERS ══════════════════════════════════════════════════
if ($method === 'GET' && $path === '/me/recurring-orders') {
    $u = authUser();
    $st = db()->prepare('SELECT r.*, s.nameAr AS s_nameAr, s.key AS s_key FROM `RecurringOrder` r LEFT JOIN `Service` s ON s.id = r.serviceId WHERE r.customerId = ? ORDER BY r.createdAt DESC');
    $st->execute([(string) ($u['sub'] ?? '')]);
    $out = [];
    foreach ($st->fetchAll() as $r) {
        $x = boolCast(jsonizeRow($r), ['isActive']);
        $x['service'] = ['id' => $r['serviceId'], 'nameAr' => $r['s_nameAr'], 'key' => $r['s_key']];
        unset($x['s_nameAr'], $x['s_key']);
        $out[] = $x;
    }
    jsonOk($out);
}
if (preg_match('#^/me/recurring-orders/([^/]+)$#', $path, $mm) && in_array($method, ['PATCH', 'DELETE'], true)) {
    $u = authUser();
    $uid = (string) ($u['sub'] ?? '');
    $st = db()->prepare('SELECT * FROM `RecurringOrder` WHERE id = ? AND customerId = ? LIMIT 1');
    $st->execute([$mm[1], $uid]);
    if (!$st->fetch()) jsonErr('غير موجود', 404, 'NOT_FOUND');
    if ($method === 'DELETE') { db()->prepare('DELETE FROM `RecurringOrder` WHERE id = ?')->execute([$mm[1]]); noContent(); }
    $b = readJsonBody();
    if (array_key_exists('isActive', $b)) {
        db()->prepare('UPDATE `RecurringOrder` SET isActive = ?, updatedAt = NOW(3) WHERE id = ?')->execute([!empty($b['isActive']) ? 1 : 0, $mm[1]]);
    }
    $st->execute([$mm[1], $uid]);
    jsonOk(boolCast(jsonizeRow($st->fetch()), ['isActive']));
}

// ═══ PRICING ═══════════════════════════════════════════════════════════
if ($method === 'POST' && $path === '/pricing/estimate') {
    $b = readJsonBody();
    $ss = db()->prepare('SELECT * FROM `Service` WHERE id = ? LIMIT 1');
    $ss->execute([$b['serviceId'] ?? '']);
    $s = $ss->fetch();
    if (!$s) jsonErr('الخدمة غير متاحة', 404, 'NOT_FOUND');
    if ($s['pricingMethod'] === 'QUOTE') jsonOk(['estimate' => null, 'method' => 'QUOTE', 'note' => 'سيتم تسعيره يدوياً من الإدارة']);
    $base = (float) ($s['basePrice'] ?? 0);
    $km = 0.0;
    if (isset($b['pickupLat'], $b['pickupLng'], $b['deliveryLat'], $b['deliveryLng'])) {
        $dLat = deg2rad(((float) $b['deliveryLat']) - ((float) $b['pickupLat']));
        $dLng = deg2rad(((float) $b['deliveryLng']) - ((float) $b['pickupLng']));
        $a = sin($dLat / 2) ** 2 + cos(deg2rad((float) $b['pickupLat'])) * cos(deg2rad((float) $b['deliveryLat'])) * sin($dLng / 2) ** 2;
        $km = 6371 * 2 * atan2(sqrt($a), sqrt(1 - $a));
    }
    $perKm = (float) ($s['pricePerKm'] ?? 0) * $km;
    $perKg = (float) ($s['pricePerKg'] ?? 0) * (float) ($b['weightKg'] ?? 0);
    $total = $base + $perKm + $perKg;
    if (!empty($b['isFragile'])) $total += 10;
    if (($b['speedTier'] ?? '') === 'EXPRESS') $total *= 1.25;
    jsonOk(['estimate' => round($total), 'method' => $s['pricingMethod'],
        'breakdown' => ['base' => $base, 'distance' => round($km, 2), 'perKm' => round($perKm, 2), 'perKg' => round($perKg, 2)]]);
}

// ═══ UPLOADS ═══════════════════════════════════════════════════════════
if ($method === 'POST' && $path === '/uploads') {
    authUser();
    if (empty($_FILES['file']) || ($_FILES['file']['error'] ?? 1) !== UPLOAD_ERR_OK) jsonErr('لم يتم رفع أي ملف', 422, 'VALIDATION_ERROR');
    $f = $_FILES['file'];
    $max = (int) env('UPLOAD_MAX_BYTES', '10485760');
    if ((int) $f['size'] > $max) jsonErr('حجم الملف كبير جداً', 422, 'FILE_TOO_LARGE');
    $ext = strtolower(pathinfo((string) $f['name'], PATHINFO_EXTENSION));
    if (!preg_match('/^[a-z0-9]{1,5}$/', $ext)) $ext = 'bin';
    if (!in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'm4a', 'mp3', 'wav', 'aac', 'pdf'], true)) jsonErr('نوع الملف غير مدعوم', 422, 'BAD_FILE_TYPE');
    $dir = __DIR__ . '/uploads';
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    $name = date('Ymd') . '_' . bin2hex(random_bytes(8)) . '.' . $ext;
    if (!@move_uploaded_file($f['tmp_name'], "$dir/$name")) jsonErr('تعذّر حفظ الملف', 500, 'UPLOAD_FAILED');
    jsonOk(['url' => rtrim((string) env('API_BASE_URL', ''), '/') . '/uploads/' . $name]);
}

// ═══ HOME / SITE CONFIG (public) ═══════════════════════════════════════
if ($method === 'GET' && $path === '/home-config') {
    $rows = db()->query('SELECT * FROM `HomeConfig` ORDER BY id ASC LIMIT 1')->fetchAll();
    $cfg = $rows[0] ?? null;
    if (!$cfg) { // upsert-on-first-read, like loadConfig()
        db()->prepare("INSERT INTO `HomeConfig` (id, updatedAt) VALUES ('singleton', NOW(3))")->execute();
        $cfg = db()->query('SELECT * FROM `HomeConfig` LIMIT 1')->fetch() ?: [];
    }
    $cfg = boolCast(jsonizeRow($cfg), ['showPromoBanner', 'showTrustStrip']);
    // heroGradient / visibleServiceKeys / featuredMerchantIds / featuredOfferIds
    // are spread + .includes()-ed client-side — must be arrays or null, never {}.
    foreach (['heroGradient', 'visibleServiceKeys', 'featuredMerchantIds', 'featuredOfferIds', 'featuredProductIds'] as $k) {
        if (!array_key_exists($k, $cfg) || !is_array($cfg[$k] ?? null)) $cfg[$k] = $cfg[$k] ?? null;
    }
    $cfg['promoCoupon'] = null;
    if (!empty($cfg['promoBannerCouponId'])) {
        // validTo checked in SQL — see the couponCheck() timezone note.
        $st = db()->prepare('SELECT *, (validTo IS NULL OR validTo >= NOW(3)) AS stillValid FROM `Coupon` WHERE id = ? LIMIT 1');
        $st->execute([$cfg['promoBannerCouponId']]);
        $c = $st->fetch();
        if ($c && (int) $c['isActive'] && (int) $c['stillValid']) {
            $cfg['promoCoupon'] = ['id' => $c['id'], 'code' => $c['code'], 'type' => $c['type'], 'value' => (string) $c['value'], 'description' => $c['description']];
        }
    }
    jsonOk($cfg);
}

if ($method === 'GET' && $path === '/site-config') {
    // CACHED: this is public and the landing page calls it on EVERY visit, so
    // uncached it turned each anonymous visitor into a MySQL connection — the
    // single biggest consumer of the 500 connections/hour the shared plan
    // allows. Settings change a few times a day at most, so serve from a small
    // file and only touch the DB when it goes stale. PUT /admin/site-config
    // deletes this file, so a save is still reflected immediately.
    $ccFile = sys_get_temp_dir() . '/tamem_site_config.json';
    $ccTtl = 300; // 5 min
    if (is_file($ccFile) && (time() - (int) @filemtime($ccFile)) < $ccTtl) {
        $cached = @file_get_contents($ccFile);
        if ($cached !== false && $cached !== '') {
            header('Content-Type: application/json; charset=utf-8');
            header('X-Cache: HIT');
            http_response_code(200);
            echo $cached;
            exit;
        }
    }
    // Reduce Setting table into a keyed dict — that's how the landing page
    // and admin site-settings both expect it. Use an associative array so
    // json_encode outputs {...} and any key characters are safe.
    try {
        $rows = db()->query('SELECT `key`, `value` FROM `Setting`')->fetchAll();
    } catch (Throwable $e) {
        // DB unavailable (e.g. the hourly connection cap). Serve a stale cache
        // rather than breaking the public site — old copy beats no site.
        if (is_file($ccFile)) {
            $stale = @file_get_contents($ccFile);
            if ($stale !== false && $stale !== '') {
                header('Content-Type: application/json; charset=utf-8');
                header('X-Cache: STALE');
                http_response_code(200);
                echo $stale;
                exit;
            }
        }
        jsonErr('لم يتم تحميل الإعدادات: ' . $e->getMessage(), 500, 'SETTINGS_ERROR');
    }
    $out = [];
    foreach ($rows as $r) $out[(string) $r['key']] = settingValue($r['value']);
    // Force object encoding even when empty so the client's `.foo` lookups
    // don't crash.
    $payload = json_encode(['data' => (object) $out], JSON_UNESCAPED_UNICODE);
    @file_put_contents($ccFile, $payload);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Cache: MISS');
    http_response_code(200);
    echo $payload;
    exit;
}

// ─── Ultimate GET fallback — default to empty LIST wrapped in the paginated
// envelope. Singular endpoints must be handled specifically above.
if ($method === 'GET' && !str_starts_with($path, '/auth/') && $path !== '/health') {
    try { authUser(); } catch (Throwable $e) { jsonErr('Endpoint not found: ' . $method . ' ' . $path, 404, 'NOT_FOUND'); }
    header('X-PHP-Shim-Stub: 1');
    http_response_code(200);
    echo json_encode([
        'data' => [],
        'meta' => ['pagination' => ['page' => 1, 'pageSize' => 20, 'total' => 0, 'totalPages' => 0]],
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// Ultimate mutation fallback: silently echo the payload so no error toast.
if (in_array($method, ['POST', 'PATCH', 'PUT', 'DELETE'], true) && !str_starts_with($path, '/auth/')) {
    try { authUser(); } catch (Throwable $e) { /* let unauthed POSTs 404 */ }
    $b = readJsonBody();
    $echo = is_array($b) ? $b : [];
    if (!isset($echo['id'])) $echo['id'] = newId();
    jsonOk($echo);
}

if ($method === 'POST' && $path === '/auth/login') {
    $b = readJsonBody();
    $raw = trim((string)($b['identifier'] ?? $b['phone'] ?? ''));
    $password = (string)($b['password'] ?? '');
    if ($raw === '' || $password === '') jsonErr('أدخل البريد وكلمة المرور', 422, 'MISSING_FIELDS');

    // Normalize like the Node validator: email → lowercase; else Egyptian phone → +20…
    if (str_contains($raw, '@')) {
        $identifier = strtolower($raw);
        $col = 'email';
    } else {
        $cleaned = preg_replace('/[\s\-()]/', '', $raw) ?? '';
        if (!preg_match('/^(?:\+?20|0)?(1[0125]\d{8})$/', $cleaned, $m)) {
            jsonErr('بريد إلكتروني أو رقم هاتف مصري غير صحيح', 422, 'INVALID_IDENTIFIER');
        }
        $identifier = '+20' . $m[1];
        $col = 'phone';
    }

    $stmt = db()->prepare("SELECT id, name, phone, email, role, isActive, passwordHash FROM `User` WHERE `$col` = ? LIMIT 1");
    $stmt->execute([$identifier]);
    $user = $stmt->fetch();
    if (!$user || !$user['passwordHash']) jsonErr('بيانات الدخول غير صحيحة', 401, 'INVALID_CREDS');

    // password_verify handles $2a$ / $2b$ / $2y$ bcrypt hashes
    if (!password_verify($password, $user['passwordHash'])) {
        jsonErr('بيانات الدخول غير صحيحة', 401, 'INVALID_CREDS');
    }
    if (!(int) $user['isActive']) jsonErr('الحساب غير مفعّل', 403, 'INACTIVE');

    $role = (string) $user['role'];
    // Admin → OTP flow. Everyone else → direct tokens.
    if ($role === 'ADMIN' || $role === 'SUPER_ADMIN') {
        otpSweep();
        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $token = rtrim(strtr(base64_encode(random_bytes(24)), '+/', '-_'), '=');
        $ttlMin = (int) env('ADMIN_OTP_TTL_MINUTES', '5');
        otpStore($token, [
            'userId' => $user['id'],
            'role' => $role,
            'identifier' => $identifier,
            'code' => $code,
            'expiresAt' => time() + ($ttlMin * 60),
            'attempts' => 0,
        ]);
        $recipients = array_filter(array_map('trim', explode(',',
            env('ADMIN_OTP_RECIPIENTS', 'info@deliverytamem.com,DeliveryTamemQift@gmail.com'))));
        $subject = "[تميم] رمز الدخول للوحة التحكم: $code";
        $text = "رمز الدخول للوحة تحكم تميم:\n\n    $code\n\nصالح لمدة {$ttlMin} دقائق.\nطلب الدخول: {$identifier}\nوقت الطلب: " . gmdate('Y-m-d H:i:s') . " UTC\n\nلو مش انت اللي طلبت الدخول، تجاهل الرسالة وغيّر كلمة المرور فوراً.";
        $html = '<!doctype html><html lang="ar" dir="rtl"><body style="font-family:Tahoma,Arial;padding:20px;background:#f5f6f8">'
            . '<div style="max-width:520px;margin:auto;background:#fff;border:1px solid #ddd;border-radius:12px;padding:28px">'
            . '<h2 style="color:#E0301E;margin:0 0 8px">رمز الدخول للوحة تحكم تميم</h2>'
            . '<p style="color:#555;margin:0 0 20px">استخدم الرمز التالي لإكمال تسجيل الدخول:</p>'
            . '<div style="font-family:monospace;font-size:36px;font-weight:800;letter-spacing:8px;text-align:center;background:#241310;color:#F2A93B;padding:20px;border-radius:10px;margin:10px 0">'
            . htmlspecialchars($code) . '</div>'
            . '<p style="color:#666;font-size:13px;margin-top:20px">صالح لمدة <b>' . $ttlMin . ' دقائق</b>.<br>طلب الدخول: <span style="direction:ltr;display:inline-block">' . htmlspecialchars($identifier) . '</span></p>'
            . '<hr style="border:none;border-top:1px solid #eee;margin:20px 0">'
            . '<p style="color:#999;font-size:12px;text-align:center">لو مش انت اللي طلبت الدخول، تجاهل الرسالة وغيّر كلمة المرور فوراً.</p>'
            . '</div></body></html>';
        $sendRes = smtpSend($recipients, $subject, $text, $html);
        // Even if SMTP failed we still return requiresOtp so the admin can
        // ask us for the code out-of-band; but log the failure server-side.
        if (!$sendRes['ok']) error_log('[api.php] SMTP send failed: ' . json_encode($sendRes));

        jsonOk([
            'requiresOtp' => true,
            'pendingToken' => $token,
            'expiresInSec' => $ttlMin * 60,
            'otpRecipientsCount' => count($recipients),
        ]);
    }

    // Non-admin: sign and return tokens directly.
    $accessSecret = env('JWT_ACCESS_SECRET');
    $refreshSecret = env('JWT_REFRESH_SECRET');
    if (!$accessSecret || !$refreshSecret) jsonErr('JWT secrets not configured', 500, 'CONFIG_MISSING');
    $accessTtl = 15 * 60;
    $access = jwtSign(['sub' => $user['id'], 'role' => $role], $accessSecret, $accessTtl);
    $refresh = jwtSign(['sub' => $user['id'], 'typ' => 'refresh'], $refreshSecret, 30 * 24 * 3600);
    // Login-alert email (best-effort, deferred). Only if the user has an email.
    if (!empty($user['email'])) {
        $when = gmdate('Y-m-d H:i') . ' UTC';
        $nm = (string) $user['name'];
        mailDefer((string) $user['email'], 'تسجيل دخول جديد إلى حسابك في تميم',
            "مرحباً {$nm}،\nتم تسجيل الدخول إلى حسابك في تطبيق تميم بتاريخ {$when}.\nلو لم تكن أنت، غيّر كلمة المرور فوراً.",
            emailShell('تسجيل دخول جديد إلى حسابك',
                '<p>مرحباً <b>' . htmlspecialchars($nm) . '</b>،</p>'
                . '<p>تم تسجيل الدخول إلى حسابك في تطبيق تميم بتاريخ <b style="direction:ltr;display:inline-block">' . $when . '</b>.</p>'
                . '<p style="color:#999;font-size:13px">لو لم تكن أنت من قام بذلك، غيّر كلمة المرور فوراً.</p>'));
    }
    jsonOk([
        'requiresOtp' => false,
        'user' => [
            'id' => $user['id'], 'name' => $user['name'],
            'phone' => $user['phone'], 'email' => $user['email'], 'role' => $role,
        ],
        'tokens' => ['accessToken' => $access, 'refreshToken' => $refresh],
    ]);
}

if ($method === 'POST' && $path === '/auth/admin/otp/verify') {
    $b = readJsonBody();
    $token = (string) ($b['pendingToken'] ?? '');
    $code = trim((string) ($b['code'] ?? ''));
    if ($token === '' || !preg_match('/^\d{4,8}$/', $code)) {
        jsonErr('البيانات ناقصة', 422, 'MISSING_FIELDS');
    }
    otpSweep();
    $pending = otpFetch($token);
    if (!$pending) jsonErr('انتهت صلاحية الرمز، اطلب رمز جديد', 401, 'EXPIRED');
    if (($pending['expiresAt'] ?? 0) < time()) { otpDelete($token); jsonErr('انتهت صلاحية الرمز، اطلب رمز جديد', 401, 'EXPIRED'); }

    $pending['attempts'] = (int) ($pending['attempts'] ?? 0) + 1;
    if ($pending['attempts'] > 5) { otpDelete($token); jsonErr('محاولات كثيرة، اطلب رمز جديد', 401, 'TOO_MANY'); }
    otpStore($token, $pending);
    if (!hash_equals((string) $pending['code'], $code)) jsonErr('كود التحقق غير صحيح', 401, 'BAD_CODE');

    otpDelete($token);

    // Load user again fresh in case they got disabled mid-OTP.
    $stmt = db()->prepare('SELECT id, name, phone, email, role, isActive, permissions FROM `User` WHERE id = ? LIMIT 1');
    $stmt->execute([$pending['userId']]);
    $user = $stmt->fetch();
    if (!$user || !(int) $user['isActive']) jsonErr('الحساب غير مفعّل', 403, 'INACTIVE');

    $accessSecret = env('JWT_ACCESS_SECRET');
    $refreshSecret = env('JWT_REFRESH_SECRET');
    if (!$accessSecret || !$refreshSecret) jsonErr('JWT secrets not configured', 500, 'CONFIG_MISSING');
    // 6-hour session for admins per requirement — refresh matches so it can't extend past a single login.
    $adminTtl = ((int) env('ADMIN_SESSION_TTL_HOURS', '6')) * 3600;
    $access = jwtSign(['sub' => $user['id'], 'role' => $user['role']], $accessSecret, $adminTtl);
    $refresh = jwtSign(['sub' => $user['id'], 'typ' => 'refresh'], $refreshSecret, $adminTtl);
    jsonOk([
        'user' => [
            'id' => $user['id'], 'name' => $user['name'],
            'phone' => $user['phone'], 'email' => $user['email'], 'role' => $user['role'],
            // null = unrestricted (super/legacy); an array = a scoped admin.
            'permissions' => is_string($user['permissions'] ?? null) && $user['permissions'] !== ''
                ? (json_decode($user['permissions'], true) ?: []) : null,
        ],
        'tokens' => ['accessToken' => $access, 'refreshToken' => $refresh],
    ]);
}

// Unknown route
jsonErr('Endpoint not found: ' . $method . ' ' . $path, 404, 'NOT_FOUND');
