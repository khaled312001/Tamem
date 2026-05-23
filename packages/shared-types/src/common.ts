export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApiSuccess<T> {
  data: T;
  meta?: { pagination?: Pagination };
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    messageAr?: string;
    details?: Record<string, unknown>;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LatLng {
  lat: number;
  lng: number;
}
