import type { Config } from 'tailwindcss';

import { colors, fonts, radii } from './tokens.js';

const preset: Partial<Config> = {
  theme: {
    extend: {
      colors: {
        brand: colors.brand,
        status: colors.status,
        // shadcn/ui-compatible semantic tokens (HSL via CSS vars)
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      fontFamily: {
        sans: fonts.body.split(', '),
        heading: fonts.heading.split(', '),
        body: fonts.body.split(', '),
      },
      borderRadius: {
        lg: radii.lg,
        md: radii.md,
        sm: radii.sm,
      },
    },
  },
};

export default preset;
