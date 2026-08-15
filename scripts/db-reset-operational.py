"""
Clear operational data from the LIVE database, ahead of going live for real.

Wipes the transactional history — orders and everything hanging off them,
admin alerts, customer notifications, coupons — while leaving the catalogue
(products, merchants, zones, tariffs), the accounts, and the settings alone.

    python scripts/db-reset-operational.py                      # dry run
    python scripts/db-reset-operational.py --before 2026-08-14  # keep newer orders
    python scripts/db-reset-operational.py --confirm            # actually delete

NOTHING IS DELETED WITHOUT --confirm. The dry run prints the exact row counts
each statement would remove, which is the number to check before agreeing to it.

A mysqldump of every affected table is taken FIRST, every time, even on a run
that then fails — it lands in ~/db-backups on the server (mode 700, outside
every docroot) and is downloaded next to this checkout under `backups/`. There
is no undo for a DELETE; the dump is the undo.

Scoping:
  --before DATE   Only delete orders created before DATE. Orders on or after it
                  survive, with their items, legs, history and reviews. Use it
                  when real trading has already started: the live database had
                  15 open orders worth 2,615 EGP from real customers on the day
                  this script was written, five of them already with a driver.
  --keep-coupons  Leave the Coupon table alone.
  --keep-notifications
                  Leave customer notifications alone. Off by default because a
                  notification about a deleted order opens a tracking screen
                  for an order that no longer exists.

Denormalised counters that are derived from orders (driver totals, merchant
ratings) are reset in the same transaction — otherwise the dashboard keeps
reporting deliveries and ratings that have no rows behind them any more.
"""

import argparse
import posixpath
import re
import sys
import time
from urllib.parse import unquote

HANDOFF = r"E:\Tamem\HANDOFF.md"
HOST, PORT, USER = "77.37.37.207", 65002, "u748721963"
REMOTE_ENV = "~/domains/deliverytamem.com/public_html/backendtamem/.env"
BACKUP_DIR = "$HOME/db-backups"
LOCAL_BACKUP_DIR = r"E:\Tamem\backups"

# Everything the reset touches, dumped before a single row is removed. Children
# of `Order` are listed even though they CASCADE — a restore needs their rows.
AFFECTED_TABLES = [
    "Order",
    "OrderItem",
    "OrderLeg",
    "OrderReview",
    "OrderStatusHistory",
    "OrderDeliveryPoint",
    "OrderPickupPoint",
    "Payment",
    "SupervisorOrderDispatch",
    "CouponRedemption",
    "Coupon",
    "Alert",
    "Notification",
    "DriverSettlement",
    "DriverProfile",
    "MerchantProfile",
]


def ssh_password() -> str:
    txt = open(HANDOFF, encoding="utf-8").read()
    i = txt.find("SSH / SFTP")
    m = re.search(r"PASS(?:WORD)?\s*:\s*(\S+)", txt[i : i + 1200])
    if not m:
        sys.exit("No SSH password found under 'SSH / SFTP' in HANDOFF.md")
    return m.group(1)


