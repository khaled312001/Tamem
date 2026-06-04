/**
 * Tamem design system tokens.
 * Warm off-white surface, brand red/gold accents, dark navy ink — same
 * palette as design-tamem.html but extended for full production use.
 *
 * Spacing: 8px grid. Radii: generous but not playful. Shadows: subtle.
 *
 * Token hierarchy:
 *   colors.brand.red    → keep for legacy code
 *   colors.brand.red500 → preferred (use 50/100/200/.../900 scale)
 *   palette.red.500     → semantic alias (same value, clearer intent)
 */

// Full numeric scales let us tint, shade, hover, and disabled-state any
// brand color without inventing one-off hex codes per screen.
export const palette = {
  red: {
    50: '#FDEAE2',
    100: '#FBD5C5',
    200: '#F6A691',
    300: '#F1755B',
    400: '#EC4A30',
    500: '#E0301E',
    600: '#C4280F',
    700: '#B82414',
    800: '#8A1A0A',
    900: '#5C1107',
  },
  orange: {
    50: '#FDEAD9',
    100: '#FBD2AE',
    200: '#F7B27A',
    300: '#F19452',
    400: '#EC7A2C',
    500: '#D96A1F',
    600: '#B85614',
    700: '#92420D',
    800: '#6E3209',
    900: '#4A2106',
  },
  gold: {
    50: '#FCEFD3',
    100: '#F9E0A7',
    200: '#F5CC74',
    300: '#F4BA51',
    400: '#F2A93B',
    500: '#E0962A',
    600: '#B97A1E',
    700: '#915E16',
    800: '#69430F',
    900: '#412A09',
  },
  green: {
    50: '#E5F6EE',
    100: '#C6EBD8',
    200: '#90D7B3',
    300: '#5BC28E',
    400: '#33B077',
    500: '#1A9F6E',
    600: '#157A52',
    700: '#0F5A3D',
    800: '#0A4029',
    900: '#062A1B',
  },
  red_danger: {
    50: '#FEE2E2',
    100: '#FECACA',
    200: '#FCA5A5',
    300: '#F87171',
    400: '#EF4444',
    500: '#DC2626',
    600: '#B91C1C',
    700: '#991B1B',
    800: '#7F1D1D',
    900: '#5B1313',
  },
  blue: {
    50: '#E0F2FE',
    100: '#BAE6FD',
    200: '#7DD3FC',
    300: '#38BDF8',
    400: '#0EA5E9',
    500: '#0284C7',
    600: '#0369A1',
    700: '#075985',
    800: '#0C4A6E',
    900: '#082F49',
  },
  gray: {
    0: '#FFFFFF',
    25: '#FCF8F4',
    50: '#F9F2EA',
    100: '#F7EFE7',
    200: '#F0E4DA',
    300: '#E8D8C9',
    400: '#C8B8A9',
    500: '#9A9088',
    600: '#7A716A',
    700: '#58595B',
    800: '#3A2E28',
    900: '#241310',
    950: '#0E0707',
  },
} as const;

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
    inverse: '#FFFFFF',
    placeholder: '#C8B8A9',
    disabled: '#9A9088',
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
  // Alpha overlays for press states, scrims, hovers
  alpha: {
    black04: 'rgba(36,19,16,0.04)',
    black08: 'rgba(36,19,16,0.08)',
    black12: 'rgba(36,19,16,0.12)',
    black24: 'rgba(36,19,16,0.24)',
    black40: 'rgba(36,19,16,0.40)',
    black60: 'rgba(36,19,16,0.60)',
    white12: 'rgba(255,255,255,0.12)',
    white24: 'rgba(255,255,255,0.24)',
    white40: 'rgba(255,255,255,0.40)',
    brandPress: 'rgba(224,48,30,0.12)',
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
  none: 0,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  xxxl: 36,
  pill: 999,
} as const;

// Cross-platform elevation. RN-web honors boxShadow; native uses elevation.
// Five-step scale modeled on Material 3 + iOS HIG so designers can think in
// levels (1=card, 2=raised card, 3=menu, 4=modal, 5=tooltip).
export const shadows = {
  none: { boxShadow: 'none', elevation: 0 },
  // Level 1 — at-rest card on warm surface
  sm: { boxShadow: '0 2px 6px rgba(36,19,16,0.06)', elevation: 2 },
  // Level 2 — hover, pressed, FAB at rest
  md: { boxShadow: '0 6px 16px rgba(36,19,16,0.08)', elevation: 4 },
  // Level 3 — bottom sheet handle, dropdown menu
  lg: { boxShadow: '0 14px 30px rgba(36,19,16,0.10)', elevation: 8 },
  // Level 4 — modal, dialog
  xl: { boxShadow: '0 22px 44px rgba(36,19,16,0.14)', elevation: 16 },
  // Level 5 — tooltip, toast
  xxl: { boxShadow: '0 28px 56px rgba(36,19,16,0.18)', elevation: 24 },
  // Colored shadows for branded CTAs
  brand: { boxShadow: '0 12px 28px rgba(224,48,30,0.28)', elevation: 8 },
  gold: { boxShadow: '0 10px 26px rgba(242,169,59,0.30)', elevation: 8 },
  success: { boxShadow: '0 10px 26px rgba(26,159,110,0.28)', elevation: 8 },
} as const;

