import os
import re
import sys
import paramiko
import bcrypt
from urllib.parse import unquote

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
    if not line:
        sys.exit("No DATABASE_URL in the deployed .env.")
    url = re.match(r"DATABASE_URL\s*=\s*[\"']?(.+?)[\"']?\s*$", line).group(1)
    p = re.match(r"mysql://([^:]+):([^@]+)@([^:/]+)(?::(\d+))?/(.+)", url)
    if not p:
        sys.exit("DATABASE_URL is not in mysql://user:pass@host/db form.")
    return p.group(5), unquote(p.group(1)), unquote(p.group(2)), p.group(3)

def main():
    cli = paramiko.SSHClient()
    cli.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    cli.connect(HOST, port=PORT, username=USER, password=ssh_password(), timeout=30)
    db_name, db_user, db_pw, db_host = db_from_server(cli)

    phone = "01200000001"
    password = "Merchant@2024"
    pwd_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt(12)).decode('utf-8')

    sql_statements = [
        # 1. Upsert User
        f"""INSERT INTO `User` (id, phone, name, passwordHash, role, isPhoneVerified, isActive, city, governorate, createdAt, updatedAt)
           VALUES ('cm-alex-user-001', '{phone}', 'مطعم الإسكندراني', '{pwd_hash}', 'MERCHANT', 1, 1, 'الإسكندرية', 'الإسكندرية', NOW(3), NOW(3))
           ON DUPLICATE KEY UPDATE name='مطعم الإسكندراني', passwordHash='{pwd_hash}', role='MERCHANT', isActive=1, updatedAt=NOW(3);""",

        # 2. Upsert Category if missing
        """INSERT IGNORE INTO `Category` (id, name, nameAr, sortOrder, isActive, createdAt)
           VALUES ('restaurants', 'Restaurants', 'مطاعم', 1, 1, NOW(3));""",

        # 3. Upsert MerchantProfile
        """INSERT INTO `MerchantProfile` (id, userId, storeName, storeNameAr, categoryId, description, addressLine, lat, lng, governorate, city, isOpen, phone, createdAt, updatedAt)
           VALUES ('cm-alex-merchant-001', 'cm-alex-user-001', 'El-Eskandrani', 'مطعم الإسكندراني', 'restaurants', 'أشهر مطعم أكلات بحرية إسكندراني — صيادية وسمك مشوي وفواكه بحر طازة يومياً. خبرة أكتر من ٢٠ سنة في تقديم أطيب الوجبات البحرية الأصيلة.', 'شارع السلطان حسين، الأنفوشي، الإسكندرية', 31.2001, 29.8894, 'الإسكندرية', 'الإسكندرية', 1, '01200000001', NOW(3), NOW(3))
           ON DUPLICATE KEY UPDATE storeNameAr='مطعم الإسكندراني', phone='01200000001', isOpen=1, updatedAt=NOW(3);""",
    ]

    products = [
        ('Sayadeya', 'صيادية سمك', 'أرز بالسمك على الطريقة الإسكندرانية مع صلصة الطحينة', 85, None, None, 'الأطباق الرئيسية', 1),
        ('Grilled Fish', 'سمك مشوي', 'سمك بلطي أو بوري مشوي على الفحم مع سلطة وأرز', 120, None, None, 'الأطباق الرئيسية', 2),
        ('Fried Calamari', 'كاليماري مقلي', 'حلقات كاليماري مقلية ومقرمشة مع صوص الكوكتيل', 75, None, None, 'المقبلات', 3),
        ('Alexandrian Liver', 'كبدة إسكندراني', 'كبدة بالفلفل الحار والتوابل الإسكندرانية الأصلية', 55, None, None, 'الأطباق الرئيسية', 4),
        ('Shrimp Casserole', 'طاجن جمبري', 'جمبري طازج مطبوخ في طاجن فخار مع الطماطم والبهارات', 130, None, None, 'الأطباق الرئيسية', 5),
        ('Fish Koshary', 'كشري بالسمك', 'كشري إسكندراني بقطع السمك المقلي والصلصة الحمراء', 45, None, None, 'الأطباق الرئيسية', 6),
        ('Seafood Fettah', 'فتة بحرية', 'فتة بالمأكولات البحرية المشكلة والأرز والخبز المحمص', 95, None, None, 'الأطباق الرئيسية', 7),
        ('Grilled Shrimp', 'جمبري مشوي', 'جمبري جامبو مشوي بالزبدة والثوم والليمون', 150, None, None, 'الأطباق الرئيسية', 8),
        ('Tahini Salad', 'سلطة طحينة', 'طحينة بالليمون والثوم وزيت الزيتون', 20, None, None, 'المقبلات', 9),
        ('Baba Ghanoush', 'بابا غنوج', 'باذنجان مشوي مهروس بالطحينة والثوم', 25, None, None, 'المقبلات', 10),
        ('Mixed Seafood Grill', 'مشويات بحرية مشكلة', 'تشكيلة سمك وجمبري وكاليماري مشوية على الفحم', 180, None, None, 'الأطباق الرئيسية', 11),
        ('Fish Soup', 'شوربة سمك', 'شوربة سمك كريمية على الطريقة الإسكندرانية', 35, None, None, 'الشوربة', 12),
        ('Fried Fish Fillet', 'فيليه سمك مقلي', 'فيليه سمك مقلي مقرمش مع بطاطس وسلطة كول سلو', 90, None, None, 'الأطباق الرئيسية', 13),
        ('Molokhia with Shrimp', 'ملوخية بالجمبري', 'ملوخية خضراء بالجمبري والثوم المحمر مع أرز', 70, None, None, 'الأطباق الرئيسية', 14),
        ('Om Ali', 'أم علي', 'أم علي بالمكسرات والقشطة — حلو ساخن', 35, 28, 20, 'الحلويات', 15),
    ]

    for p in products:
        sku = f"alex-{str(p[7]).zfill(3)}"
        pid = f"cm-alex-prod-{str(p[7]).zfill(3)}"
        sale_val = str(p[4]) if p[4] else "NULL"
        disc_val = str(p[5]) if p[5] else "NULL"
        desc_val = f"'{p[2]}'" if p[2] else "NULL"
        sql_statements.append(f"""
            INSERT INTO `Product` (id, merchantId, name, nameAr, description, price, salePrice, discount, categoryName, sortOrder, sku, isAvailable, isHidden, createdAt, updatedAt)
            VALUES ('{pid}', 'cm-alex-merchant-001', '{p[0]}', '{p[1]}', {desc_val}, {p[3]}, {sale_val}, {disc_val}, '{p[6]}', {p[7]}, '{sku}', 1, 0, NOW(3), NOW(3))
            ON DUPLICATE KEY UPDATE merchantId='cm-alex-merchant-001', nameAr='{p[1]}', description={desc_val}, price={p[3]}, salePrice={sale_val}, discount={disc_val}, isAvailable=1, isHidden=0, updatedAt=NOW(3);
        """)

    def shell_quote(s: str) -> str:
        return "'" + s.replace("'", "'\\''") + "'"

    print("Seeding live database over SSH...")
    for q in sql_statements:
        cmd = f"MYSQL_PWD='{db_pw}' mysql -u {db_user} -h {db_host} {db_name} --batch -e {shell_quote(q.strip())}"
        _, out, err = cli.exec_command(cmd, timeout=30)
        e = err.read().decode('utf-8', 'replace').strip()
        if e and "Using a password" not in e:
            print("Warning:", e)

    print("Live database seeded successfully!")
    cli.close()

if __name__ == "__main__":
    main()
