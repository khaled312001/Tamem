import os
import re
import sys
import paramiko
from urllib.parse import unquote

sys.stdout.reconfigure(encoding='utf-8')

HANDOFF = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "HANDOFF.md"))
HOST, PORT, USER = "77.37.37.207", 65002, "u748721963"

def ssh_password() -> str:
    txt = open(HANDOFF, encoding="utf-8").read()
    i = txt.find("SSH / SFTP")
    m = re.search(r"PASS(?:WORD)?\s*:\s*(\S+)", txt[i : i + 1200])
    if not m:
        sys.exit("No SSH password found under 'SSH / SFTP' in HANDOFF.md")
    return m.group(1)

def db_from_server(cli) -> tuple[str, str, str, str]:
    base = "~/domains/deliverytamem.com/public_html/backendtamem"
    _, out, _ = cli.exec_command(f"grep -m1 '^DATABASE_URL' {base}/.env", timeout=60)
    line = out.read().decode("utf-8", "replace").strip()
    url = re.match(r"DATABASE_URL\s*=\s*[\"']?(.+?)[\"']?\s*$", line).group(1)
    p = re.match(r"mysql://([^:]+):([^@]+)@([^:/]+)(?::(\d+))?/(.+)", url)
    return p.group(5), unquote(p.group(1)), unquote(p.group(2)), p.group(3)

def main():
    STRONG_PASSWORD = "Alex@Merchant#2026!"

    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(HOST, port=PORT, username=USER, password=ssh_password(), timeout=30)
    db_name, db_user, db_pw, db_host = db_from_server(cli)

    # Generate hash using PHP CLI on the server directly
    php_cmd = f"php -r \"echo password_hash('{STRONG_PASSWORD}', PASSWORD_BCRYPT);\""
    _, php_out, _ = cli.exec_command(php_cmd, timeout=30)
    php_hash = php_out.read().decode('utf-8').strip()
    print("PHP generated hash:", php_hash)

    # Update database User table with php_hash
    sql = f"UPDATE User SET role = 'MERCHANT', isActive = 1, passwordHash = '{php_hash}', updatedAt = NOW(3) WHERE phone LIKE '%1123619997%'"
    cmd = f"MYSQL_PWD='{db_pw}' mysql -u {db_user} -h {db_host} {db_name} -e \"{sql}\""
    _, db_out, err = cli.exec_command(cmd, timeout=30)
    print("Database updated:", db_out.read().decode('utf-8'), err.read().decode('utf-8'))

    cli.close()

if __name__ == "__main__":
    main()
