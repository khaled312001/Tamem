/**
 * Tamem design system tokens.
 * Warm off-white surface, brand red/gold accents, dark navy ink — same
 * palette as design-tamem.html but extended for full production use.
 *
 * Spacing: 8px grid. Radii: generous but not playful. Shadows: subtle.
 */

export const colors = {
  brand: {
    red: '#E0301E',
    redDark: '#B82414',
    redLight: '#FDEAE2',
    orange: '#EC7A2C',
    gold: '#F2A93B',
    goldLight: '#FCEFD3',
    gray: '#58595B',
    dark: '#241310',
  },
  white: '#FFFFFF',
  black: '#000000',
  // Warm tones from design-tamem.html
  surface: '#FCF8F4',
  surfaceAlt: '#F9F2EA',
  soft: '#F7EFE7',
  line: '#F0E4DA',
  line2: '#E8D8C9',
  border: '#F0E4DA',
  danger: '#DC2626',
  dangerLight: '#FEE2E2',
  success: '#1A9F6E',
  successLight: '#E5F6EE',
  warning: '#F2A93B',
  warningLight: '#FCEFD3',
  info: '#0EA5E9',
  infoLight: '#E0F2FE',
  ink: '#2B2622',
  text: {
    primary: '#2B2622',
    secondary: '#58595B',
    muted: '#9A9088',
    onBrand: '#FFFFFF',
  },
  // Soft category tints used for chips & tiles
  category: {
    food: '#FDEAE2',
    grocery: '#FCEFD3',
    pharmacy: '#E5F6EE',
    shipping: '#E0F2FE',
    merchant: '#F3E8FF',
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
  brandSoft: ['#FFB99E', '#FDEAE2'] as const,
  goldSoft: ['#FCEFD3', '#FFFFFF'] as const,
  splash: ['#E0301E', '#C4280F', '#9A1A0A', '#241310'] as const,
  promo: ['#241310', '#3B1E16'] as const,
  promoGold: ['#F2A93B', '#EC7A2C'] as const,
  ctaDark: ['#241310', '#3B1E16'] as const,
} as const;

// 8px grid spacing
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  pill: 999,
} as const;

// Cross-platform elevation. RN-web honors boxShadow; native uses elevation.
export const shadows = {
  none: { boxShadow: 'none', elevation: 0 },
  sm: { boxShadow: '0 2px 6px rgba(36,19,16,0.06)', elevation: 2 },
  md: { boxShadow: '0 6px 16px rgba(36,19,16,0.08)', elevation: 4 },
  lg: { boxShadow: '0 14px 30px rgba(36,19,16,0.10)', elevation: 8 },
  brand: { boxShadow: '0 12px 28px rgba(224,48,30,0.28)', elevation: 8 },
  gold: { boxShadow: '0 10px 26px rgba(242,169,59,0.30)', elevation: 8 },
} as const;

export const fontSizes = {
  // Bumped xs/xxs by 1pt — Tajawal at 10-11 was rough on older readers in
  // Arabic, and the audit flagged it as the most common accessibility miss.
  xxs: 11,
  xs: 12,
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
