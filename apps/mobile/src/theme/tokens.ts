/**
 * Mobile theme tokens — exact match for design-tamem.html palette.
 * Warm off-white background, gold/red accents, dark navy text.
 */

export const colors = {
  brand: {
    red: '#E0301E',
    redDark: '#B82414',
    redLight: '#FDEAE2',
    orange: '#EC7A2C',
    gold: '#F2A93B',
    gray: '#58595B',
    dark: '#241310',
  },
  white: '#FFFFFF',
  black: '#000000',
  // Warm tones from design-tamem.html
  surface: '#FCF8F4',
  soft: '#F7EFE7',
  line: '#F0E4DA',
  line2: '#E8D8C9',
  border: '#F0E4DA',
  danger: '#DC2626',
  success: '#1A9F6E',
  successLight: '#E5F6EE',
  ink: '#2B2622',
  text: {
    primary: '#2B2622',
    secondary: '#58595B',
    muted: '#9A9088',
    onBrand: '#FFFFFF',
  },
  status: {
    NEW: '#B82414',
    UNDER_REVIEW: '#5E35B1',
    PRICED: '#0EA5E9',
    AWAITING_CUSTOMER_APPROVAL: '#9A6B16',
    ACCEPTED: '#157A52',
    DRIVER_ASSIGNED: '#06B6D4',
    PICKED_UP: '#14B8A6',
    IN_ROUTE: '#9A6B16',
    DELIVERED: '#157A52',
    COMPLETED: '#157A52',
    CANCELLED: '#71717A',
    REJECTED: '#B82414',
  },
} as const;

// Gradient pairs (use with expo-linear-gradient)
export const gradients = {
  brand: ['#E0301E', '#EC7A2C'] as const,
  brandGold: ['#EC7A2C', '#F2A93B'] as const,
  splash: ['#E0301E', '#C4280F', '#9A1A0A', '#241310'] as const,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radii = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
} as const;

export const fontSizes = {
  xs: 11,
  sm: 13,
  md: 15,
  lg: 18,
  xl: 22,
  xxl: 28,
  display: 34,
} as const;

// Match font names registered by expo-font (see lib/fonts.ts).
// NOTE: Cairo 900 Black overlaps Arabic glyphs at sizes < 28px on web — we use
// Cairo 800 ExtraBold as the default heavy heading face to keep letters legible.
export const fontFamilies = {
  headingBlack: 'Cairo_800ExtraBold',
  headingBold: 'Cairo_700Bold',
  // True 900 for very large display headings only (size >= 32)
  headingDisplay: 'Cairo_900Black',
  body: 'Tajawal_400Regular',
  bodyMedium: 'Tajawal_500Medium',
  bodyBold: 'Tajawal_700Bold',
  bodyExtraBold: 'Tajawal_800ExtraBold',
  // Legacy alias
  heading: 'Cairo_800ExtraBold',
} as const;
