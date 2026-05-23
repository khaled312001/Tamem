// Load env vars from .env before any test module evaluates `process.env`.
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(import.meta.url);
const backendRoot = resolve(here, '..', '..');

// Load apps/backend/.env first, fall back to repo root .env.
config({ path: resolve(backendRoot, '.env') });
config({ path: resolve(backendRoot, '..', '..', '.env') });

// Provide test-only defaults if not set.
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ?? 'test_access_secret_min_32_chars_xxxxxxxxxx';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ?? 'test_refresh_secret_min_32_chars_yyyyyyyy';
