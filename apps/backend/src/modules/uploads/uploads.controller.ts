import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import type { RequestHandler } from 'express';
import multer from 'multer';
import { nanoid } from 'nanoid';
import sharp from 'sharp';

import { env } from '../../config/env.js';
import { ValidationError } from '../../utils/errors.js';
import { created } from '../../utils/response.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.UPLOAD_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.mimetype)) {
      cb(new Error('Only JPG/PNG/WEBP files are allowed'));
      return;
    }
    cb(null, true);
  },
});

export const uploadMiddleware: RequestHandler = upload.single('file');

/**
 * POST /uploads (multipart, field name: "file")
 * Resizes to max 1600px width JPEG q85, returns absolute URL.
 */
export const uploadFile: RequestHandler = async (req, res, next) => {
  try {
    if (!req.file) throw new ValidationError({ file: ['No file uploaded'] }, 'لم يتم رفع ملف');

    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dir = join(env.UPLOAD_DIR, yyyy, mm);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const key = `${yyyy}/${mm}/${nanoid(16)}.jpg`;
    const fullPath = join(env.UPLOAD_DIR, key);

    await sharp(req.file.buffer)
      .rotate()
      .resize({ width: 1600, withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toFile(fullPath);

    const url = `${env.API_BASE_URL}/uploads/${key}`;
    created(res, { url, key });
  } catch (err) {
    next(err);
  }
};
