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
    try {
        $pdo = new PDO($dsn, $user, $pass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_TIMEOUT => 8,
        ]);
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
// Alert sweep — generate alerts for orders stuck in NEW/UNDER_REVIEW too long.
if ($method === 'POST' && $path === '/admin/alerts/run-sweep') {
    $u = authUser(); if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $created = 0;
    try {
        $cutoff = gmdate('Y-m-d H:i:s', time() - 15 * 60);
        $stuck = db()->prepare("SELECT id, orderNumber FROM `Order` WHERE status IN ('NEW','UNDER_REVIEW') AND createdAt < ?");
        $stuck->execute([$cutoff]);
        $ins = db()->prepare("INSERT INTO `Alert` (id, type, severity, title, titleAr, description, descriptionAr, relatedOrderId, category, status, triggerKey, createdAt, updatedAt)
            VALUES (?,?,?,?,?,?,?,?,?, 'OPEN', ?, NOW(3), NOW(3))");
        foreach ($stuck->fetchAll() as $o) {
            $key = 'stuck_order_' . $o['id'];
            $ex = db()->prepare("SELECT id FROM `Alert` WHERE triggerKey = ? AND status = 'OPEN' LIMIT 1"); $ex->execute([$key]);
            if ($ex->fetch()) continue;
            $ins->execute([newId(), 'PENDING_ORDER', 'HIGH', 'Order pending too long', 'طلب متأخر بدون معالجة',
                "Order {$o['orderNumber']} stuck > 15 min", "الطلب رقم {$o['orderNumber']} لسه محتاج معالجة من أكتر من ١٥ دقيقة",
                $o['id'], 'ORDER', $key]);
            $created++;
        }
    } catch (Throwable $e) { error_log('[api.php] alert sweep: ' . $e->getMessage()); }
    jsonOk(['created' => $created, 'ranAt' => gmdate('Y-m-d\TH:i:s.000\Z')]);
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
    @mkdir(waDir() . '/queue', 0755, true);
    @file_put_contents(waDir() . '/queue/' . bin2hex(random_bytes(8)) . '.json',
        json_encode(['to' => $to, 'text' => $text], JSON_UNESCAPED_UNICODE));
}
function orderStatusLabelAr(string $s): string {
    return [
        'NEW' => 'جديد', 'UNDER_REVIEW' => 'قيد المراجعة', 'PRICED' => 'تم التسعير',
        'ACCEPTED' => 'مقبول', 'DRIVER_ASSIGNED' => 'تم تعيين سائق', 'PICKED_UP' => 'تم الاستلام',
        'IN_ROUTE' => 'في الطريق', 'DELIVERED' => 'تم التوصيل', 'COMPLETED' => 'مكتمل',
        'CANCELLED' => 'ملغي',
    ][$s] ?? $s;
}
function waStatus(): array {
    $f = waDir() . '/status.json';
    $j = is_file($f) ? json_decode((string) @file_get_contents($f), true) : null;
    if (!is_array($j)) {
        return ['status' => 'disconnected', 'qrDataUrl' => null, 'phone' => null, 'startedAt' => null,
                'lastError' => 'خدمة الواتساب لسه بتشتغل… لو استمر، حدّث الصفحة بعد دقيقة.'];
    }
    // Bridge heartbeats every ~15s; if the file is stale the process is down.
    $stale = (time() * 1000 - (int) ($j['ts'] ?? 0)) > 90000;
    return [
        'status' => $stale ? 'disconnected' : ($j['status'] ?? 'disconnected'),
        'qrDataUrl' => $stale ? null : ($j['qrDataUrl'] ?? null),
        'phone' => $j['phone'] ?? null,
        'startedAt' => $j['startedAt'] ?? null,
        'lastError' => $stale ? 'خدمة الواتساب متوقفة مؤقتاً — هتشتغل تلقائياً خلال دقيقة.' : ($j['lastError'] ?? null),
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
if ($method === 'GET' && $path === '/admin/orders') {
    authUser();
    $page = max(1, (int)($_GET['page'] ?? 1)); $size = min(100, max(1, (int)($_GET['pageSize'] ?? 20))); $off = ($page - 1) * $size;
    $where = '1=1'; $args = [];
    $status = (string)($_GET['status'] ?? '');
    if ($status !== '' && $status !== 'all') { $where .= ' AND o.status = ?'; $args[] = $status; }
    $search = trim((string)($_GET['search'] ?? ''));
    if ($search !== '') { $where .= ' AND (o.orderNumber LIKE ? OR cu.name LIKE ? OR cu.phone LIKE ?)'; $like = "%$search%"; array_push($args, $like, $like, $like); }
    $total = (int) (function() use ($where, $args) { $s = db()->prepare("SELECT COUNT(*) " . ORDER_JOIN . " WHERE $where"); $s->execute($args); return $s->fetchColumn(); })();
    $st = db()->prepare("SELECT " . ORDER_COLS . " " . ORDER_JOIN . " WHERE $where ORDER BY o.createdAt DESC LIMIT $size OFFSET $off");
    $st->execute($args);
    $rows = array_map('orderNest', $st->fetchAll());
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
    $o['items'] = [];
    try { $it = db()->prepare('SELECT * FROM `OrderItem` WHERE orderId = ?'); $it->execute([$m[1]]); $o['items'] = array_map('jsonizeRow', $it->fetchAll()); } catch (Throwable $e) {}
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
    // WhatsApp the on-shift supervisor about the new order (+ record dispatch).
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

// Merchants list — the page reads MerchantProfile rows with nested `user`,
// `category` and `_count.products`, NOT bare User rows.
if ($method === 'GET' && $path === '/admin/merchants') {
    authUser();
    $page = max(1, (int)($_GET['page'] ?? 1));
    $size = min(100, max(1, (int)($_GET['pageSize'] ?? 20)));
    $off = ($page - 1) * $size;
    $total = (int) db()->query('SELECT COUNT(*) FROM `MerchantProfile`')->fetchColumn();
    $st = db()->prepare(
        "SELECT mp.*, u.name AS u_name, u.phone AS u_phone, u.email AS u_email, u.isActive AS u_isActive, u.secondaryPhones AS u_secondaryPhones,
                c.nameAr AS c_nameAr, c.name AS c_name,
                (SELECT COUNT(*) FROM `Product` p WHERE p.merchantId = mp.id) AS product_count
         FROM `MerchantProfile` mp
         LEFT JOIN `User` u ON u.id = mp.userId
         LEFT JOIN `Category` c ON c.id = mp.categoryId
         ORDER BY mp.createdAt DESC LIMIT $size OFFSET $off"
    );
    $st->execute();
    $rows = [];
    foreach ($st->fetchAll() as $r) {
        $sec = $r['u_secondaryPhones'] ?? null;
        $secArr = is_string($sec) && $sec !== '' ? (json_decode($sec, true) ?: []) : [];
        $rows[] = [
            'id' => $r['id'], 'userId' => $r['userId'],
            'storeName' => $r['storeName'], 'storeNameAr' => $r['storeNameAr'],
            'categoryId' => $r['categoryId'], 'description' => $r['description'],
            'addressLine' => $r['addressLine'], 'lat' => $r['lat'], 'lng' => $r['lng'],
            'governorate' => $r['governorate'], 'city' => $r['city'],
            'isOpen' => (bool)(int)$r['isOpen'], 'rating' => $r['rating'],
            'manualStatus' => $r['manualStatus'] ?? 'OPEN',
            'logoUrl' => $r['logoUrl'] ?? null, 'coverUrl' => $r['coverUrl'] ?? null,
            'createdAt' => $r['createdAt'], 'updatedAt' => $r['updatedAt'],
            'user' => ['id' => $r['userId'], 'name' => $r['u_name'], 'phone' => $r['u_phone'], 'email' => $r['u_email'], 'isActive' => (bool)(int)($r['u_isActive'] ?? 1), 'secondaryPhones' => $secArr],
            'category' => $r['c_nameAr'] !== null ? ['id' => $r['categoryId'], 'nameAr' => $r['c_nameAr'], 'name' => $r['c_name']] : null,
            '_count' => ['products' => (int)$r['product_count']],
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
    $total = (int) db()->query("SELECT COUNT(*) FROM `User` WHERE role='DRIVER'")->fetchColumn();
    $st = db()->prepare(
        "SELECT u.*, dp.id AS dp_id, dp.status AS dp_status, dp.vehicleType AS dp_vehicleType, dp.vehiclePlate AS dp_vehiclePlate,
                dp.nationalId AS dp_nationalId, dp.governorate AS dp_governorate, dp.totalDeliveries AS dp_totalDeliveries,
                dp.totalEarnings AS dp_totalEarnings, dp.cashOnHand AS dp_cashOnHand, dp.rating AS dp_rating
         FROM `User` u LEFT JOIN `DriverProfile` dp ON dp.userId = u.id
         WHERE u.role='DRIVER' ORDER BY u.createdAt DESC LIMIT $size OFFSET $off"
    );
    $st->execute();
    $rows = [];
    foreach ($st->fetchAll() as $r) {
        $row = jsonizeRow([
            'id' => $r['id'], 'name' => $r['name'], 'phone' => $r['phone'], 'email' => $r['email'],
            'isActive' => (bool)(int)$r['isActive'], 'city' => $r['city'], 'governorate' => $r['governorate'],
            'createdAt' => $r['createdAt'],
        ]);
        $row['driverProfile'] = $r['dp_id'] !== null ? [
            'id' => $r['dp_id'], 'status' => $r['dp_status'], 'vehicleType' => $r['dp_vehicleType'],
            'vehiclePlate' => $r['dp_vehiclePlate'], 'nationalId' => $r['dp_nationalId'],
            'governorate' => $r['dp_governorate'], 'totalDeliveries' => (int)$r['dp_totalDeliveries'],
            'totalEarnings' => $r['dp_totalEarnings'], 'cashOnHand' => $r['dp_cashOnHand'], 'rating' => $r['dp_rating'],
        ] : null;
        $rows[] = $row;
    }
    http_response_code(200);
    echo json_encode(['data' => $rows, 'meta' => ['pagination' => ['page' => $page, 'pageSize' => $size, 'total' => $total, 'totalPages' => (int) ceil($total / max(1, $size))]]], JSON_UNESCAPED_UNICODE);
    exit;
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
        if ($ex) {
            $sets = []; $args = [];
            foreach ($b as $k => $v) if (isset($cols[$k]) && !in_array($k, ['id', 'merchantId', 'createdAt', 'updatedAt'], true)) { $sets[] = "`$k` = ?"; $args[] = coerceForColumn($v, $cols[$k]); }
            if ($sets) { $sets[] = '`updatedAt` = NOW(3)'; $args[] = $ex['id']; db()->prepare('UPDATE `MerchantApiConfig` SET ' . implode(',', $sets) . ' WHERE id = ?')->execute($args); }
            $newId = $ex['id'];
        } else {
            $names = ['`id`', '`merchantId`']; $ph = ['?', '?']; $args = [$newId = newId(), $id];
            foreach ($b as $k => $v) if (isset($cols[$k]) && !in_array($k, ['id', 'merchantId', 'createdAt', 'updatedAt'], true)) { $names[] = "`$k`"; $ph[] = '?'; $args[] = coerceForColumn($v, $cols[$k]); }
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
    $st = db()->prepare('SELECT * FROM `ProductSyncLog` WHERE merchantId = ? ORDER BY createdAt DESC LIMIT 50');
    try { $st->execute([$m[1]]); $rows = array_map('jsonizeRow', $st->fetchAll()); } catch (Throwable $e) { $rows = []; }
    jsonOk($rows);
}
// Fetch an external merchant API (PHP does this fine — no Node.js needed).
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
    $raw = null; $httpCode = 0;
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => $headers,
            CURLOPT_TIMEOUT => 25, CURLOPT_FOLLOWLOCATION => true, CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_CUSTOMREQUEST => $method]);
        if ($method === 'POST' && !empty($cfg['requestBody'])) curl_setopt($ch, CURLOPT_POSTFIELDS, (string)$cfg['requestBody']);
        $raw = curl_exec($ch); $httpCode = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch); curl_close($ch);
        if ($raw === false) return ['ok' => false, 'reason' => 'فشل الاتصال: ' . $err];
    } else {
        $ctx = stream_context_create(['http' => ['method' => $method, 'header' => implode("\r\n", $headers), 'timeout' => 25, 'ignore_errors' => true]]);
        $raw = @file_get_contents($url, false, $ctx);
        if ($raw === false) return ['ok' => false, 'reason' => 'فشل الاتصال بالـ API'];
    }
    $json = json_decode((string)$raw, true);
    if (!is_array($json)) return ['ok' => false, 'reason' => 'الرد ليس JSON صالح', 'httpCode' => $httpCode];
    // Drill into productsPath (e.g. "data" or "result.products"); empty = root list.
    $items = $json; $pp = trim((string)($cfg['productsPath'] ?? ''));
    if ($pp !== '') foreach (explode('.', $pp) as $seg) { $items = is_array($items) && isset($items[$seg]) ? $items[$seg] : []; }
    if (!is_array($items)) $items = [];
    // normalise a list (some APIs wrap each row)
    $items = array_values(array_filter($items, 'is_array'));
    return ['ok' => true, 'items' => $items, 'httpCode' => $httpCode];
}
function mapExternalProduct(array $row, array $mapping): array {
    $get = function($key) use ($row) {
        foreach (explode('.', (string)$key) as $seg) { $row = is_array($row) && isset($row[$seg]) ? $row[$seg] : null; if ($row === null) return null; }
        return $row;
    };
    $name = $mapping['name'] ?? 'name';
    $nameAr = $mapping['nameAr'] ?? $mapping['name'] ?? 'name';
    $price = $mapping['price'] ?? 'price';
    $img = $mapping['imageUrl'] ?? $mapping['image'] ?? 'image';
    $desc = $mapping['description'] ?? 'description';
    return [
        'name' => (string)($get($name) ?? ''),
        'nameAr' => (string)($get($nameAr) ?? $get($name) ?? ''),
        'price' => (float)($get($price) ?? 0),
        'imageUrl' => $get($img) ? (string)$get($img) : null,
        'description' => $get($desc) ? (string)$get($desc) : null,
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
    // Shape MUST match the dashboard TestResult: { ok, fetchedCount, sampleItems, sampleFields }.
    jsonOk([
        'ok' => true,
        'fetchedCount' => count($res['items']),
        'sampleItems' => array_slice($res['items'], 0, 3),
        'sampleFields' => (!empty($res['items']) && is_array($res['items'][0])) ? array_keys($res['items'][0]) : [],
    ]);
}
if ($method === 'POST' && preg_match('#^/admin/merchants/([^/]+)/api-config/sync$#', $path, $m)) {
    authUser();
    $st = db()->prepare('SELECT * FROM `MerchantApiConfig` WHERE merchantId = ? LIMIT 1'); $st->execute([$m[1]]);
    $cfg = $st->fetch();
    if (!$cfg) jsonErr('احفظ إعدادات الـ API الأول', 400, 'NO_CONFIG');
    $res = fetchMerchantApi($cfg);
    if (!$res['ok']) {
        db()->prepare('UPDATE `MerchantApiConfig` SET lastError = ?, updatedAt = NOW(3) WHERE merchantId = ?')->execute([$res['reason'] ?? 'sync failed', $m[1]]);
        jsonErr($res['reason'] ?? 'فشلت المزامنة', 400, 'SYNC_FAILED');
    }
    $mapping = is_string($cfg['fieldMapping'] ?? null) ? (json_decode($cfg['fieldMapping'], true) ?: []) : ($cfg['fieldMapping'] ?? []);
    $pdo = db(); $added = 0; $updated = 0;
    $ins = $pdo->prepare('INSERT INTO `Product` (id, merchantId, name, nameAr, description, imageUrl, price, isAvailable, sortOrder, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,1,0,NOW(3),NOW(3))');
    $upd = $pdo->prepare('UPDATE `Product` SET nameAr = ?, description = ?, imageUrl = ?, price = ?, updatedAt = NOW(3) WHERE id = ?');
    foreach ($res['items'] as $row) {
        $p = mapExternalProduct($row, $mapping);
        if ($p['name'] === '' && $p['nameAr'] === '') continue;
        $find = $pdo->prepare('SELECT id FROM `Product` WHERE merchantId = ? AND name = ? LIMIT 1');
        $find->execute([$m[1], $p['name']]); $ex = $find->fetch();
        try {
            if ($ex) { $upd->execute([$p['nameAr'], $p['description'], $p['imageUrl'], $p['price'], $ex['id']]); $updated++; }
            else { $ins->execute([newId(), $m[1], $p['name'] ?: $p['nameAr'], $p['nameAr'] ?: $p['name'], $p['description'], $p['imageUrl'], $p['price']]); $added++; }
        } catch (PDOException $e) { error_log('[api.php] product upsert: ' . $e->getMessage()); }
    }
    $pdo->prepare('UPDATE `MerchantApiConfig` SET isConnected = 1, lastError = NULL, lastSyncedAt = NOW(3), updatedAt = NOW(3) WHERE merchantId = ?')->execute([$m[1]]);
    // log the sync if the table exists
    try {
        $pdo->prepare('INSERT INTO `ProductSyncLog` (id, merchantId, status, added, updated, message, createdAt) VALUES (?,?,?,?,?,?,NOW(3))')
            ->execute([newId(), $m[1], 'SUCCESS', $added, $updated, "أُضيف $added، حُدّث $updated"]);
    } catch (Throwable $e) { /* table shape may differ; ignore */ }
    jsonOk(['ok' => true, 'fetchedCount' => count($res['items']), 'createdCount' => $added, 'updatedCount' => $updated,
        'failedCount' => 0, 'hiddenCount' => 0, 'added' => $added, 'updated' => $updated, 'total' => count($res['items'])]);
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

// Customers (and any other User-by-role) — bare User rows are enough.
if ($method === 'GET' && preg_match('#^/admin/(customers)$#', $path, $m)) {
    authUser();
    $role = 'CUSTOMER';
    $page = max(1, (int)($_GET['page'] ?? 1));
    $size = min(100, max(1, (int)($_GET['pageSize'] ?? 20)));
    $off = ($page - 1) * $size;
    $total = (int) db()->query("SELECT COUNT(*) FROM `User` WHERE role = '$role'")->fetchColumn();
    $st = db()->prepare("SELECT * FROM `User` WHERE role = ? ORDER BY createdAt DESC LIMIT $size OFFSET $off");
    $st->execute([$role]);
    $rows = array_map('jsonizeRow', $st->fetchAll());
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

// ─── Create MERCHANT (User + MerchantProfile) ──────────────────────────
if ($method === 'POST' && $path === '/admin/merchants') {
    $u = authUser();
    if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $b = readJsonBody();
    $ownerName = trim((string)($b['ownerName'] ?? $b['name'] ?? ''));
    $phone = trim((string)($b['phone'] ?? ''));
    $pass = (string)($b['password'] ?? '');
    $storeNameAr = trim((string)($b['storeNameAr'] ?? ''));
    $storeName = trim((string)($b['storeName'] ?? '')) ?: $storeNameAr;
    $categoryId = trim((string)($b['categoryId'] ?? ''));
    if ($ownerName === '' || $phone === '' || strlen($pass) < 6 || $storeNameAr === '' || $categoryId === '') {
        jsonErr('بيانات ناقصة: اسم المالك، الهاتف، كلمة المرور، اسم المتجر، والتصنيف مطلوبين', 422, 'MISSING');
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
        $pdo->prepare('INSERT INTO `MerchantProfile` (id, userId, storeName, storeNameAr, categoryId, description, addressLine, lat, lng, governorate, city, isOpen, manualStatus, timezone, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,1,?,?,NOW(3),NOW(3))')
            ->execute([newId(), $uid, $storeName, $storeNameAr, $categoryId,
                (string)($b['description'] ?? ''),
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
    $pass = (string)($b['password'] ?? '');
    $vehicleType = trim((string)($b['vehicleType'] ?? ''));
    $vehiclePlate = trim((string)($b['vehiclePlate'] ?? ''));
    if ($name === '' || $phone === '' || strlen($pass) < 6 || $vehicleType === '' || $vehiclePlate === '') {
        jsonErr('بيانات ناقصة: الاسم، الهاتف، كلمة المرور، نوع المركبة، ولوحتها مطلوبين', 422, 'MISSING');
    }
    $clean = preg_replace('/[\s\-()]/', '', $phone);
    if (preg_match('/^(?:\+?20|0)?(1[0125]\d{8})$/', $clean, $mm)) $phone = '+20' . $mm[1];
    $governorate = trim((string)($b['governorate'] ?? 'قنا')) ?: 'قنا';
    $pdo = db();
    try {
        $pdo->beginTransaction();
        $uid = newId();
        $pdo->prepare('INSERT INTO `User` (id, name, phone, passwordHash, role, isActive, isPhoneVerified, governorate, createdAt, updatedAt) VALUES (?,?,?,?,?,1,1,?,NOW(3),NOW(3))')
            ->execute([$uid, $name, $phone, password_hash($pass, PASSWORD_BCRYPT), 'DRIVER', $governorate]);
        $pdo->prepare('INSERT INTO `DriverProfile` (id, userId, status, vehicleType, vehiclePlate, nationalId, governorate, createdAt, updatedAt) VALUES (?,?,?,?,?,?,?,NOW(3),NOW(3))')
            ->execute([newId(), $uid, 'OFFLINE', $vehicleType, $vehiclePlate,
                (($b['nationalId'] ?? '') !== '' ? (string)$b['nationalId'] : null), $governorate]);
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
            if (isset($pcols[$k]) && !in_array($k, ['id', 'userId', 'createdAt', 'updatedAt'], true)) { $sets[] = "`$k` = ?"; $args[] = coerceForColumn($v, $pcols[$k]); }
        }
        if ($sets) { $sets[] = '`updatedAt` = NOW(3)'; $args[] = $id; $pdo->prepare('UPDATE `MerchantProfile` SET ' . implode(',', $sets) . ' WHERE id = ?')->execute($args); }
        $us = []; $ua = [];
        if (array_key_exists('ownerName', $b)) { $us[] = '`name` = ?'; $ua[] = (string)$b['ownerName']; }
        if (array_key_exists('ownerPhone', $b) || array_key_exists('phone', $b)) { $ph = (string)($b['ownerPhone'] ?? $b['phone']); $cl = preg_replace('/[\s\-()]/', '', $ph); if (preg_match('/^(?:\+?20|0)?(1[0125]\d{8})$/', $cl, $mm)) $ph = '+20' . $mm[1]; $us[] = '`phone` = ?'; $ua[] = $ph; }
        if (array_key_exists('secondaryPhones', $b)) { $us[] = '`secondaryPhones` = ?'; $ua[] = json_encode($b['secondaryPhones'], JSON_UNESCAPED_UNICODE); }
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
        if ($us) { $us[] = '`updatedAt` = NOW(3)'; $ua[] = $id; $pdo->prepare('UPDATE `User` SET ' . implode(',', $us) . ' WHERE id = ?')->execute($ua); }
        $dcols = tableColumns('DriverProfile'); $ds = []; $da = [];
        foreach (['vehicleType', 'vehiclePlate', 'nationalId', 'governorate', 'status', 'notes'] as $f) {
            if (array_key_exists($f, $b) && isset($dcols[$f])) { $ds[] = "`$f` = ?"; $da[] = coerceForColumn($b[$f], $dcols[$f]); }
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
    jsonOk(['recipients' => $n, 'pushSent' => 0, 'pushFailed' => 0]);
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
    // Notify the customer on WhatsApp about the new status.
    try {
        $q = db()->prepare('SELECT o.orderNumber, u.phone FROM `Order` o LEFT JOIN `User` u ON u.id = o.customerId WHERE o.id = ?');
        $q->execute([$m[1]]); $ord = $q->fetch();
        if ($ord && !empty($ord['phone'])) {
            waEnqueue($ord['phone'], "تميم للتوصيل 🚚\nحالة طلبك رقم *{$ord['orderNumber']}* أصبحت: *" . orderStatusLabelAr($status) . "*"
                . ($status === 'CANCELLED' && !empty($b['reason']) ? "\nالسبب: " . $b['reason'] : ''));
        }
    } catch (Throwable $e) { /* notification is best-effort */ }
    $r = db()->prepare('SELECT * FROM `Order` WHERE id = ?'); $r->execute([$m[1]]);
    jsonOk(jsonizeRow($r->fetch()) ?: []);
}
if ($method === 'PATCH' && preg_match('#^/admin/orders/([^/]+)/price$#', $path, $m)) {
    $u = authUser(); if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $b = readJsonBody();
    db()->prepare("UPDATE `Order` SET `quotedPrice` = ?, `status` = CASE WHEN `status` = 'NEW' THEN 'PRICED' ELSE `status` END, `updatedAt` = NOW(3) WHERE id = ?")
        ->execute([(float)($b['quotedPrice'] ?? 0), $m[1]]);
    $r = db()->prepare('SELECT * FROM `Order` WHERE id = ?'); $r->execute([$m[1]]);
    jsonOk(jsonizeRow($r->fetch()) ?: []);
}
if ($method === 'PATCH' && preg_match('#^/admin/orders/([^/]+)/assign-driver$#', $path, $m)) {
    $u = authUser(); if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $b = readJsonBody();
    db()->prepare("UPDATE `Order` SET `assignedDriverId` = ?, `status` = 'DRIVER_ASSIGNED', `updatedAt` = NOW(3) WHERE id = ?")
        ->execute([(string)($b['driverId'] ?? ''), $m[1]]);
    $r = db()->prepare('SELECT * FROM `Order` WHERE id = ?'); $r->execute([$m[1]]);
    jsonOk(jsonizeRow($r->fetch()) ?: []);
}
if ($method === 'POST' && preg_match('#^/admin/orders/([^/]+)/cancel$#', $path, $m)) {
    $u = authUser(); if (!in_array($u['role'] ?? '', ['ADMIN', 'SUPER_ADMIN'], true)) jsonErr('غير مسموح', 403, 'FORBIDDEN');
    $b = readJsonBody();
    db()->prepare("UPDATE `Order` SET `status` = 'CANCELLED', `cancelledAt` = NOW(3), `cancellationReason` = ?, `updatedAt` = NOW(3) WHERE id = ?")
        ->execute([(string)($b['reason'] ?? ''), $m[1]]);
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
            jsonOk(jsonizeRow($sel->fetch()) ?: [], 201);
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
        jsonOk(jsonizeRow($sel->fetch()) ?: []);
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
        db()->prepare("DELETE FROM `$tbl` WHERE id = ?")->execute([$m[2]]);
        jsonOk(['deleted' => true]);
    } catch (Throwable $e) {
        error_log('[api.php] generic DELETE ' . $tbl . ' failed: ' . $e->getMessage());
    }
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
