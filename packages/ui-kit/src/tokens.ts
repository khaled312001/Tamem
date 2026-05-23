/**
 * Tamem brand design tokens — single source of truth for colors, typography, spacing.
 * Mirrored in apps/mobile/src/theme/ (since React Native styling diverges from web).
 */

export const colors = {
  brand: {
    red: '#E0301E',
    orange: '#EC7A2C',
    gold: '#F2A93B',
    gray: '#58595B',
    dark: '#241310',
  },
  neutral: {
    50: '#FAFAF9',
    100: '#F5F5F4',
    200: '#E7E5E4',
    300: '#D6D3D1',
    400: '#A8A29E',
    500: '#78716C',
    600: '#57534E',
    700: '#44403C',
    800: '#292524',
    900: '#1C1917',
  },
  semantic: {
    success: '#16A34A',
    warning: '#F59E0B',
    danger: '#DC2626',
    info: '#2563EB',
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

export const fonts = {
  heading: 'Cairo, system-ui, sans-serif',
  body: 'Tajawal, system-ui, sans-serif',
} as const;

export const fontWeights = {
  regular: '400',
  semibold: '600',
  bold: '700',
  extrabold: '800',
  black: '900',
} as const;

export const radii = {
  none: '0',
  sm: '0.25rem',
  md: '0.5rem',
  lg: '0.75rem',
  xl: '1rem',
  '2xl': '1.5rem',
  full: '9999px',
} as const;

export const spacing = {
  0: '0',
  1: '0.25rem',
  2: '0.5rem',
  3: '0.75rem',
  4: '1rem',
  5: '1.25rem',
  6: '1.5rem',
  8: '2rem',
  10: '2.5rem',
  12: '3rem',
  16: '4rem',
  20: '5rem',
} as const;

export const shadows = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
} as const;
