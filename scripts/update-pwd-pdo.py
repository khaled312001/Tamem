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

    php_script = f"""<?php
$pdo = new PDO('mysql:host={db_host};dbname={db_name};charset=utf8mb4', '{db_user}', '{db_pw}');
$pwd = '{STRONG_PASSWORD}';
$hash = password_hash($pwd, PASSWORD_BCRYPT);
$st = $pdo->prepare("UPDATE User SET role = 'MERCHANT', isActive = 1, passwordHash = ?, updatedAt = NOW(3) WHERE phone LIKE '%1123619997%'");
$st->execute([$hash]);
echo "UPDATED_OK: " . $hash . "\\n";
"""

    remote_file = "/home/u748721963/domains/deliverytamem.com/public_html/backendtamem/update_pwd_tmp.php"
    sftp = cli.open_sftp()
    with sftp.file(remote_file, "w") as f:
        f.write(php_script)
    sftp.close()

    _, out, _ = cli.exec_command("php ~/domains/deliverytamem.com/public_html/backendtamem/update_pwd_tmp.php", timeout=30)
    res = out.read().decode('utf-8')
    print("PHP Script output:", res)

    # Clean up temp file
    cli.exec_command("rm -f ~/domains/deliverytamem.com/public_html/backendtamem/update_pwd_tmp.php")

    # Test PHP password_verify on server
    php_test = f"php -r \"var_dump(password_verify('{STRONG_PASSWORD}', '{res.strip().split(': ')[-1]}'));\""
    _, php_out, _ = cli.exec_command(php_test, timeout=30)
    print("PHP password_verify result:", php_out.read().decode('utf-8'))

    cli.close()

if __name__ == "__main__":
    main()
