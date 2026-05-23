export const UserRole = {
  CUSTOMER: 'CUSTOMER',
  DRIVER: 'DRIVER',
  MERCHANT: 'MERCHANT',
  ADMIN: 'ADMIN',
} as const;

export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const DriverStatus = {
  AVAILABLE: 'AVAILABLE',
  BUSY: 'BUSY',
  OFFLINE: 'OFFLINE',
} as const;

export type DriverStatus = (typeof DriverStatus)[keyof typeof DriverStatus];
