import { OrderStatus } from './orderStates.js';
import { ServiceCategory } from './services.js';
import { UserRole, DriverStatus } from './roles.js';

export const PaymentMethod = {
  CASH: 'CASH',
  VODAFONE_CASH: 'VODAFONE_CASH',
  INSTAPAY: 'INSTAPAY',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];

export const PaymentStatus = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const NotificationChannel = {
  PUSH: 'PUSH',
  WHATSAPP: 'WHATSAPP',
  IN_APP: 'IN_APP',
} as const;
export type NotificationChannel = (typeof NotificationChannel)[keyof typeof NotificationChannel];

export const NotificationType = {
  ORDER_STATUS: 'ORDER_STATUS',
  PROMO: 'PROMO',
  SYSTEM: 'SYSTEM',
  ALERT: 'ALERT',
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];

export const AlertType = {
  PENDING_ORDER: 'PENDING_ORDER',
  DRIVER_NOT_RESPONDING: 'DRIVER_NOT_RESPONDING',
  CASH_LIMIT_EXCEEDED: 'CASH_LIMIT_EXCEEDED',
  COMPLAINT: 'COMPLAINT',
  PAYMENT_PENDING: 'PAYMENT_PENDING',
} as const;
export type AlertType = (typeof AlertType)[keyof typeof AlertType];

export const AlertSeverity = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL',
} as const;
export type AlertSeverity = (typeof AlertSeverity)[keyof typeof AlertSeverity];

export interface User {
  id: string;
  phone: string;
  name: string;
  email?: string;
  avatarUrl?: string;
  role: UserRole;
  isPhoneVerified: boolean;
  isActive: boolean;
  createdAt: string;
}

export interface DriverProfile {
  id: string;
  userId: string;
  status: DriverStatus;
  vehicleType: string;
  vehiclePlate: string;
  currentLat?: number;
  currentLng?: number;
  lastLocationAt?: string;
  totalDeliveries: number;
  totalEarnings: number;
  governorate: string;
  rating?: number;
}

export interface MerchantProfile {
  id: string;
  userId: string;
  storeName: string;
  storeNameAr: string;
  categoryId: string;
  description?: string;
  logoUrl?: string;
  coverUrl?: string;
  addressLine: string;
  lat: number;
  lng: number;
  governorate: string;
  city: string;
  isOpen: boolean;
  rating?: number;
}

export interface OrderPoint {
  id: string;
  sortOrder: number;
  address: string;
  lat: number;
  lng: number;
  notes?: string;
}

export interface OrderPickupPoint extends OrderPoint {
  merchantId?: string;
  label?: string;
  contactName?: string;
  contactPhone?: string;
  arrivedAt?: string;
  pickedUpAt?: string;
}

export interface OrderDeliveryPoint extends OrderPoint {
  recipientName: string;
  recipientPhone: string;
  deliveredAt?: string;
  proofImageUrl?: string;
}

export interface OrderItem {
  id: string;
  productId?: string;
  productNameSnapshot: string;
  unitPriceSnapshot?: number;
  quantity: number;
  merchantId?: string;
  pickupPointId?: string;
  notes?: string;
}

export interface OrderStatusHistoryEntry {
  id: string;
  fromStatus?: OrderStatus;
  toStatus: OrderStatus;
  changedByUserId: string;
  changedByRole: UserRole;
  reason?: string;
  createdAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  serviceId: string;
  customerId: string;
  category: ServiceCategory;
  status: OrderStatus;
  merchantId?: string;
  assignedDriverId?: string;
  customData?: Record<string, unknown>;
  notes?: string;
  imageUrls?: string[];
  pickupLat?: number;
  pickupLng?: number;
  pickupAddress?: string;
  deliveryLat?: number;
  deliveryLng?: number;
  deliveryAddress?: string;
  weightKg?: number;
  sizeCategory?: 'SMALL' | 'MEDIUM' | 'LARGE';
  isFragile?: boolean;
  speedTier?: 'STANDARD' | 'EXPRESS';
  estimatedDistanceKm?: number;
  quotedPrice?: number;
  finalPrice?: number;
  currency: string;
  paymentMethod?: PaymentMethod;
  paymentStatus: PaymentStatus;
  customerApprovedAt?: string;
  pickedUpAt?: string;
  deliveredAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  whatsappSentAt?: string;
  createdAt: string;
  updatedAt: string;
  items?: OrderItem[];
  pickupPoints?: OrderPickupPoint[];
  deliveryPoints?: OrderDeliveryPoint[];
  statusHistory?: OrderStatusHistoryEntry[];
}

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  relatedOrderId?: string;
  relatedUserId?: string;
  isResolved: boolean;
  resolvedByUserId?: string;
  resolvedAt?: string;
  resolutionNotes?: string;
  createdAt: string;
}
