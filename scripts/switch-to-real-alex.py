import os
import re
import sys
import bcrypt
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
    # Generate bcrypt hash (cost 12)
    pwd_bytes = STRONG_PASSWORD.encode('utf-8')
    pwd_hash = bcrypt.hashpw(pwd_bytes, bcrypt.gensalt(12)).decode('utf-8')

    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(HOST, port=PORT, username=USER, password=ssh_password(), timeout=30)
    db_name, db_user, db_pw, db_host = db_from_server(cli)

    # 1. Update existing merchant user 01123619997 with password hash, role='MERCHANT', isActive=1
    sql1 = f"UPDATE User SET role = 'MERCHANT', isActive = 1, passwordHash = '{pwd_hash}', updatedAt = NOW(3) WHERE phone LIKE '%1123619997%'"
    cmd1 = f"MYSQL_PWD='{db_pw}' mysql -u {db_user} -h {db_host} {db_name} -e \"{sql1}\""
    _, out1, err1 = cli.exec_command(cmd1, timeout=30)
    print("Updated User password:", out1.read().decode('utf-8'), err1.read().decode('utf-8'))

    # 2. Clean up sample test merchant cm-alex-merchant-001
    sql2 = "DELETE FROM Product WHERE merchantId = 'cm-alex-merchant-001'; DELETE FROM MerchantProfile WHERE id = 'cm-alex-merchant-001'; DELETE FROM User WHERE id = 'cm-alex-user-001';"
    cmd2 = f"MYSQL_PWD='{db_pw}' mysql -u {db_user} -h {db_host} {db_name} -e \"{sql2}\""
    _, out2, err2 = cli.exec_command(cmd2, timeout=30)
    print("Deleted sample test merchant:", out2.read().decode('utf-8'), err2.read().decode('utf-8'))

    # 3. Verify user and merchant profile details
    cmd3 = f"MYSQL_PWD='{db_pw}' mysql -u {db_user} -h {db_host} {db_name} --batch -e \"SELECT u.id, u.name, u.phone, u.role, mp.id as merchantId, mp.storeNameAr, (SELECT COUNT(*) FROM Product p WHERE p.merchantId = mp.id) as productsCount FROM User u JOIN MerchantProfile mp ON mp.userId = u.id WHERE u.phone LIKE '%1123619997%'\""
    _, out3, _ = cli.exec_command(cmd3, timeout=30)
    print("=== Verification of Real Alexandrani Merchant ===")
    print(out3.read().decode('utf-8', 'replace'))

    cli.close()

if __name__ == "__main__":
    main()
