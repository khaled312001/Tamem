import { customAlphabet } from 'nanoid';

const nano = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 5);

/**
 * Generates a human-readable order number like TMM-2026-X3K9P.
 * Collision-safe enough at expected volume; DB has a unique constraint as backstop.
 */
export function generateOrderNumber(): string {
  const year = new Date().getFullYear();
  return `TMM-${year}-${nano()}`;
}