// Hit-target sizes — never make an interactive element smaller than `min`.
// Apple HIG says 44pt minimum; Material says 48dp. We match the larger.
export const hitSlop = {
  sm: { top: 8, bottom: 8, left: 8, right: 8 },
  md: { top: 12, bottom: 12, left: 12, right: 12 },
  lg: { top: 16, bottom: 16, left: 16, right: 16 },
} as const;

export const sizes = {
  tap: { min: 44, comfortable: 48 },
  icon: { xs: 14, sm: 16, md: 20, lg: 24, xl: 28, xxl: 36 },
  avatar: { xs: 24, sm: 32, md: 40, lg: 56, xl: 72, xxl: 96 },
  fab: { sm: 48, md: 56, lg: 64 },
  control: { sm: 36, md: 44, lg: 52 }, // input / button heights
} as const;

// Animation tokens — fps-friendly durations and easings.
export const motion = {
  duration: {
    instant: 100,
    fast: 180,
    base: 240,
    slow: 320,
    slower: 480,
  },
  // RN doesn't accept CSS easing strings on native — these are bezier curves
  // ready to be turned into Easing.bezier(...) by the consumer.
  easing: {
    standard: [0.4, 0.0, 0.2, 1] as const,
    decel: [0.0, 0.0, 0.2, 1] as const,
    accel: [0.4, 0.0, 1, 1] as const,
    spring: [0.34, 1.56, 0.64, 1] as const, // soft overshoot
  },
  spring: {
    soft: { damping: 16, stiffness: 140, mass: 1 },
    snappy: { damping: 18, stiffness: 220, mass: 1 },
    bouncy: { damping: 10, stiffness: 180, mass: 0.9 },
  },
} as const;

// z-index scale — keep modals above sheets above headers above content.
export const zIndex = {
  base: 0,
  raised: 1,
  sticky: 10,
  header: 20,
  drawer: 30,
  sheet: 40,
  modal: 50,
  toast: 60,
  tooltip: 70,
  debug: 999,
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

/**
 * Typography presets — opinionated text styles ready to spread into a Text
 * component. Saves us from inventing fontSize/lineHeight/fontFamily triples
 * on every screen.
 *
 *   <Text style={[typography.h2, { color: colors.ink }]}>طلبك جاهز</Text>
 *
 * Naming follows the editorial scale: display > h1 > h2 > h3 > title >
 * body > caption > overline. Each preset bundles size + lineHeight +
 * family so the result is a complete style.
 */
export const typography = {
  display: {
    fontSize: 34,
    lineHeight: 42,
    fontFamily: fontFamilies.headingDisplay,
    includeFontPadding: false,
  },
  h1: {
    fontSize: 28,
    lineHeight: 36,
    fontFamily: fontFamilies.headingBlack,
    includeFontPadding: false,
  },
  h2: {
    fontSize: 22,
    lineHeight: 30,
    fontFamily: fontFamilies.headingBlack,
    includeFontPadding: false,
  },
  h3: {
    fontSize: 18,
    lineHeight: 26,
    fontFamily: fontFamilies.headingBold,
    includeFontPadding: false,
  },
  title: {
    fontSize: 16,
    lineHeight: 22,
    fontFamily: fontFamilies.bodyExtraBold,
    includeFontPadding: false,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fontFamilies.body,
    includeFontPadding: false,
  },
  bodyBold: {
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fontFamilies.bodyBold,
    includeFontPadding: false,
  },
  small: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fontFamilies.body,
    includeFontPadding: false,
  },
  smallBold: {
    fontSize: 13,
    lineHeight: 18,
    fontFamily: fontFamilies.bodyBold,
    includeFontPadding: false,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fontFamilies.body,
    includeFontPadding: false,
  },
  captionBold: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fontFamilies.bodyBold,
    includeFontPadding: false,
  },
  overline: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: fontFamilies.bodyExtraBold,
    letterSpacing: 0.6,
    includeFontPadding: false,
  },
  button: {
    fontSize: 15,
    lineHeight: 20,
    fontFamily: fontFamilies.bodyExtraBold,
    includeFontPadding: false,
  },
} as const;
