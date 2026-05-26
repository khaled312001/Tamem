import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { RequestHandler } from 'express';
import multer from 'multer';
import { nanoid } from 'nanoid';
import sharp from 'sharp';

import { env } from '../../config/env.js';
import { ValidationError } from '../../utils/errors.js';
import { created } from '../../utils/response.js';

const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

// Voice notes recorded via MediaRecorder (web) or expo-av (native).
// Map each accepted mime to the file extension we'll write so the URL ends in
// something the browser's <audio> tag and Content-Type sniffing can handle.
const AUDIO_MIME_TO_EXT: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/mp4': 'm4a',
  'audio/m4a': 'm4a',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/aac': 'aac',
};

const ALLOWED_MIMES = [...ALLOWED_IMAGE_MIMES, ...Object.keys(AUDIO_MIME_TO_EXT)];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.UPLOAD_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIMES.includes(file.mimetype.toLowerCase())) {
      cb(new Error(`Mimetype ${file.mimetype} not allowed (allowed: ${ALLOWED_MIMES.join(', ')})`));
      return;
    }
    cb(null, true);
  },
});

export const uploadMiddleware: RequestHandler = upload.single('file');

/**
 * POST /uploads (multipart, field name: "file")
 * Images: resized to max 1600px width JPEG q85.
 * Audio: stored as-is with the right extension so the browser's <audio>
 * element can play it back (sharp would corrupt audio bytes).
 * Returns absolute URL.
 */
export const uploadFile: RequestHandler = async (req, res, next) => {
  try {
    if (!req.file) throw new ValidationError({ file: ['No file uploaded'] }, 'لم يتم رفع ملف');

    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dir = join(env.UPLOAD_DIR, yyyy, mm);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const mime = req.file.mimetype.toLowerCase();
    const isAudio = mime in AUDIO_MIME_TO_EXT;

    let key: string;
    const fullPath = (k: string) => join(env.UPLOAD_DIR, k);

    if (isAudio) {
      const ext = AUDIO_MIME_TO_EXT[mime]!;
      key = `${yyyy}/${mm}/${nanoid(16)}.${ext}`;
      writeFileSync(fullPath(key), req.file.buffer);
    } else {
      // image branch — sharp re-encode + resize
      key = `${yyyy}/${mm}/${nanoid(16)}.jpg`;
      await sharp(req.file.buffer)
        .rotate()
        .resize({ width: 1600, withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toFile(fullPath(key));
    }

    const url = `${env.API_BASE_URL}/uploads/${key}`;
    created(res, { url, key, mime, kind: isAudio ? 'audio' : 'image' });
  } catch (err) {
    next(err);
  }
};
