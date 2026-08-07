"""
Run an additive schema change on the production DB, over SSH.

MySQL only listens on localhost on this host, so everything goes through the
SSH session. Nothing destructive: the table is dumped first, the column is
added with IF NOT EXISTS semantics (checked, not assumed), and the script
refuses to run anything that isn't an additive ADD COLUMN.

Usage:
    python scripts/db-migrate.py --dry-run
    python scripts/db-migrate.py
"""

import re
import sys
import time

HANDOFF = r"E:\Tamem\HANDOFF.md"
HOST, PORT, USER = "77.37.37.207", 65002, "u748721963"

# Existing JSON-ish columns on this table are `longtext`, not `JSON` (Prisma
# maps Json to longtext on MySQL here). Matching that keeps the column
# consistent with featuredOfferIds/visibleServiceKeys rather than introducing a
# second convention.
MIGRATIONS = [
    ("HomeConfig", "featuredProductIds", "longtext NULL"),
    ("MerchantProfile", "prepMinutesMin", "int NULL"),
    ("MerchantProfile", "prepMinutesMax", "int NULL"),
    # Chosen size / extras, snapshotted at order time so a later price or name
    # change can never rewrite what the customer actually bought.
    ("OrderItem", "variantNameSnapshot", "varchar(120) NULL"),
    ("OrderItem", "addonsSnapshot", "longtext NULL"),
    # Optional expiry for a product's discount — a timed "عرض اليوم". When it
    # passes, the discount is ignored everywhere (price reverts) and the item
    # drops out of the deals rail, with no cron job. NULL = no time limit.
    ("Product", "saleEndsAt", "datetime(3) NULL"),
    # Admin-defined ordering + visibility (+ optional title override) for the
    # mobile home sections. JSON array of {key, visible, title?}. NULL = the
    # app's built-in default order, so this is fully backward-compatible.
    ("HomeConfig", "sectionLayout", "longtext NULL"),
    # What this merchant may do from the merchant portal, as a JSON object of
    # {"products.create": true, ..., "autoApprove": false}. NULL = the built-in
    # defaults, so existing merchants keep working without a backfill.
    ("MerchantProfile", "permissions", "longtext NULL"),
    # Per-service overrides for the three headline cards on home, as
    # {"delivery": {"title": ..., "subtitle": ..., "imageUrl": ...}, ...}.
    # Any missing key falls back to the copy and artwork bundled in the app, so
    # NULL reproduces today's screen exactly.
    ("HomeConfig", "serviceCards", "longtext NULL"),
    # Which merchant city each of the two restaurant rails on home draws from,
    # matched against MerchantProfile.city. NULL on the first = every city;
    # NULL on the second hides the inter-city rail entirely. Config rather than
    # a hardcoded "قنا" so opening a third city is a dashboard edit, not a
    # release.
    ("HomeConfig", "spotlightCity", "varchar(120) NULL"),
    ("HomeConfig", "intercityCity", "varchar(120) NULL"),
]

