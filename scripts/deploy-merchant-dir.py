import os
import re
import sys
import paramiko

sys.stdout.reconfigure(encoding='utf-8')

HANDOFF = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "HANDOFF.md"))
HOST, PORT, USER = "77.37.37.207", 65002, "u748721963"

def ssh_password() -> str:
    txt = open(HANDOFF, encoding="utf-8").read()
    i = txt.find("SSH / SFTP")
    m = re.search(r"PASS(?:WORD)?\s*:\s*(\S+)", txt[i : i + 1200])
    return m.group(1)

def main():
    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(HOST, port=PORT, username=USER, password=ssh_password(), timeout=30)

    # 1. Remove any old symlink or directory at public_html/merchant
    cli.exec_command("rm -rf /home/u748721963/domains/deliverytamem.com/public_html/merchant")

    # 2. Copy super_admin directory contents to merchant directory
    cli.exec_command("cp -r /home/u748721963/domains/deliverytamem.com/public_html/super_admin /home/u748721963/domains/deliverytamem.com/public_html/merchant")

    # 3. Create custom .htaccess inside /merchant with RewriteBase /merchant/
    htaccess = """RewriteEngine On
RewriteBase /merchant/

AddType text/javascript .js .mjs
AddType text/css .css
AddType application/json .json
AddType image/svg+xml .svg
AddType font/woff .woff
AddType font/woff2 .woff2
AddType application/wasm .wasm

<FilesMatch "\\.(js|mjs|css|woff2?|png|jpe?g|gif|svg|ico)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
</FilesMatch>

<FilesMatch "\\.html?$">
    Header set Cache-Control "no-store, must-revalidate"
    Header set Pragma "no-cache"
    Header set Expires "0"
</FilesMatch>

RewriteRule ^index\\.html$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /merchant/index.html [L]
"""
    sftp = cli.open_sftp()
    with sftp.file("/home/u748721963/domains/deliverytamem.com/public_html/merchant/.htaccess", "w") as f:
        f.write(htaccess)
    sftp.close()

    print("Created dedicated merchant directory at public_html/merchant with RewriteBase /merchant/")
    cli.close()

if __name__ == "__main__":
    main()
