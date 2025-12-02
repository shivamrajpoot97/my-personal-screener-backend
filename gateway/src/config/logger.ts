import winston from "winston";

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
  winston.format.printf(
    (info) => `${info.timestamp} [${info.level}]: ${info.message}`
  )
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: logFormat,
  transports: [
    new winston.transports.Console({
      format: consoleFormat,
    }),
    new winston.transports.File({
      filename: "logs/gateway-error.log",
      level: "error",
    }),
    new winston.transports.File({
      filename: "logs/gateway-combined.log",
    }),
  ],
});

// Create logs directory if it does not exist
import { mkdirSync } from "fs";
try {
  mkdirSync("logs", { recursive: true });
} catch (error) {
  // Directory already exists or cannot be created
}

// Configuration object
export const config = {
  port: parseInt(process.env.GATEWAY_PORT || "3002"),
  nodeEnv: process.env.NODE_ENV || "development",
  authServiceUrl: process.env.AUTH_SERVICE_URL || "localhost:50051",
  jwtSecret: process.env.JWT_SECRET || "fallback-secret",
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3002",
  rateLimiting: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000"),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100"),
  },
};
