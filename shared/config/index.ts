import dotenv from "dotenv";
import path from "path";

// Load environment variables from root .env file
dotenv.config({ path: path.join(__dirname, "../../.env") });

export const config = {
  // Database Configuration
  database: {
    uri: process.env.MONGODB_URI || "mongodb://localhost:27017/personal-screener",
    options: {
      maxPoolSize: parseInt(process.env.DB_MAX_POOL_SIZE || "10"),
      serverSelectionTimeoutMS: parseInt(process.env.DB_SERVER_SELECTION_TIMEOUT || "5000"),
      socketTimeoutMS: parseInt(process.env.DB_SOCKET_TIMEOUT || "45000"),
    }
  },

  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET || "fallback-secret-change-in-production",
    accessTokenExpiry: process.env.JWT_EXPIRES_IN || "7d",
    refreshTokenExpiry: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
  },

  // Security Configuration
  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || "12"),
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000"),
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100"),
  },

  // Redis Configuration
  redis: {
    url: process.env.REDIS_URL || "redis://localhost:6379",
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || "0"),
  },

  // Service Ports
  services: {
    gateway: {
      port: parseInt(process.env.GATEWAY_PORT || "3000"),
      corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
    },
    auth: {
      port: parseInt(process.env.AUTH_SERVICE_PORT || "50051"),
      url: process.env.AUTH_SERVICE_URL || "localhost:50051",
    },
    candle: {
      port: parseInt(process.env.CANDLE_SERVICE_PORT || "3001"),
      url: process.env.CANDLE_SERVICE_URL || "http://localhost:3001",
    },
    upstox: {
      port: parseInt(process.env.UPSTOX_SERVICE_PORT || "3002"),
      url: process.env.UPSTOX_SERVICE_URL || "http://localhost:3002",
    }
  },

  // Upstox Configuration
  upstox: {
    apiKey: process.env.UPSTOX_API_KEY || "",
    apiSecret: process.env.UPSTOX_API_SECRET || "",
    redirectUri: process.env.UPSTOX_REDIRECT_URI || "http://localhost:3000/api/auth/upstox/callback",
    baseUrl: process.env.UPSTOX_BASE_URL || "https://api.upstox.com/v2",
    wsUrl: process.env.UPSTOX_WS_URL || "wss://ws.upstox.com/v2/feed",
  },

  // Environment
  nodeEnv: process.env.NODE_ENV || "development",
  logLevel: process.env.LOG_LEVEL || "info",

  // Helper functions
  isDevelopment: () => process.env.NODE_ENV === "development",
  isProduction: () => process.env.NODE_ENV === "production",
  isTest: () => process.env.NODE_ENV === "test",
};
