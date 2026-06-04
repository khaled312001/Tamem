import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';

import type { ApiError, ApiSuccess, AuthTokens, Order, Service, User } from '@tamem/types';

export interface TamemClientConfig {
  baseURL: string;
  getAccessToken?: () => string | null | Promise<string | null>;
  onRefreshNeeded?: () => Promise<AuthTokens | null>;
  onUnauthorized?: () => void;
  timeout?: number;
}

export class TamemApiError extends Error {
  readonly code: string;
  readonly messageAr?: string;
  readonly details?: Record<string, unknown>;
  readonly status: number;

  constructor(status: number, payload: ApiError['error']) {
    super(payload.message);
    this.name = 'TamemApiError';
    this.code = payload.code;
    this.messageAr = payload.messageAr;
    this.details = payload.details;
    this.status = status;
  }
}

export interface Paginated<T> {
  items: T[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export class TamemClient {
  private readonly http: AxiosInstance;
  private readonly config: TamemClientConfig;
  private refreshPromise: Promise<AuthTokens | null> | null = null;

  constructor(config: TamemClientConfig) {
    this.config = config;
    this.http = axios.create({
      baseURL: config.baseURL,
      timeout: config.timeout ?? 30_000,
      headers: { 'Content-Type': 'application/json' },
    });
    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    this.http.interceptors.request.use(async (req) => {
      const getToken = this.config.getAccessToken;
      if (getToken) {
        const token = await getToken();
        if (token) req.headers.Authorization = `Bearer ${token}`;
      }
      return req;
    });

    this.http.interceptors.response.use(
      (res) => res,
      async (error) => {
        const status = error.response?.status as number | undefined;
        const original = error.config as AxiosRequestConfig & { _retry?: boolean };

        if (status === 401 && !original._retry && this.config.onRefreshNeeded) {
          original._retry = true;
          this.refreshPromise ??= this.config.onRefreshNeeded();
          const newTokens = await this.refreshPromise;
          this.refreshPromise = null;

          if (newTokens) {
            original.headers = original.headers ?? {};
            (original.headers as Record<string, string>).Authorization =
              `Bearer ${newTokens.accessToken}`;
            return this.http.request(original);
          }
          this.config.onUnauthorized?.();
        }

        if (error.response?.data?.error) {
          throw new TamemApiError(status ?? 500, error.response.data.error);
        }
        throw error;
      },
    );
  }

  private async request<T>(config: AxiosRequestConfig): Promise<T> {
    const res = await this.http.request<ApiSuccess<T>>(config);
    return res.data.data;
  }

  private async requestPaginated<T>(config: AxiosRequestConfig): Promise<Paginated<T>> {
    const res = await this.http.request<{
      data: T[];
      meta: { pagination: { page: number; pageSize: number; total: number; totalPages: number } };
    }>(config);
    return { items: res.data.data, pagination: res.data.meta.pagination };
  }

  // ===== Auth =====
  async login(phone: string, password: string): Promise<{ user: User; tokens: AuthTokens }> {
    return this.request({ method: 'POST', url: '/auth/login', data: { phone, password } });
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    return this.request({ method: 'POST', url: '/auth/refresh', data: { refreshToken } });
  }

  async logout(refreshToken: string): Promise<void> {
    await this.http.request({ method: 'POST', url: '/auth/logout', data: { refreshToken } });
  }

  /** Start the forgot-password flow; backend sends a code to the user's phone. */
  async forgotPassword(phone: string): Promise<{ sent: boolean; debugCode?: string }> {
    return this.request({
      method: 'POST',
      url: '/auth/forgot-password',
      data: { phone },
    });
  }

  async resetPassword(
    phone: string,
    code: string,
    newPassword: string,
  ): Promise<{ user: User; tokens: AuthTokens }> {
    return this.request({
      method: 'POST',
      url: '/auth/reset-password',
      data: { phone, code, newPassword },
    });
  }

  // ===== Coupons + Wallet (customer) =====
  async validateCoupon(
    code: string,
    orderAmount: number,
  ): Promise<{
    valid: boolean;
    reason?: string;
    discount?: number;
    type?: 'PERCENTAGE' | 'FLAT';
    finalAmount?: number;
  }> {
    return this.request({
      method: 'POST',
      url: '/coupons/validate',
      data: { code, orderAmount },
    });
  }
  async getMyWallet(): Promise<{
    wallet: {
      id: string;
      balance: string | number;
      totalEarned: string | number;
      totalSpent: string | number;
    };
    transactions: Array<{
      id: string;
      type: string;
      amount: string | number;
      balanceAfter: string | number;
      reason?: string | null;
      createdAt: string;
      orderId?: string | null;
    }>;
  }> {
    return this.request({ method: 'GET', url: '/me/wallet' });
  }

  // ===== Admin: Coupons + Wallet + Manual order + Refund =====
  async adminListCoupons(): Promise<unknown[]> {
    return this.request({ method: 'GET', url: '/admin/coupons' });
  }
  async adminCreateCoupon(data: unknown): Promise<unknown> {
    return this.request({ method: 'POST', url: '/admin/coupons', data });
  }
  async adminUpdateCoupon(id: string, data: unknown): Promise<unknown> {
    return this.request({ method: 'PATCH', url: `/admin/coupons/${id}`, data });
  }
  async adminDeleteCoupon(id: string): Promise<void> {
    await this.http.request({ method: 'DELETE', url: `/admin/coupons/${id}` });
  }
  async adminAdjustWallet(
    userId: string,
    payload: { amount: number; type?: 'MANUAL_CREDIT' | 'MANUAL_DEBIT'; reason: string },
  ): Promise<unknown> {
    return this.request({
      method: 'POST',
      url: `/admin/wallets/${userId}/credit`,
      data: payload,
    });
  }
  async adminCreateManualOrder(data: {
    customerId?: string;
    customerPhone?: string;
    customerName?: string;
    serviceId: string;
    deliveryAddress: string;
    deliveryLat?: number;
    deliveryLng?: number;
    notes?: string;
    quotedPrice?: number;
    paymentMethod?: 'CASH' | 'VODAFONE_CASH' | 'INSTAPAY';
  }): Promise<Order> {
    return this.request({ method: 'POST', url: '/admin/orders', data });
  }
  async adminGetOrderTimeline(id: string): Promise<unknown[]> {
    return this.request({ method: 'GET', url: `/admin/orders/${id}/timeline` });
  }
  async adminRefundPayment(
    id: string,
    payload: { amount: number; reason: string; creditToWallet?: boolean },
  ): Promise<unknown> {
    return this.request({ method: 'PATCH', url: `/admin/payments/${id}/refund`, data: payload });
  }

  async submitReview(
    orderId: string,
    payload: { rating: number; driverRating?: number; merchantRating?: number; comment?: string },
  ): Promise<unknown> {
    return this.request({
      method: 'POST',
      url: `/orders/${orderId}/review`,
      data: payload,
    });
  }

  async me(): Promise<User> {
    return this.request({ method: 'GET', url: '/me' });
  }

  async updateMe(
    data: Partial<Pick<User, 'name' | 'email' | 'phone'>> & Record<string, unknown>,
  ): Promise<User> {
    return this.request({ method: 'PATCH', url: '/me', data });
  }

  async changePassword(
    currentPassword: string,
    newPassword: string,
  ): Promise<{ changed: boolean }> {
    return this.request({
      method: 'POST',
      url: '/me/change-password',
      data: { currentPassword, newPassword },
    });
  }

  // ===== Services (public) =====
  async listServices(): Promise<Service[]> {
    return this.request({ method: 'GET', url: '/services' });
  }

  async getService(id: string): Promise<Service> {
    return this.request({ method: 'GET', url: `/services/${id}` });
  }

  // ===== Categories (public) =====
  async listCategories(): Promise<unknown[]> {
    return this.request({ method: 'GET', url: '/categories' });
  }

  // ===== Merchants (public) =====
  async listMerchants(params?: Record<string, unknown>): Promise<unknown[]> {
    return this.request({ method: 'GET', url: '/merchants', params });
  }

  // ===== Customer Orders =====
  async listMyOrders(params?: { status?: string; page?: number }): Promise<Order[]> {
    return this.request({ method: 'GET', url: '/orders/mine', params });
  }

  async getOrder(id: string): Promise<Order> {
    return this.request({ method: 'GET', url: `/orders/${id}` });
  }

  async createOrder(payload: unknown): Promise<Order> {
    return this.request({ method: 'POST', url: '/orders', data: payload });
  }

  async reorderFromExisting(sourceOrderId: string): Promise<Order> {
    return this.request({ method: 'POST', url: `/orders/from/${sourceOrderId}` });
  }

  // ===== Customer Addresses =====
  async listMyAddresses(): Promise<unknown[]> {
    return this.request({ method: 'GET', url: '/me/addresses' });
  }
  async createMyAddress(data: {
    label: string;
    address: string;
    lat?: number;
    lng?: number;
    notes?: string;
    isDefault?: boolean;
  }): Promise<unknown> {
    return this.request({ method: 'POST', url: '/me/addresses', data });
  }
  async updateMyAddress(
    id: string,
    data: Partial<{
      label: string;
      address: string;
      lat: number;
      lng: number;
      notes: string;
      isDefault: boolean;
    }>,
  ): Promise<unknown> {
    return this.request({ method: 'PATCH', url: `/me/addresses/${id}`, data });
  }
  async deleteMyAddress(id: string): Promise<void> {
    await this.http.request({ method: 'DELETE', url: `/me/addresses/${id}` });
  }

  // ===== Admin Overview =====
  async adminOverview(range: 'today' | 'week' | 'month' = 'week'): Promise<unknown> {
    return this.request({ method: 'GET', url: '/admin/overview', params: { range } });
  }

  // ===== Admin Orders =====
  async adminListOrders(params?: Record<string, unknown>): Promise<Paginated<Order>> {
    return this.requestPaginated({ method: 'GET', url: '/admin/orders', params });
  }

  async adminGetOrder(id: string): Promise<Order> {
    return this.request({ method: 'GET', url: `/admin/orders/${id}` });
  }

  async adminUpdateOrderStatus(id: string, status: string, reason?: string): Promise<Order> {
    return this.request({
      method: 'PATCH',
      url: `/admin/orders/${id}/status`,
      data: { status, reason },
    });
  }

  async adminSetPrice(orderId: string, quotedPrice: number, note?: string): Promise<Order> {
    return this.request({
      method: 'PATCH',
      url: `/admin/orders/${orderId}/price`,
      data: { quotedPrice, note },
    });
  }

  async adminAssignDriver(orderId: string, driverId: string): Promise<Order> {
    return this.request({
      method: 'PATCH',
      url: `/admin/orders/${orderId}/assign-driver`,
      data: { driverId },
    });
  }

  async adminAddOrderNote(orderId: string, note: string): Promise<unknown> {
    return this.request({
      method: 'POST',
      url: `/admin/orders/${orderId}/note`,
      data: { note },
    });
  }

  async adminCancelOrder(orderId: string, reason: string): Promise<Order> {
    return this.request({
      method: 'POST',
      url: `/admin/orders/${orderId}/cancel`,
      data: { reason },
    });
  }

  /** Bulk status flip — partial success allowed; check `failed[]` in result. */
  async adminBulkOrderStatus(
    ids: string[],
    status: string,
    reason?: string,
  ): Promise<{ succeeded: string[]; failed: { id: string; reason: string }[] }> {
    return this.request({
      method: 'POST',
      url: '/admin/orders/bulk-status',
      data: { ids, status, reason },
    });
  }

  // ===== Admin Services =====
  async adminListServices(): Promise<unknown[]> {
    return this.request({ method: 'GET', url: '/admin/services' });
  }
  async adminGetService(id: string): Promise<unknown> {
    return this.request({ method: 'GET', url: `/admin/services/${id}` });
  }
  async adminCreateService(data: unknown): Promise<unknown> {
    return this.request({ method: 'POST', url: '/admin/services', data });
  }
  async adminUpdateService(id: string, data: unknown): Promise<unknown> {
    return this.request({ method: 'PATCH', url: `/admin/services/${id}`, data });
  }
  async adminDeleteService(id: string): Promise<void> {
    await this.http.request({
      method: 'DELETE',
      url: `/admin/services/${id}`,
    });
  }
  async adminDuplicateService(id: string): Promise<unknown> {
    return this.request({ method: 'POST', url: `/admin/services/${id}/duplicate` });
  }
  async adminAddServiceField(id: string, data: unknown): Promise<unknown> {
    return this.request({ method: 'POST', url: `/admin/services/${id}/fields`, data });
  }
  async adminUpdateServiceField(id: string, fieldId: string, data: unknown): Promise<unknown> {
    return this.request({
      method: 'PATCH',
      url: `/admin/services/${id}/fields/${fieldId}`,
      data,
    });
  }
  async adminDeleteServiceField(id: string, fieldId: string): Promise<void> {
    await this.http.request({
      method: 'DELETE',
      url: `/admin/services/${id}/fields/${fieldId}`,
    });
  }
  async adminReorderServiceFields(id: string, fieldIds: string[]): Promise<unknown> {
    return this.request({
      method: 'PATCH',
      url: `/admin/services/${id}/fields/reorder`,
      data: { fieldIds },
    });
  }

  // ===== Admin Drivers =====
  async adminListDrivers(params?: Record<string, unknown>): Promise<Paginated<unknown>> {
    return this.requestPaginated({ method: 'GET', url: '/admin/drivers', params });
  }
  async adminCreateDriver(data: unknown): Promise<unknown> {
    return this.request({ method: 'POST', url: '/admin/drivers', data });
  }
  async adminUpdateDriver(id: string, data: unknown): Promise<unknown> {
    return this.request({ method: 'PATCH', url: `/admin/drivers/${id}`, data });
  }
  async adminUpdateDriverStatus(
    id: string,
    status: 'AVAILABLE' | 'BUSY' | 'OFFLINE',
  ): Promise<unknown> {
    return this.request({
      method: 'PATCH',
      url: `/admin/drivers/${id}/status`,
      data: { status },
    });
  }
  async adminDeleteDriver(id: string): Promise<void> {
    await this.http.request({ method: 'DELETE', url: `/admin/drivers/${id}` });
  }

  // ===== Admin Merchants =====
  async adminListMerchants(params?: Record<string, unknown>): Promise<Paginated<unknown>> {
    return this.requestPaginated({ method: 'GET', url: '/admin/merchants', params });
  }
  async adminCreateMerchant(data: unknown): Promise<unknown> {
    return this.request({ method: 'POST', url: '/admin/merchants', data });
  }
  async adminUpdateMerchant(id: string, data: unknown): Promise<unknown> {
    return this.request({ method: 'PATCH', url: `/admin/merchants/${id}`, data });
  }
  async adminDeleteMerchant(id: string): Promise<void> {
    await this.http.request({ method: 'DELETE', url: `/admin/merchants/${id}` });
  }

  // ===== Admin Customers =====
  async adminListCustomers(params?: Record<string, unknown>): Promise<Paginated<unknown>> {
    return this.requestPaginated({ method: 'GET', url: '/admin/customers', params });
  }
  async adminGetCustomer(id: string): Promise<unknown> {
    return this.request({ method: 'GET', url: `/admin/customers/${id}` });
  }

  // ===== Admin Products =====
  async adminListProducts(params?: Record<string, unknown>): Promise<Paginated<unknown>> {
    return this.requestPaginated({ method: 'GET', url: '/admin/products', params });
  }
  async adminCreateProduct(data: unknown): Promise<unknown> {
    return this.request({ method: 'POST', url: '/admin/products', data });
  }
  async adminUpdateProduct(id: string, data: unknown): Promise<unknown> {
    return this.request({ method: 'PATCH', url: `/admin/products/${id}`, data });
  }
  async adminDeleteProduct(id: string): Promise<void> {
    await this.http.request({ method: 'DELETE', url: `/admin/products/${id}` });
  }
  async adminBulkProductAvailability(ids: string[], isAvailable: boolean): Promise<unknown> {
    return this.request({
      method: 'POST',
      url: '/admin/products/bulk-availability',
      data: { ids, isAvailable },
    });
  }

  // ===== Admin Pricing Rules =====
  async adminListPricingRules(params?: Record<string, unknown>): Promise<unknown[]> {
    return this.request({ method: 'GET', url: '/admin/pricing-rules', params });
  }
  async adminCreatePricingRule(data: unknown): Promise<unknown> {
    return this.request({ method: 'POST', url: '/admin/pricing-rules', data });
  }
  async adminUpdatePricingRule(id: string, data: unknown): Promise<unknown> {
    return this.request({ method: 'PATCH', url: `/admin/pricing-rules/${id}`, data });
  }
  async adminDeletePricingRule(id: string): Promise<void> {
    await this.http.request({ method: 'DELETE', url: `/admin/pricing-rules/${id}` });
  }

  // ===== Admin Payments =====
  async adminListPayments(params?: Record<string, unknown>): Promise<Paginated<unknown>> {
    return this.requestPaginated({ method: 'GET', url: '/admin/payments', params });
  }
  async adminConfirmPayment(id: string): Promise<unknown> {
    return this.request({ method: 'PATCH', url: `/admin/payments/${id}/confirm` });
  }
  async adminRejectPayment(id: string, reason: string): Promise<unknown> {
    return this.request({
      method: 'PATCH',
      url: `/admin/payments/${id}/reject`,
      data: { reason },
    });
  }

  // ===== Admin Alerts =====
  // Returns BOTH the alerts array and the meta.stats object the alerts center uses.
  async adminListAlerts(params?: Record<string, unknown>): Promise<{
    alerts: unknown[];
    stats?: { critical: number; high: number; medium: number; low: number; resolvedToday: number };
  }> {
    const res = await this.http.request<{
      data: unknown[];
      meta?: {
        stats: {
          critical: number;
          high: number;
          medium: number;
          low: number;
          resolvedToday: number;
        };
      };
    }>({ method: 'GET', url: '/admin/alerts', params });
    return { alerts: res.data.data, stats: res.data.meta?.stats };
  }
  async adminResolveAlert(id: string, note: string): Promise<unknown> {
    return this.request({
      method: 'PATCH',
      url: `/admin/alerts/${id}/resolve`,
      data: { note },
    });
  }

  // ===== Admin WhatsApp bridge =====
  async adminWhatsAppStatus(): Promise<{
    status: 'disconnected' | 'qr' | 'connecting' | 'connected';
    qrDataUrl: string | null;
    phone: string | null;
    startedAt: number | null;
    lastError: string | null;
  }> {
    return this.request({ method: 'GET', url: '/admin/whatsapp/status' });
  }
  async adminWhatsAppStart(): Promise<unknown> {
    return this.request({ method: 'POST', url: '/admin/whatsapp/start' });
  }
  async adminWhatsAppStop(): Promise<unknown> {
    return this.request({ method: 'POST', url: '/admin/whatsapp/stop' });
  }
  async adminWhatsAppSendTest(phone: string, message: string): Promise<{ sent: boolean }> {
    return this.request({
      method: 'POST',
      url: '/admin/whatsapp/send-test',
      data: { phone, message },
    });
  }

  // ===== Admin Payment Gateway (EasyKash) =====
  async adminGatewayStatus(): Promise<{
    gateway: 'easykash';
    configured: boolean;
    paymentOptions: number[];
    keys: {
      apiKey: string | null;
      hmacSecret: string | null;
    };
  }> {
    return this.request({ method: 'GET', url: '/admin/payments/gateway' });
  }
  async adminGatewayTest(): Promise<{
    ok: boolean;
    reason?: string;
    message?: string;
    preview?: string;
  }> {
    return this.request({ method: 'POST', url: '/admin/payments/gateway/test' });
  }
  async adminGatewaySave(input: {
    apiKey?: string;
    hmacSecret?: string;
    paymentOptions?: number[];
  }): Promise<{ saved: boolean }> {
    return this.request({ method: 'PUT', url: '/admin/payments/gateway', data: input });
  }

  // ===== Admin Reports =====
  async adminReportRevenue(params?: Record<string, unknown>): Promise<unknown> {
    return this.request({ method: 'GET', url: '/admin/reports/revenue', params });
  }
  async adminReportServices(): Promise<unknown[]> {
    return this.request({ method: 'GET', url: '/admin/reports/services' });
  }
  async adminReportDrivers(): Promise<unknown[]> {
    return this.request({ method: 'GET', url: '/admin/reports/drivers' });
  }
  async adminReportCustomers(): Promise<unknown[]> {
    return this.request({ method: 'GET', url: '/admin/reports/customers' });
  }

  // ===== Admin Settings =====
  async adminListSettings(): Promise<unknown[]> {
    return this.request({ method: 'GET', url: '/admin/settings' });
  }
  async adminGetSetting(key: string): Promise<unknown> {
    return this.request({ method: 'GET', url: `/admin/settings/${key}` });
  }
  async adminUpsertSetting(key: string, value: unknown, description?: string): Promise<unknown> {
    return this.request({
      method: 'PUT',
      url: `/admin/settings/${key}`,
      data: { value, description },
    });
  }
  async adminBulkUpsertSettings(
    items: Array<{ key: string; value: unknown; description?: string }>,
  ): Promise<unknown> {
    return this.request({ method: 'POST', url: '/admin/settings/bulk', data: { items } });
  }

  // ===== Admin Categories =====
  async adminListCategories(): Promise<unknown[]> {
    return this.request({ method: 'GET', url: '/admin/categories' });
  }
  async adminCreateCategory(data: unknown): Promise<unknown> {
    return this.request({ method: 'POST', url: '/admin/categories', data });
  }
  async adminUpdateCategory(id: string, data: unknown): Promise<unknown> {
    return this.request({ method: 'PATCH', url: `/admin/categories/${id}`, data });
  }
  async adminDeleteCategory(id: string): Promise<void> {
    await this.http.request({ method: 'DELETE', url: `/admin/categories/${id}` });
  }

  // ===== Admin Offers =====
  async adminListOffers(): Promise<unknown[]> {
    return this.request({ method: 'GET', url: '/admin/offers' });
  }
  async adminCreateOffer(data: unknown): Promise<unknown> {
    return this.request({ method: 'POST', url: '/admin/offers', data });
  }
  async adminUpdateOffer(id: string, data: unknown): Promise<unknown> {
    return this.request({ method: 'PATCH', url: `/admin/offers/${id}`, data });
  }
  async adminDeleteOffer(id: string): Promise<void> {
    await this.http.request({ method: 'DELETE', url: `/admin/offers/${id}` });
  }

  // ===== Home Config (admin-editable mobile home screen) =====
  async getHomeConfig(): Promise<unknown> {
    return this.request({ method: 'GET', url: '/home-config' });
  }
  async adminGetHomeConfig(): Promise<unknown> {
    return this.request({ method: 'GET', url: '/admin/home-config' });
  }
  async adminUpdateHomeConfig(data: unknown): Promise<unknown> {
    return this.request({ method: 'PATCH', url: '/admin/home-config', data });
  }

  // Raw escape hatch
  get raw(): AxiosInstance {
    return this.http;
  }
}

export { TamemClient as default };
export type { AuthTokens, Order, Service, User };
