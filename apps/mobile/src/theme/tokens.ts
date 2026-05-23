/**
 * Mobile theme tokens — mirror of packages/ui-kit/src/tokens.ts.
 * React Native styling diverges from web Tailwind enough that we duplicate
 * rather than maintain a universal abstraction.
 */

export const colors = {
  brand: {
    red: '#E0301E',
    orange: '#EC7A2C',
    gold: '#F2A93B',
    gray: '#58595B',
    dark: '#241310',
  },
  white: '#FFFFFF',
  black: '#000000',
  surface: '#FAFAF9',
  border: '#E7E5E4',
  text: {
    primary: '#241310',
    secondary: '#57534E',
    muted: '#A8A29E',
    onBrand: '#FFFFFF',
  },
  status: {
    NEW: '#3B82F6',
    UNDER_REVIEW: '#8B5CF6',
    PRICED: '#0EA5E9',
    AWAITING_CUSTOMER_APPROVAL: '#EAB308',
    ACCEPTED: '#10B981',
    DRIVER_ASSIGNED: '#06B6D4',
    PICKED_UP: '#14B8A6',
    IN_ROUTE: '#F59E0B',
    DELIVERED: '#22C55E',
    COMPLETED: '#16A34A',
    CANCELLED: '#71717A',
    REJECTED: '#EF4444',
  },
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

export const fontFamilies = {
  heading: 'Cairo',
  body: 'Tajawal',
} as const;

export const fontWeights = {
  regular: '400',
  semibold: '600',
  bold: '700',
  extrabold: '800',
  black: '900',
} as const;
