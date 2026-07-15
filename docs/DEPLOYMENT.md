# دليل النشر — Hostinger

دليل شامل لنشر تميم على Hostinger. يفترض VPS KVM 4 (4 vCPU / 8GB RAM) + Shared Hosting للستاتيك.

---

## استراتيجية الدومين

| الدومين                   | المحتوى                    | المكان                              |
| ------------------------- | -------------------------- | ----------------------------------- |
| `deliverytamem.com`       | اللاندنج بيج               | Shared Hosting `public_html/`       |
| `admin.deliverytamem.com` | الداشبورد (SPA)            | Shared Hosting `public_html/admin/` |
| `api.deliverytamem.com`   | الـ API (Node + WebSocket) | VPS Nginx → PM2                     |

---

## إعداد الـ VPS

### 1. تجهيز الخادم

```bash
ssh root@<server-ip>

# تحديث + أساسيات
apt update && apt upgrade -y
apt install -y curl git build-essential ufw nginx certbot python3-certbot-nginx

# Firewall
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable

# مستخدم بدلاً من root
adduser tamem
usermod -aG sudo tamem
```

### 2. تثبيت Node 20 + pnpm + PM2

```bash
# Node via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20.11.0
nvm use 20.11.0
nvm alias default 20.11.0

# pnpm + PM2
npm i -g pnpm@11 pm2
pm2 startup systemd
```

### 3. تثبيت MySQL 8

```bash
apt install -y mysql-server
mysql_secure_installation

mysql -u root -p <<EOF
CREATE DATABASE tamem CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'tamem'@'localhost' IDENTIFIED BY 'STRONG_PASSWORD_HERE';
GRANT ALL ON tamem.* TO 'tamem'@'localhost';
FLUSH PRIVILEGES;
EOF
```

### 4. نشر الكود

```bash
# على الخادم
cd /var/www
git clone <repo-url> tamem
cd tamem
pnpm install --frozen-lockfile

# Backend env
cp .env.example .env
nano .env   # ضع القيم الحقيقية (DB, JWT secrets, Google Maps key, ...)

# Prisma migrate
pnpm --filter @tamem/backend prisma:deploy
pnpm --filter @tamem/backend db:seed   # admin + خدمات أولية

# Build backend
pnpm --filter @tamem/backend build

# تشغيل عبر PM2
cd apps/backend
pm2 start ecosystem.config.cjs --env production
pm2 save
```

### 5. تكوين Nginx

انسخ التكوين التالي إلى `/etc/nginx/sites-available/tamem`:

```nginx
# API + WebSocket
server {
  listen 80;
  server_name api.deliverytamem.com;

  client_max_body_size 10M;

  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
  }

  location /uploads/ {
    alias /var/www/tamem/apps/backend/uploads/;
    expires 30d;
    add_header Cache-Control "public, immutable";
  }
}

# Dashboard (SPA)
server {
  listen 80;
  server_name admin.deliverytamem.com;
  root /var/www/tamem/apps/dashboard/dist;
  index index.html;

  location / {
    try_files $uri $uri/ /index.html;
  }
}

# Landing
server {
  listen 80;
  server_name deliverytamem.com www.deliverytamem.com;
  root /var/www/tamem/apps/landing/dist;
  index index.html;
}
```

```bash
ln -s /etc/nginx/sites-available/tamem /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### 6. SSL مع Let's Encrypt

```bash
certbot --nginx -d deliverytamem.com -d www.deliverytamem.com \
                -d admin.deliverytamem.com -d api.deliverytamem.com
# اتبع التعليمات. سيُعدّل Nginx تلقائياً.
```

### 7. النسخ الاحتياطي

```bash
mkdir -p /var/backups/tamem
cat > /etc/cron.daily/tamem-backup <<'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d-%H%M%S)
mysqldump -u tamem -p'PASSWORD' tamem | gzip > /var/backups/tamem/db-$DATE.sql.gz
find /var/backups/tamem -mtime +14 -delete
EOF
chmod +x /etc/cron.daily/tamem-backup
```

---

## نشر تحديث (deploy)

```bash
# على الخادم
cd /var/www/tamem
git pull origin main
pnpm install --frozen-lockfile

# لو فيه schema changes
pnpm --filter @tamem/backend prisma:deploy

# rebuild + reload
pnpm build
pm2 reload tamem-api

# نسخ static builds
cp -r apps/dashboard/dist/* /var/www/tamem-static/admin/
cp -r apps/landing/dist/* /var/www/tamem-static/landing/
```

---

## مراقبة

- **PM2 monitor:** `pm2 monit`
- **Logs:** `/var/log/tamem/api-*.log`
- **MySQL slow query:** `tail -f /var/log/mysql/slow.log`
- **Uptime check خارجي:** UptimeRobot (مجاني) — يفحص `/health` كل 5 دقائق
- **Disk usage:** `df -h` (راقب `/var/www/tamem/apps/backend/uploads`)

---

## استكشاف الأخطاء

| المشكلة                 | الحل                                                                 |
| ----------------------- | -------------------------------------------------------------------- |
| API لا يستجيب           | `pm2 status` → `pm2 logs tamem-api` → ابحث عن الخطأ                  |
| 502 Bad Gateway         | تحقق أن Node يستمع على 4000: `lsof -i :4000`                         |
| Prisma migration failed | تأكد من DB credentials في `.env` ومن قدرة المستخدم على CREATE TABLE  |
| WebSocket disconnect    | راجع تكوين Nginx — لازم `Upgrade` headers                            |
| File upload يفشل        | تحقق من `client_max_body_size` في Nginx + permissions على `uploads/` |
