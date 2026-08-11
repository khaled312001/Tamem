"""
Point the LOCAL dev shim at the same database production uses.

`apps/backend/dist-bundle/.env` is a developer file — deploy-api.py uploads
api.php and nothing else — and its DATABASE_URL had drifted onto an older
database that no longer has every table. Running the shim locally
(`php -S 127.0.0.1:8099` in dist-bundle/) then fataled on tables that have
existed in production for weeks, which reads as "my change broke it" when the
change was fine.

This copies the deployed DATABASE_URL over the local one, using the same SSH
path as db-query.py / db-migrate.py. The value is never printed, and only that
one key is touched — everything else in the local .env is preserved byte for
byte. Safe to re-run.

Usage:
    python scripts/dev-env-sync.py
"""

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from db_query_shim import db_url_from_server  # noqa: E402

LOCAL_ENV = Path(r"E:\Tamem\apps\backend\dist-bundle\.env")


def main() -> None:
    if not LOCAL_ENV.is_file():
        sys.exit(f"No local .env at {LOCAL_ENV}")
    url = db_url_from_server()

    text = LOCAL_ENV.read_text(encoding="utf-8")
    line = f'DATABASE_URL="{url}"'
    new, n = re.subn(r"(?m)^DATABASE_URL\s*=.*$", lambda _m: line, text, count=1)
    if n == 0:
        new = text.rstrip("\n") + "\n" + line + "\n"

    if new == text:
        print("local .env already matches production")
        return
    LOCAL_ENV.write_text(new, encoding="utf-8")
    print("local .env DATABASE_URL synced from the server (value not printed)")


if __name__ == "__main__":
    main()
