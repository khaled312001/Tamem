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

  // ===== Auth =====
  async login(phone: string, password: string): Promise<{ user: User; tokens: AuthTokens }> {
    return this.request({ method: 'POST', url: '/auth/login', data: { phone, password } });
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    return this.request({ method: 'POST', url: '/auth/refresh', data: { refreshToken } });
  }

  async me(): Promise<User> {
    return this.request({ method: 'GET', url: '/me' });
  }

  // ===== Services =====
  async listServices(): Promise<Service[]> {
    return this.request({ method: 'GET', url: '/services' });
  }

  async getService(id: string): Promise<Service> {
    return this.request({ method: 'GET', url: `/services/${id}` });
  }

  // ===== Orders =====
  async listMyOrders(params?: { status?: string; page?: number }): Promise<Order[]> {
    return this.request({ method: 'GET', url: '/orders/mine', params });
  }

  async getOrder(id: string): Promise<Order> {
    return this.request({ method: 'GET', url: `/orders/${id}` });
  }

  async createOrder(payload: unknown): Promise<Order> {
    return this.request({ method: 'POST', url: '/orders', data: payload });
  }

  // ===== Admin =====
  async adminListOrders(
    params?: Record<string, unknown>,
  ): Promise<{ orders: Order[]; total: number }> {
    return this.request({ method: 'GET', url: '/admin/orders', params });
  }

  async adminSetPrice(orderId: string, quotedPrice: number): Promise<Order> {
    return this.request({
      method: 'PATCH',
      url: `/admin/orders/${orderId}/price`,
      data: { quotedPrice },
    });
  }

  async adminAssignDriver(orderId: string, driverId: string): Promise<Order> {
    return this.request({
      method: 'PATCH',
      url: `/admin/orders/${orderId}/assign-driver`,
      data: { driverId },
    });
  }

  // Raw escape hatch
  get raw(): AxiosInstance {
    return this.http;
  }
}

export { TamemClient as default };
export type { AuthTokens, Order, Service, User };
