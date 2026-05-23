-- Tamem Delivery — One-time DB and user setup
-- Run with: mysql -u root < apps/backend/scripts/init-db.sql

CREATE DATABASE IF NOT EXISTS tamem
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE DATABASE IF NOT EXISTS tamem_shadow
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- Drop user if exists, then create (idempotent)
DROP USER IF EXISTS 'tamem'@'localhost';
DROP USER IF EXISTS 'tamem'@'127.0.0.1';
DROP USER IF EXISTS 'tamem'@'%';

-- MySQL 8.4 default auth plugin = caching_sha2_password (supported by Prisma 6)
CREATE USER 'tamem'@'localhost' IDENTIFIED BY 'tamempass';
CREATE USER 'tamem'@'127.0.0.1' IDENTIFIED BY 'tamempass';

GRANT ALL PRIVILEGES ON tamem.* TO 'tamem'@'localhost';
GRANT ALL PRIVILEGES ON tamem.* TO 'tamem'@'127.0.0.1';
GRANT ALL PRIVILEGES ON tamem_shadow.* TO 'tamem'@'localhost';
GRANT ALL PRIVILEGES ON tamem_shadow.* TO 'tamem'@'127.0.0.1';

FLUSH PRIVILEGES;

SELECT 'Tamem DB + user created successfully' AS status;