def db_from_server(cli) -> tuple[str, str, str, str]:
    _, out, _ = cli.exec_command(f"grep -m1 '^DATABASE_URL' {REMOTE_ENV}", timeout=60)
    line = out.read().decode("utf-8", "replace").strip()
    if not line:
        sys.exit("No DATABASE_URL in the deployed .env.")
    url = re.match(r"DATABASE_URL\s*=\s*[\"']?(.+?)[\"']?\s*$", line).group(1)
    p = re.match(r"mysql://([^:]+):([^@]+)@([^:/]+)(?::(\d+))?/(.+)", url)
    if not p:
        sys.exit("DATABASE_URL is not in mysql://user:pass@host/db form.")
    return p.group(5), unquote(p.group(1)), unquote(p.group(2)), p.group(3)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--confirm", action="store_true", help="actually delete (default: dry run)")
    ap.add_argument("--before", metavar="YYYY-MM-DD", help="only delete orders created before this date")
    ap.add_argument("--keep-coupons", action="store_true")
    ap.add_argument("--keep-notifications", action="store_true")
    args = ap.parse_args()

    if args.before and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", args.before):
        sys.exit("--before wants YYYY-MM-DD")

    # `createdAt` is datetime(3); comparing against a bare date is midnight, so
    # "before 2026-08-14" keeps everything from 00:00 on the 14th onwards.
    order_where = f"createdAt < '{args.before} 00:00:00'" if args.before else "1=1"

    import paramiko

    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(HOST, port=PORT, username=USER, password=ssh_password(), timeout=30)
    db_name, db_user, db_pw, db_host = db_from_server(cli)

    def sql(statement: str, quiet: bool = False) -> str:
        # Fed through base64 on stdin rather than `-e "..."`. Table names here
        # are backtick-quoted (`Order` is a reserved word), and a backtick
        # inside a double-quoted shell argument is command substitution: the
        # first attempt at this ran `Order` as a program and sent MySQL a query
        # with the table name missing. Encoding sidesteps shell quoting, and
        # UTF-8 in the data survives it too.
        import base64

        b64 = base64.b64encode(statement.encode("utf-8")).decode("ascii")
        cmd = (
            f"echo {b64} | base64 -d | MYSQL_PWD='{db_pw}' "
            f"mysql -u {db_user} -h {db_host} {db_name} --default-character-set=utf8mb4 -N -B"
        )
        _, out, err = cli.exec_command(cmd, timeout=600)
        o = out.read().decode("utf-8", "replace").strip()
        e = err.read().decode("utf-8", "replace").strip()
        e = "\n".join(l for l in e.splitlines() if "Using a password" not in l)
        if e and not quiet:
            print("  ! mysql:", e[:400])
        return o

    def count(table: str, where: str = "1=1") -> int:
        v = sql(f"SELECT COUNT(*) FROM `{table}` WHERE {where}")
        return int(v) if v.isdigit() else -1

    # ── 1. What is about to happen ──────────────────────────────────────────
    print(f"database: {db_name} @ {db_host}")
    print(f"scope:    {'orders created before ' + args.before if args.before else 'ALL orders'}")
    print()

    orders_hit = count("Order", order_where)
    orders_keep = count("Order", f"NOT ({order_where})")
    plan: list[tuple[str, str, int]] = []

    if args.before:
        # Children do not all carry a date of their own, so they are scoped
        # through their parent rather than by their own createdAt.
        sub = f"SELECT id FROM `Order` WHERE {order_where}"
        alert_where = f"relatedOrderId IS NULL OR relatedOrderId IN ({sub})"
        plan.append(("Alert", alert_where, count("Alert", alert_where)))
        if not args.keep_notifications:
            plan.append(("Notification", "1=1", count("Notification")))
        plan.append(("Order", order_where, orders_hit))
    else:
        plan.append(("Alert", "1=1", count("Alert")))
        if not args.keep_notifications:
            plan.append(("Notification", "1=1", count("Notification")))
        plan.append(("Order", "1=1", orders_hit))

    # Settlements summarise orders that are about to stop existing, so they go
    # with them. Matched on their own `createdAt` rather than by joining back
    # to Order: `DriverSettlement.driverId` was created with a different
    # collation from `Order.assignedDriverId` (utf8mb4_uca1400_ai_ci against
    # utf8mb4_unicode_ci), and comparing them is an "Illegal mix of collations"
    # error rather than a match.
    settle_where = order_where if args.before else "1=1"
    plan.append(("DriverSettlement", settle_where, count("DriverSettlement", settle_where)))

    if not args.keep_coupons:
        plan.append(("Coupon", "1=1", count("Coupon")))

    print("  will delete:")
    for table, _, n in plan:
        print(f"    {table:<24} {n:>6} rows")
    print()
    print("  cascades automatically with Order:")
    for t in ("OrderItem", "OrderLeg", "OrderReview", "OrderStatusHistory",
              "OrderDeliveryPoint", "OrderPickupPoint", "Payment",
              "SupervisorOrderDispatch", "CouponRedemption"):
        scoped = f"orderId IN (SELECT id FROM `Order` WHERE {order_where})" if args.before else "1=1"
        print(f"    {t:<24} {count(t, scoped):>6} rows")
    print()
    print(f"  orders kept: {orders_keep}")
    print("  untouched:   Product, MerchantProfile rows, User, City/Village/Area,")
    print("               IntercityRate, Service, Setting, HomeConfig, Offer")
    print()

    if not args.confirm:
        print("DRY RUN — nothing was deleted. Re-run with --confirm to apply.")
        cli.close()
        return

    # ── 2. Backup, always, before anything is removed ───────────────────────
    stamp = time.strftime("%Y%m%d-%H%M%S")
    remote_dump = f"{BACKUP_DIR}/tamem-pre-reset-{stamp}.sql.gz"
    tables = " ".join(f"'{t}'" for t in AFFECTED_TABLES)
    print("backing up…")
    dump_cmd = (
        f"mkdir -p {BACKUP_DIR} && chmod 700 {BACKUP_DIR} && "
        f"MYSQL_PWD='{db_pw}' mysqldump -u {db_user} -h {db_host} "
        f"--single-transaction --no-tablespaces --default-character-set=utf8mb4 "
        f"{db_name} {tables} | gzip -9 > {remote_dump} && "
        f"ls -l {remote_dump}"
    )
    _, out, err = cli.exec_command(dump_cmd, timeout=900)
    listing = out.read().decode("utf-8", "replace").strip()
    derr = "\n".join(
        l for l in err.read().decode("utf-8", "replace").splitlines()
        if "Using a password" not in l
    ).strip()
    if derr:
        print("  ! mysqldump:", derr[:400])
    if not listing:
        cli.close()
        sys.exit("Backup produced nothing — refusing to delete.")
    print("  server:", listing)

    import os

    os.makedirs(LOCAL_BACKUP_DIR, exist_ok=True)
    local_copy = os.path.join(LOCAL_BACKUP_DIR, posixpath.basename(remote_dump))
    sftp = cli.open_sftp()
    # $HOME does not expand over SFTP.
    sftp.get(remote_dump.replace("$HOME", f"/home/{USER}"), local_copy)
    sftp.close()
    size = os.path.getsize(local_copy)
    print(f"  local:  {local_copy}  ({size:,} bytes)")
    if size < 1024:
        cli.close()
        sys.exit("Backup is implausibly small — refusing to delete.")

    # ── 3. Delete, all of it or none of it ──────────────────────────────────
    print("\ndeleting…")
    statements = ["SET FOREIGN_KEY_CHECKS=1", "START TRANSACTION"]
    for table, where, _ in plan:
        statements.append(f"DELETE FROM `{table}` WHERE {where}")

    # ── Denormalised state, recomputed from what SURVIVED ───────────────────
    #
    # These run last and are derived, not hardcoded, so they are right whether
    # the reset kept some orders or none.
    #
    # `status` matters most. A driver is marked BUSY while carrying an order; if
    # that order is deleted the flag has nothing to clear it, the driver is BUSY
    # for good, and the assign list quietly loses them. The live database
    # already had one driver stuck this way with zero active orders.
    statements += [
        "UPDATE `DriverProfile` d SET d.status='AVAILABLE' WHERE d.status='BUSY' AND NOT EXISTS ("
        "SELECT 1 FROM `Order` o WHERE o.assignedDriverId=d.userId "
        "AND o.status IN ('DRIVER_ASSIGNED','PICKED_UP','IN_ROUTE'))",
        # Ratings are averages over OrderReview. Every review of a deleted order
        # went with it, so a 5.00 left in place is a score with no reviews.
        "UPDATE `DriverProfile` d SET d.rating=("
        "SELECT AVG(r.driverRating) FROM `OrderReview` r "
        "WHERE r.driverId=d.userId AND r.driverRating IS NOT NULL)",
        "UPDATE `MerchantProfile` m SET m.rating=("
        "SELECT AVG(r.merchantRating) FROM `OrderReview` r "
        "WHERE r.merchantId=m.id AND r.merchantRating IS NOT NULL)",
        # Lifetime driver totals. Recomputed from the orders still on record.
        "UPDATE `DriverProfile` d SET d.totalDeliveries=("
        "SELECT COUNT(*) FROM `Order` o WHERE o.assignedDriverId=d.userId "
        "AND o.status IN ('DELIVERED','COMPLETED'))",
    ]
    statements.append("COMMIT")

    joined = "; ".join(statements)
    res = sql(joined)
    if res:
        print(" ", res)

    # ── 4. Prove it ─────────────────────────────────────────────────────────
    print("\nafter:")
    for table in ("Order", "OrderItem", "OrderStatusHistory", "OrderLeg", "OrderReview",
                  "Alert", "Notification", "Coupon", "CouponRedemption", "DriverSettlement"):
        print(f"    {table:<24} {count(table):>6} rows")
    print(f"\n    Product                  {count('Product'):>6} rows   (untouched)")
    print(f"    MerchantProfile          {count('MerchantProfile'):>6} rows   (untouched)")
    print(f"    User                     {count('User'):>6} rows   (untouched)")
    print(f"\nDone. Restore from {remote_dump} (or {local_copy}) if this was wrong.")
    cli.close()


if __name__ == "__main__":
    main()
