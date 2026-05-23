export const ServiceCategory = {
  DELIVERY: 'DELIVERY',
  SHIPPING: 'SHIPPING',
  MERCHANT: 'MERCHANT',
} as const;

export type ServiceCategory = (typeof ServiceCategory)[keyof typeof ServiceCategory];

export const PricingMethod = {
  FIXED: 'FIXED',
  DISTANCE: 'DISTANCE',
  WEIGHT: 'WEIGHT',
  DISTANCE_WEIGHT: 'DISTANCE_WEIGHT',
  QUOTE: 'QUOTE',
} as const;

export type PricingMethod = (typeof PricingMethod)[keyof typeof PricingMethod];

export const ServiceFieldType = {
  TEXT: 'TEXT',
  TEXTAREA: 'TEXTAREA',
  NUMBER: 'NUMBER',
  SELECT: 'SELECT',
  MULTISELECT: 'MULTISELECT',
  IMAGE: 'IMAGE',
  LOCATION: 'LOCATION',
  DATE: 'DATE',
  TIME: 'TIME',
  BOOLEAN: 'BOOLEAN',
  PHONE: 'PHONE',
} as const;

export type ServiceFieldType = (typeof ServiceFieldType)[keyof typeof ServiceFieldType];

export interface ServiceFieldValidation {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  regex?: string;
  maxImages?: number;
}

export interface ServiceFieldOption {
  value: string;
  label: string;
  labelAr: string;
}

export interface ServiceField {
  id: string;
  serviceId: string;
  key: string;
  label: string;
  labelAr: string;
  type: ServiceFieldType;
  isRequired: boolean;
  sortOrder: number;
  options?: ServiceFieldOption[];
  validation?: ServiceFieldValidation;
  placeholder?: string;
  placeholderAr?: string;
  helpText?: string;
  helpTextAr?: string;
}

export interface Service {
  id: string;
  key: string;
  name: string;
  nameAr: string;
  category: ServiceCategory;
  imageUrl?: string;
  iconUrl?: string;
  description?: string;
  descriptionAr?: string;
  pricingMethod: PricingMethod;
  basePrice?: number;
  pricePerKm?: number;
  pricePerKg?: number;
  requiresPickupLocation: boolean;
  requiresDeliveryLocation: boolean;
  requiresImageUpload: boolean;
  allowsTextNote: boolean;
  supportsMultiplePickups: boolean;
  supportsMultipleDeliveries: boolean;
  sortOrder: number;
  isActive: boolean;
  fields?: ServiceField[];
}
