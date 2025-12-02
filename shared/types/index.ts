// User related types
export interface IUserBase {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin" | "moderator";
  isActive: boolean;
  accessAllowed: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IUserWithTokens extends IUserBase {
  upstoxAccessToken?: string;
  upstoxRefreshToken?: string;
}

// Authentication response types
export interface IAuthResponse {
  success: boolean;
  message: string;
  accessToken?: string;
  refreshToken?: string;
  user?: IUserBase;
}

export interface ITokenValidationResponse {
  valid: boolean;
  userId?: string;
  email?: string;
  role?: string;
  message?: string;
}

// API Response types
export interface IApiResponse<T = any> {
  success: boolean;
  message: string;
  data?: T;
  error?: string;
  code?: string;
}

export interface IPaginatedResponse<T = any> extends IApiResponse<T[]> {
  pagination?: {
    total: number;
    page: number;
    totalPages: number;
    limit: number;
  };
}

// gRPC service types
export interface IRegisterRequest {
  email: string;
  password: string;
  name: string;
  role?: string;
}

export interface ILoginRequest {
  email: string;
  password: string;
}

export interface IValidateTokenRequest {
  token: string;
}

export interface IRefreshTokenRequest {
  refreshToken: string;
}

export interface IGetUserRequest {
  userId: string;
}

export interface IUpdateUserRequest {
  userId: string;
  name?: string;
  role?: string;
  isActive?: boolean;
  accessAllowed?: boolean;
  upstoxAccessToken?: string;
  upstoxRefreshToken?: string;
}

export interface IGetAllUsersRequest {
  page?: number;
  limit?: number;
  role?: string;
  isActive?: boolean;
}

export interface IDeleteUserRequest {
  userId: string;
}

// Error types
export interface IAppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
  code?: string;
}

// Service health check
export interface IHealthCheck {
  status: "healthy" | "unhealthy";
  timestamp: string;
  uptime: number;
  environment: string;
  service: string;
  version: string;
}

// Database connection status
export interface IConnectionStatus {
  connected: boolean;
  readyState: number;
  host?: string;
  port?: number;
  name?: string;
}
