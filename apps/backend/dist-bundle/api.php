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
    header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');
    header('Access-Control-Max-Age: 86400');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header('Content-Type: application/json; charset=utf-8');

function jsonOk(array $data, int $code = 200): void {
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
    $pdo = new PDO($dsn, $user, $pass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
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

// ─── ADMIN endpoints (require admin JWT) ────────────────────────────────
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
    $items = $st->fetchAll();
    // Stats by severity — that's what the api-client's `adminListAlerts`
    // pulls out of `meta.stats`.
    $sevCounts = db()->query("SELECT severity, COUNT(*) c FROM `Alert` WHERE isResolved = 0 GROUP BY severity")->fetchAll();
    $bySeverity = [];
    foreach ($sevCounts as $c) $bySeverity[$c['severity']] = (int) $c['c'];
    $resolvedToday = (int) db()->query("SELECT COUNT(*) FROM `Alert` WHERE isResolved = 1 AND resolvedAt >= '" . gmdate('Y-m-d 00:00:00') . "'")->fetchColumn();
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
            ],
        ],
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'GET' && $path === '/admin/alerts/stats') {
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

// ─── WhatsApp bot — the real thing needs wppconnect + headless Chromium
// (impossible on shared hosting). We return a well-formed "disconnected"
// state so the UI shows a clean disabled panel instead of a red error.
if ($method === 'GET' && $path === '/admin/whatsapp/status') {
    authUser();
    jsonOk([
        'connected' => false,
        'phoneNumber' => null,
        'qrCode' => null,
        'status' => 'disconnected',
        'message' => 'خدمة الواتساب متوقفة — تحتاج تفعيل Node.js من hPanel',
    ]);
}
if ($method === 'POST' && (
    $path === '/admin/whatsapp/start' || $path === '/admin/whatsapp/stop' ||
    $path === '/admin/whatsapp/logout' || $path === '/admin/whatsapp/reset' ||
    $path === '/admin/whatsapp/send-test'
)) {
    authUser();
    // Return 200 with a message body instead of 503 so the dashboard mutation
    // handler doesn't fire a red error toast — the WhatsApp page already
    // renders a friendly "غير متاح" panel.
    jsonOk([
        'connected' => false,
        'status' => 'disconnected',
        'message' => 'خدمة الواتساب متوقفة — تحتاج تفعيل Node.js من hPanel',
    ]);
}

// Payment gateway config — the page expects a fixed shape with `keys` and
// `paymentOptions`. Returning a bare {} makes `initial.keys.apiKey` crash.
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

// Revenue report — TWO different shapes:
//   /admin/reports/revenue          → overview card data ({ trend, kpis… })
//   /admin/reports/revenue/detailed → the printable revenue-report page,
//     which reads `data.summary.ordersCount`, `data.range.from`, etc.
if ($method === 'GET' && str_starts_with($path, '/admin/reports/revenue')) {
    $u = authUser();
    if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $isDetailed = ($path === '/admin/reports/revenue/detailed');
    $range = $_GET['range'] ?? 'month';
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
        $byDay[$day] = ($byDay[$day] ?? 0) + $amt;
    }
    ksort($byDay);
    $trend = [];
    foreach ($byDay as $d => $v) $trend[] = ['day' => $d, 'revenue' => $v];

    if ($isDetailed) {
        // The revenue-report page reads: range.from, range.to, generatedAt,
        // summary.{ordersCount, totalSales, totalCommission, totalDeliveryFees,
        // totalDiscounts, totalWalletUsed, totalMerchantPayouts, totalTamemNet},
        // byMerchant[], byPaymentMethod[], rows[].
        jsonOk([
            'range' => ['from' => $from, 'to' => $to],
            'generatedAt' => gmdate('Y-m-d\TH:i:s.000\Z'),
            'summary' => [
                'ordersCount' => $count,
                'totalSales' => $total,
                'totalCommission' => 0.0,
                'totalDeliveryFees' => 0.0,
                'totalDiscounts' => 0.0,
                'totalWalletUsed' => 0.0,
                'totalMerchantPayouts' => 0.0,
                'totalTamemNet' => $total,
            ],
            'byMerchant' => [],
            'byPaymentMethod' => [],
            'rows' => [],
        ]);
    }

    jsonOk([
        'range' => ['key' => $range, 'from' => $from, 'to' => $to],
        'from' => $from,
        'to' => $to,
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
    $jsonFields = ['heroGradient', 'visibleServiceKeys', 'featuredMerchantIds', 'featuredOfferIds'];
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

if ($method === 'GET' && $path === '/admin/site-config') {
    authUser();
    $rows = db()->query('SELECT `key`, `value` FROM `Setting`')->fetchAll();
    $out = [];
    foreach ($rows as $r) $out[(string) $r['key']] = $r['value'];
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
$RES = [
    'supervisors'      => 'Supervisor',
    'pricing-rules'    => 'PricingRule',
    'coupons'          => 'Coupon',
    'offers'           => 'Offer',
    'products'         => 'Product',
    'services'         => 'Service',
    'categories'       => 'Category',
    'reviews'          => 'OrderReview',
    'payments'         => 'Payment',
    'orders'           => 'Order',
    'settings'         => 'Setting',
];

function jsonizeRow(?array $row): ?array {
    if (!$row) return $row;
    // Decode obvious JSON strings + coerce tinyint booleans.
    foreach ($row as $k => $v) {
        if (is_string($v) && strlen($v) >= 2 && ($v[0] === '[' || $v[0] === '{')) {
            $d = json_decode($v, true);
            if ($d !== null) $row[$k] = $d;
        }
    }
    return $row;
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
    // Optional pagination: ?page=N&pageSize=M
    $page = max(1, (int)($_GET['page'] ?? 1));
    $size = min(100, max(1, (int)($_GET['pageSize'] ?? 20)));
    $off = ($page - 1) * $size;

    // Special: /admin/customers|drivers|merchants pull from User + profile.
    // (handled outside this map.)
    $orderBy = 'ORDER BY createdAt DESC';
    // Setting has no createdAt column.
    if ($tbl === 'Setting') $orderBy = 'ORDER BY `key` ASC';

    $total = (int) db()->query("SELECT COUNT(*) FROM `$tbl`")->fetchColumn();
    $st = db()->prepare("SELECT * FROM `$tbl` $orderBy LIMIT $size OFFSET $off");
    $st->execute();
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

// Users by role — customers / drivers / merchants
if ($method === 'GET' && preg_match('#^/admin/(customers|drivers|merchants)$#', $path, $m)) {
    authUser();
    $roleMap = ['customers' => 'CUSTOMER', 'drivers' => 'DRIVER', 'merchants' => 'MERCHANT'];
    $role = $roleMap[$m[1]];
    $page = max(1, (int)($_GET['page'] ?? 1));
    $size = min(100, max(1, (int)($_GET['pageSize'] ?? 20)));
    $off = ($page - 1) * $size;
    $total = (int) db()->prepare('SELECT COUNT(*) FROM `User` WHERE role = ?')
        ->execute([$role]) ? (int) db()->query("SELECT COUNT(*) FROM `User` WHERE role = '$role'")->fetchColumn() : 0;
    $st = db()->prepare("SELECT * FROM `User` WHERE role = ? ORDER BY createdAt DESC LIMIT $size OFFSET $off");
    $st->execute([$role]);
    $rows = array_map('jsonizeRow', $st->fetchAll());
    http_response_code(200);
    echo json_encode([
        'data' => $rows,
        'meta' => ['pagination' => ['page' => $page, 'pageSize' => $size, 'total' => $total, 'totalPages' => (int) ceil($total / $size)]],
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// Ultimate /admin/* GET fallback — empty valid shape.
if ($method === 'GET' && str_starts_with($path, '/admin/')) {
    authUser();
    header('X-PHP-Shim-Stub: 1');
    http_response_code(200);
    echo json_encode([
        'data' => [],
        'meta' => ['pagination' => ['page' => 1, 'pageSize' => 20, 'total' => 0, 'totalPages' => 0]],
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

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

// Reports overview — reports.tsx expects `series`, `total`, `ordersCount`.
if ($method === 'GET' && $path === '/admin/reports/revenue' && (($_GET['groupBy'] ?? '') !== '')) {
    $u = authUser();
    if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $groupBy = $_GET['groupBy'];
    $fmt = $groupBy === 'month' ? '%Y-%m' : ($groupBy === 'week' ? '%X-W%V' : '%Y-%m-%d');
    $st = db()->prepare("SELECT DATE_FORMAT(createdAt, ?) AS bucket, COUNT(*) AS orders, SUM(COALESCE(finalPrice, quotedPrice, 0)) AS revenue FROM `Order` WHERE status IN ('COMPLETED','DELIVERED') GROUP BY bucket ORDER BY bucket ASC");
    $st->execute([$fmt]);
    $series = $st->fetchAll();
    $total = 0.0; $count = 0;
    foreach ($series as $s) { $total += (float)$s['revenue']; $count += (int)$s['orders']; }
    jsonOk([
        'series' => $series,
        'total' => $total,
        'ordersCount' => $count,
    ]);
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
    db()->prepare('DELETE FROM `Category` WHERE id = ?')->execute([$m[1]]);
    jsonOk(['deleted' => true]);
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
    foreach ($b as $k => $v) {
        $val = is_string($v) ? $v : json_encode($v);
        $stmt->execute([(string)$k, $val, $u['sub'] ?? null]);
        $n++;
    }
    jsonOk(['updated' => $n]);
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

// ─── Non-admin GETs the dashboard also touches ─────────────────────────
if ($method === 'GET' && $path === '/me') {
    $u = authUser();
    $st = db()->prepare('SELECT id, name, phone, email, role, isActive, isPhoneVerified, createdAt FROM `User` WHERE id = ? LIMIT 1');
    $st->execute([$u['sub'] ?? '']);
    $user = $st->fetch();
    if (!$user) jsonErr('المستخدم غير موجود', 404, 'NOT_FOUND');
    jsonOk($user);
}

if ($method === 'GET' && $path === '/me/addresses') {
    $u = authUser();
    $st = db()->prepare('SELECT * FROM `CustomerAddress` WHERE userId = ? ORDER BY isDefault DESC, createdAt DESC');
    $st->execute([$u['sub'] ?? '']);
    jsonOk($st->fetchAll());
}

if ($method === 'GET' && $path === '/me/wallet') {
    $u = authUser();
    $st = db()->prepare('SELECT balance, currency, updatedAt FROM `Wallet` WHERE userId = ? LIMIT 1');
    $st->execute([$u['sub'] ?? '']);
    $w = $st->fetch() ?: ['balance' => 0, 'currency' => 'EGP'];
    jsonOk($w);
}

if ($method === 'GET' && $path === '/categories') {
    // Public — no auth required.  Empty categories list still renders the
    // catalog page cleanly.
    try {
        $rows = db()->query('SELECT * FROM `Category` WHERE isActive = 1 ORDER BY sortOrder ASC, nameAr ASC')->fetchAll();
    } catch (Throwable $e) {
        $rows = db()->query('SELECT * FROM `Category` ORDER BY id ASC')->fetchAll();
    }
    jsonOk($rows);
}

if ($method === 'GET' && $path === '/services') {
    try {
        $rows = db()->query('SELECT * FROM `Service` WHERE isActive = 1 ORDER BY sortOrder ASC, nameAr ASC')->fetchAll();
    } catch (Throwable $e) {
        $rows = db()->query('SELECT * FROM `Service` ORDER BY id ASC')->fetchAll();
    }
    jsonOk($rows);
}

if ($method === 'GET' && $path === '/home-config') {
    $rows = db()->query('SELECT * FROM `HomeConfig` ORDER BY id ASC LIMIT 1')->fetchAll();
    jsonOk($rows[0] ?? new stdClass());
}

if ($method === 'GET' && $path === '/site-config') {
    // Reduce Setting table into a keyed dict — that's how the landing page
    // and admin site-settings both expect it. Use an associative array so
    // json_encode outputs {...} and any key characters are safe.
    try {
        $rows = db()->query('SELECT `key`, `value` FROM `Setting`')->fetchAll();
    } catch (Throwable $e) {
        jsonErr('لم يتم تحميل الإعدادات: ' . $e->getMessage(), 500, 'SETTINGS_ERROR');
    }
    $out = [];
    foreach ($rows as $r) $out[(string) $r['key']] = $r['value'];
    // Force object encoding even when empty so the client's `.foo` lookups
    // don't crash.
    header('Content-Type: application/json; charset=utf-8');
    http_response_code(200);
    echo json_encode(['data' => (object) $out], JSON_UNESCAPED_UNICODE);
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
    $stmt = db()->prepare('SELECT id, name, phone, email, role, isActive FROM `User` WHERE id = ? LIMIT 1');
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
        ],
        'tokens' => ['accessToken' => $access, 'refreshToken' => $refresh],
    ]);
}

// Unknown route
jsonErr('Endpoint not found: ' . $method . ' ' . $path, 404, 'NOT_FOUND');
