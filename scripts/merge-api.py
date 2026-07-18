"""
Rebase this repo's api.php changes onto the LIVE server copy.

Why this exists: the production api.php has drifted from git. A deferred-email
system (mailDefer / mailToUser / emailShell + a shutdown flush) was deployed
over SFTP and never committed. Uploading the repo copy would delete it.

So instead of deploying our file, we take the live file as the base and
re-apply our two additions on top:
  1. opt-in pagination for the merchant product endpoints
  2. /admin/offers CRUD (the home slider had no way to be filled)

Both are located by anchor text rather than line number, and every anchor is
asserted to appear exactly once — if the live file shifts under us, this stops
rather than writing the change into the wrong place.
"""

import sys

LIVE = r"C:\Users\MATRIX\AppData\Local\Temp\claude\e--Tamem-Tamem\live-api.php"
OURS = r"E:\Tamem\Tamem\apps\backend\dist-bundle\api.php"
OUT = r"E:\Tamem\Tamem\apps\backend\dist-bundle\api.php"

live = open(LIVE, encoding="utf-8").read()
ours = open(OURS, encoding="utf-8").read()


def block(text: str, start_anchor: str, end_anchor: str) -> str:
    """Extract [start_anchor .. end_anchor) from text, asserting uniqueness."""
    if text.count(start_anchor) != 1:
        sys.exit(f"start anchor not unique ({text.count(start_anchor)}x): {start_anchor[:60]}")
    i = text.index(start_anchor)
    j = text.index(end_anchor, i)
    return text[i:j]


def replace_once(text: str, old: str, new: str, label: str) -> str:
    n = text.count(old)
    if n != 1:
        sys.exit(f"[{label}] expected exactly 1 match, found {n}")
    print(f"  applied: {label}")
    return text.replace(old, new, 1)


# ── 1. merchant products route (pagination) ────────────────────────────────
OLD_PRODUCTS = (
    "if (preg_match('#^/merchants/([^/]+)/products$#', $path, $mm) && $method === 'GET') {\n"
    "    $st = db()->prepare('SELECT * FROM `Product` WHERE merchantId = ? AND isAvailable = 1 "
    "AND isHidden = 0 ORDER BY sortOrder ASC');\n"
    "    $st->execute([$mm[1]]);\n"
    "    jsonOk(array_map('productShape', $st->fetchAll()));\n"
    "}"
)
NEW_PRODUCTS = block(
    ours,
    "if (preg_match('#^/merchants/([^/]+)/products$#', $path, $mm) && $method === 'GET') {",
    "\nif (preg_match('#^/merchants/([^/]+)$#', $path, $mm) && $method === 'GET') {",
).rstrip()

# ── 2. embedded products on the merchant detail ────────────────────────────
OLD_EMBED = (
    "    $ps = db()->prepare('SELECT * FROM `Product` WHERE merchantId = ? ORDER BY sortOrder ASC');\n"
    "    $ps->execute([$mm[1]]);\n"
    "    $m['products'] = array_map('productShape', $ps->fetchAll());\n"
    "    jsonOk($m);"
)
NEW_EMBED = block(
    ours,
    "    // Embedded products are opt-in limited",
    "\n    jsonOk($m);",
).rstrip() + "\n\n    jsonOk($m);"

# ── 3. /admin/offers CRUD ──────────────────────────────────────────────────
OFFERS = block(
    ours,
    "// ── Offers (home slider) ─",
    "// POST /admin/supervisors — insert into Supervisor.",
)
ANCHOR_SUPERVISORS = "// POST /admin/supervisors — insert into Supervisor."

print("merging our changes onto the live file:")
merged = replace_once(live, OLD_PRODUCTS, NEW_PRODUCTS, "merchant products pagination")
merged = replace_once(merged, OLD_EMBED, NEW_EMBED, "merchant detail embed limit")
merged = replace_once(merged, ANCHOR_SUPERVISORS, OFFERS + ANCHOR_SUPERVISORS, "/admin/offers CRUD")

# Sanity: khaled's email system must survive the merge.
for marker in ("function mailDefer", "function mailToUser", "function emailShell"):
    if marker not in merged:
        sys.exit(f"REFUSING TO WRITE — {marker} was lost in the merge")
print("  verified: live-only email system preserved")

open(OUT, "w", encoding="utf-8", newline="").write(merged)
print(f"\nwrote {OUT}  ({len(merged.encode('utf-8')):,} bytes)")
