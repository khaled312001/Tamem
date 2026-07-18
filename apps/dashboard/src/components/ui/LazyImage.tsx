/**
 * Thumbnail for list/table rows.
 *
 * Every list image before this rendered eagerly at full source size — a table of
 * 50 products pulled 50 full-resolution images on mount. This one is
 * `loading="lazy"` + `decoding="async"` with explicit width/height (so the
 * browser reserves space and never reflows), and falls back to a neutral icon
 * tile when the URL is missing or fails to load.
 */
import { ImageOff } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';

export function LazyImage({
  src,
  alt,
  size = 40,
  rounded = 'rounded-lg',
  className = '',
  fallback,
}: {
  src?: string | null;
  alt?: string;
  /** Rendered box in px — also sets width/height so layout never shifts. */
  size?: number;
  rounded?: string;
  className?: string;
  fallback?: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size };

  if (!src || failed) {
    return (
      <div
        style={box}
        className={`${rounded} ${className} shrink-0 bg-muted flex items-center justify-center text-muted-foreground`}
        aria-label={alt}
      >
        {fallback ?? <ImageOff style={{ width: size * 0.45, height: size * 0.45 }} />}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt ?? ''}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      style={box}
      className={`${rounded} ${className} shrink-0 object-cover bg-muted`}
    />
  );
}
