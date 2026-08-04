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
    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(HOST, port=PORT, username=USER, password=ssh_password(), timeout=30)
    db_name, db_user, db_pw, db_host = db_from_server(cli)

    cmd = f"MYSQL_PWD='{db_pw}' mysql -u {db_user} -h {db_host} {db_name} --batch -e \"SELECT id, name, phone, role, isActive, passwordHash FROM User WHERE phone LIKE '%1123619997%'\""
    _, out, _ = cli.exec_command(cmd, timeout=30)
    user_data = out.read().decode('utf-8', 'replace')
    print("=== User DB Data ===")
    print(user_data)

    lines = [l for l in user_data.strip().split('\n') if l]
    if len(lines) > 1:
        cols = lines[1].split('\t')
        h = cols[5]
        php_test = f"php -r \"var_dump(password_verify('Alex@Merchant#2026!', '{h}'));\""
        _, php_out, _ = cli.exec_command(php_test, timeout=30)
        print("PHP password_verify result:", php_out.read().decode('utf-8'))

    cli.close()

if __name__ == "__main__":
    main()