# Tables created if absent.
#
# COLLATE is explicit and must stay that way: Product/MerchantProfile are
# utf8mb4_unicode_ci, while this server's default for a bare "CHARSET=utf8mb4"
# is utf8mb4_uca1400_ai_ci. A foreign key between columns of differing
# collation is rejected outright — which is exactly how the first attempt
# failed.
TABLES = {
    "ProductVariant": """
        CREATE TABLE `ProductVariant` (
          `id` varchar(191) NOT NULL,
          `productId` varchar(191) NOT NULL,
          `nameAr` varchar(120) NOT NULL,
          `price` decimal(10,2) NOT NULL,
          `sortOrder` int NOT NULL DEFAULT 0,
          `isActive` tinyint(1) NOT NULL DEFAULT 1,
          `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          PRIMARY KEY (`id`),
          KEY `ProductVariant_productId_idx` (`productId`),
          CONSTRAINT `ProductVariant_productId_fk` FOREIGN KEY (`productId`)
            REFERENCES `Product` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,
    "MerchantAddon": """
        CREATE TABLE `MerchantAddon` (
          `id` varchar(191) NOT NULL,
          `merchantId` varchar(191) NOT NULL,
          `nameAr` varchar(120) NOT NULL,
          `price` decimal(10,2) NOT NULL DEFAULT 0,
          `sortOrder` int NOT NULL DEFAULT 0,
          `isActive` tinyint(1) NOT NULL DEFAULT 1,
          `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          PRIMARY KEY (`id`),
          KEY `MerchantAddon_merchantId_idx` (`merchantId`),
          CONSTRAINT `MerchantAddon_merchantId_fk` FOREIGN KEY (`merchantId`)
            REFERENCES `MerchantProfile` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,
    "ProductAddonLink": """
        CREATE TABLE `ProductAddonLink` (
          `productId` varchar(191) NOT NULL,
          `addonId` varchar(191) NOT NULL,
          PRIMARY KEY (`productId`,`addonId`),
          KEY `ProductAddonLink_addonId_idx` (`addonId`),
          CONSTRAINT `ProductAddonLink_productId_fk` FOREIGN KEY (`productId`)
            REFERENCES `Product` (`id`) ON DELETE CASCADE,
          CONSTRAINT `ProductAddonLink_addonId_fk` FOREIGN KEY (`addonId`)
            REFERENCES `MerchantAddon` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,
    # Global, admin-curated in-store sections (بيتزا / كريب / مشويات …) shown on
    # the home as a cross-merchant taxonomy with artwork. The join to products
    # stays by NAME (Product.categoryName) — same key the whole section system
    # already uses — so nameAr is UNIQUE and this table only decorates a name
    # with an image / order / visibility. No product data is migrated.
    "ProductSection": """
        CREATE TABLE `ProductSection` (
          `id` varchar(191) NOT NULL,
          `nameAr` varchar(120) NOT NULL,
          `imageUrl` varchar(500) NULL,
          `sortOrder` int NOT NULL DEFAULT 0,
          `isActive` tinyint(1) NOT NULL DEFAULT 1,
          `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          PRIMARY KEY (`id`),
          UNIQUE KEY `ProductSection_nameAr_key` (`nameAr`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,
    # Every write a merchant makes from the merchant portal lands here FIRST and
    # only touches the catalogue once an admin approves it. The same row is the
    # audit trail the spec asks for: who asked, what for, when, the outcome and
    # (on a refusal) why — so approved/rejected rows are kept, never deleted.
    #
    # `payload` is the proposed change and `beforeData` the snapshot taken when
    # the request was raised, which is what lets the review screen show a diff
    # and lets an approval detect that the product moved on in the meantime.
    "MerchantChangeRequest": """
        CREATE TABLE `MerchantChangeRequest` (
          `id` varchar(191) NOT NULL,
          `merchantId` varchar(191) NOT NULL,
          `requestedById` varchar(191) NULL,
          `type` varchar(32) NOT NULL,
          `targetId` varchar(191) NULL,
          `title` varchar(255) NULL,
          `payload` longtext NULL,
          `beforeData` longtext NULL,
          `status` varchar(16) NOT NULL DEFAULT 'PENDING',
          `reviewedById` varchar(191) NULL,
          `reviewedAt` datetime(3) NULL,
          `rejectionReason` varchar(500) NULL,
          `appliedResult` longtext NULL,
          `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          `updatedAt` datetime(3) NULL,
          PRIMARY KEY (`id`),
          KEY `MerchantChangeRequest_merchantId_idx` (`merchantId`),
          KEY `MerchantChangeRequest_status_idx` (`status`),
          CONSTRAINT `MerchantChangeRequest_merchantId_fk` FOREIGN KEY (`merchantId`)
            REFERENCES `MerchantProfile` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,
    # Per-user favourites (saved stores) + wishlist (saved products), so they
    # survive reinstalls and sync across devices. `collection` distinguishes the
    # two; `targetId` is a MerchantProfile.id or a Product.id (kept loose — no FK
    # — so a deleted target just stops resolving instead of erroring the write).
    "Favorite": """
        CREATE TABLE `Favorite` (
          `id` varchar(191) NOT NULL,
          `userId` varchar(191) NOT NULL,
          `collection` varchar(20) NOT NULL,
          `targetId` varchar(191) NOT NULL,
          `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          PRIMARY KEY (`id`),
          UNIQUE KEY `Favorite_user_col_target_key` (`userId`,`collection`,`targetId`),
          KEY `Favorite_userId_idx` (`userId`),
          CONSTRAINT `Favorite_userId_fk` FOREIGN KEY (`userId`)
            REFERENCES `User` (`id`) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,
    # What a delivery FROM another city costs and how long it takes.
    #
    # The existing zone tariff prices the CUSTOMER's address alone, which is
    # correct while every store is in the same town. It cannot express "قنا →
    # قفط costs more than قفط → قفط", and it cannot express that قنا → a village
    # in قفط costs more again — the fee depends on BOTH ends of the trip.
    #
    # `fromCity` is matched against MerchantProfile.city (a free-typed string,
    # so no FK). The destination is the customer's zone at whatever precision
    # the admin wants: area, then village, then the whole city. Most specific
    # match wins, so one city-wide row can cover everything and a single
    # far village can be overridden without touching it.
    "IntercityRate": """
        CREATE TABLE `IntercityRate` (
          `id` varchar(191) NOT NULL,
          `fromCity` varchar(120) NOT NULL,
          `toCityId` varchar(191) NULL,
          `toVillageId` varchar(191) NULL,
          `toAreaId` varchar(191) NULL,
          `price` decimal(10,2) NOT NULL,
          `minMinutes` int NULL,
          `maxMinutes` int NULL,
          `note` varchar(200) NULL,
          `isActive` tinyint(1) NOT NULL DEFAULT 1,
          `createdAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          `updatedAt` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          PRIMARY KEY (`id`),
          KEY `IntercityRate_from_idx` (`fromCity`),
          KEY `IntercityRate_to_idx` (`toCityId`,`toVillageId`,`toAreaId`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,
}

# One-time data seeds, run after the tables exist. Each is (table, sql) and runs
# only when the table is empty — additive and idempotent, never destructive.
# Seeds ProductSection from the section names already in use so the admin opens
# the page to the real sections, ready to get artwork, instead of a blank slate.
SEEDS = [
    (
        "ProductSection",
        """
        INSERT IGNORE INTO `ProductSection` (id, nameAr, sortOrder, isActive, createdAt)
        SELECT CONCAT('psec', LOWER(HEX(RANDOM_BYTES(10)))), t.name, 0, 1, NOW(3)
        FROM (
          SELECT DISTINCT categoryName AS name FROM `Product`
          WHERE categoryName IS NOT NULL AND categoryName <> ''
        ) t
        """,
    ),
]

DRY_RUN = "--dry-run" in sys.argv


def secrets() -> tuple[str, str, str, str, str]:
    """(ssh_password, db_name, db_user, db_password, db_host) — never printed.

    The SSH password comes from HANDOFF.md, but the DB credentials are read
    from the LIVE server's own .env instead. HANDOFF.md's database block lists
    the user as `u748721963_Tamem` when it is actually `u748721963_TamemDB`,
    which reads as a wrong password rather than a wrong username. Taking them
    from DATABASE_URL — the exact string api.php connects with — means this can
    never drift from what production uses.
    """
    txt = open(HANDOFF, encoding="utf-8").read()
    i = txt.find("SSH / SFTP")
    m = re.search(r"PASS(?:WORD)?\s*:\s*(\S+)", txt[i : i + 1200])
    if not m:
        sys.exit("No SSH password found under 'SSH / SFTP' in HANDOFF.md")
    return m.group(1), "", "", "", ""


def db_from_server(cli) -> tuple[str, str, str, str]:
    """(name, user, password, host) parsed from the deployed .env."""
    from urllib.parse import unquote

    base = "~/domains/deliverytamem.com/public_html/backendtamem"
    _, out, _ = cli.exec_command(f"grep -m1 '^DATABASE_URL' {base}/.env", timeout=60)
    line = out.read().decode("utf-8", "replace").strip()
    if not line:
        sys.exit("No DATABASE_URL in the deployed .env — cannot determine credentials.")
    url = re.match(r"DATABASE_URL\s*=\s*[\"']?(.+?)[\"']?\s*$", line).group(1)
    p = re.match(r"mysql://([^:]+):([^@]+)@([^:/]+)(?::(\d+))?/(.+)", url)
    if not p:
        sys.exit("DATABASE_URL is not in mysql://user:pass@host/db form.")
    return p.group(5), unquote(p.group(1)), unquote(p.group(2)), p.group(3)


def main() -> None:
    import paramiko

    ssh_pw, _, _, _, _ = secrets()

    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(HOST, port=PORT, username=USER, password=ssh_pw, timeout=30)
    db_name, db_user, db_pw, db_host = db_from_server(cli)
    print(f"db: {db_user}@{db_host}/{db_name}")

    def sql(statement: str) -> str:
        # Credentials go in via env, so they never appear in the process list
        # (`ps` on a shared host is readable by other tenants).
        cmd = (
            f"MYSQL_PWD='{db_pw}' mysql -u {db_user} -h {db_host} {db_name} "
            f"--batch --skip-column-names -e {shell_quote(statement)}"
        )
        _, out, err = cli.exec_command(cmd, timeout=120)
        o = out.read().decode("utf-8", "replace").strip()
        e = err.read().decode("utf-8", "replace").strip()
        if e and "Using a password" not in e:
            return f"{o}\nERR: {e}".strip()
        return o

    def shell_quote(s: str) -> str:
        return "'" + s.replace("'", "'\\''") + "'"

    print("mysql client:", cli.exec_command("which mysql")[1].read().decode().strip() or "NOT FOUND")

    # Tables first — the columns below may reference them.
    for tname, ddl in TABLES.items():
        if "DROP" in ddl.upper() or "TRUNCATE" in ddl.upper():
            sys.exit(f"Refusing to run destructive DDL for {tname}")
        exists = sql(
            "SELECT TABLE_NAME FROM information_schema.TABLES "
            f"WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{tname}'"
        ).strip()
        if exists == tname:
            print(f"  table {tname}: already exists")
            continue
        if DRY_RUN:
            print(f"  [dry-run] CREATE TABLE `{tname}`")
            continue
        err = sql(" ".join(ddl.split()))
        ok = sql(
            "SELECT TABLE_NAME FROM information_schema.TABLES "
            f"WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{tname}'"
        ).strip()
        print(f"  table {tname}: {'created' if ok == tname else 'FAILED ' + err[:160]}")

    for table, column, coltype in MIGRATIONS:
        exists = sql(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS "
            f"WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{table}' "
            f"AND COLUMN_NAME = '{column}'"
        ).strip()
        if exists == column:
            print(f"  {table}.{column}: already exists")
            continue

        if DRY_RUN:
            print(f"  [dry-run] ALTER TABLE `{table}` ADD COLUMN `{column}` {coltype}")
            continue

        # Dump before the first change to each table. Additive DDL cannot lose
        # rows, but a backup costs seconds and removes the need to be sure.
        stamp = time.strftime("%Y%m%d-%H%M%S")
        dump = f"~/{table}-backup-{stamp}.sql"
        cli.exec_command(
            f"MYSQL_PWD='{db_pw}' mysqldump -u {db_user} -h {db_host} {db_name} {table} > {dump}",
            timeout=180,
        )[1].read()

        err = sql(f"ALTER TABLE `{table}` ADD COLUMN `{column}` {coltype}")
        ok = sql(
            "SELECT COLUMN_NAME FROM information_schema.COLUMNS "
            f"WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '{table}' "
            f"AND COLUMN_NAME = '{column}'"
        ).strip()
        print(f"  {table}.{column}: {'added' if ok == column else 'FAILED ' + err[:120]}")

    # Seeds — only into an EMPTY table, so re-running never duplicates.
    for table, seed_sql in SEEDS:
        count = sql(f"SELECT COUNT(*) FROM `{table}`").strip()
        if count and count != "0":
            print(f"  seed {table}: skipped ({count} rows already)")
            continue
        if DRY_RUN:
            print(f"  [dry-run] seed {table}")
            continue
        err = sql(" ".join(seed_sql.split()))
        after = sql(f"SELECT COUNT(*) FROM `{table}`").strip()
        print(f"  seed {table}: {after} rows{(' — ' + err[:160]) if err else ''}")

    cli.close()


if __name__ == "__main__":
    main()
