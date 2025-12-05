import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import path from "path";

// Import routes
import authRoutes from "./routes/auth";
import userRoutes from "./routes/users";
import screenerRoutes from "./routes/screener";

// Import middleware
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { generalLimiter, authLimiter, createAccountLimiter } from "./middleware/rateLimiter";

// Import shared config and logger
import { logger, config } from "../../shared";

class GatewayServer {
  private app: express.Application;
  private port: number;

  constructor() {
    this.app = express();
    this.port = config.services.gateway.port;
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["self"],
          styleSrc: ["self", "unsafe-inline"],
          scriptSrc: ["self"],
          imgSrc: ["self", "data:", "https:"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }));

    // CORS configuration
    this.app.use(cors({
      origin: config.services.gateway.corsOrigin.split(",").map(origin => origin.trim()),
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
    }));

    // Body parsing middleware
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true, limit: "10mb" }));
    this.app.use(cookieParser());

    // Rate limiting
    this.app.use(generalLimiter);

    // Request logging middleware
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path} - ${req.ip}`);
      next();
    });

    // Health check endpoint (before rate limiting for monitoring)
    this.app.get("/health", (req, res) => {
      res.status(200).json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.nodeEnv,
        service: "API Gateway",
        version: "1.0.0"
      });
    });
  }

  private initializeRoutes() {
    // API routes with version prefix
    this.app.use("/api/auth/register", createAccountLimiter);
    this.app.use("/api/auth/login", authLimiter);
    this.app.use("/api/auth", authRoutes);
    this.app.use("/api/users", userRoutes);
    this.app.use("/api/screener", screenerRoutes);

    // Root endpoint
    this.app.get("/", (req, res) => {
      res.json({
        message: "Personal Screener API Gateway",
        version: "1.0.0",
        timestamp: new Date().toISOString(),
        endpoints: {
          health: "/health",
          auth: "/api/auth",
          users: "/api/users",
          screener: "/api/screener"
        }
      });
    });

    // API info endpoint
    this.app.get("/api", (req, res) => {
      res.json({
        message: "Personal Screener API",
        version: "1.0.0",
        endpoints: {
          authentication: {
            register: "POST /api/auth/register",
            login: "POST /api/auth/login",
            refresh: "POST /api/auth/refresh",
            profile: "GET /api/auth/profile",
            updateProfile: "PUT /api/auth/profile",
            logout: "POST /api/auth/logout"
          },
          users: {
            list: "GET /api/users",
            get: "GET /api/users/:id",
            update: "PUT /api/users/:id",
            delete: "DELETE /api/users/:id"
          },
          screener: {
            wyckoff: "GET /api/screener/wyckoff?timeframe=1day&confidence=70&limit=100",
            customScan: "POST /api/screener/scan",
            filters: "GET /api/screener/filters",
            health: "GET /api/screener/health"
          }
        }
      });
    });
  }

  private initializeErrorHandling() {
    // 404 handler
    this.app.use(notFoundHandler);

    // Global error handler
    this.app.use(errorHandler);
  }

  public start() {
    return new Promise<void>((resolve) => {
      this.app.listen(this.port, () => {
        logger.info(`Gateway server started on port ${this.port}`);
        logger.info(`Environment: ${config.nodeEnv}`);
        logger.info(`CORS Origin: ${config.services.gateway.corsOrigin}`);
        resolve();
      });
    });
  }

  public getApp() {
    return this.app;
  }
}

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception:", error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Rejection at:", promise, "reason:", reason);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info("SIGINT received, shutting down gracefully");
  process.exit(0);
});

// Start the gateway server
const gateway = new GatewayServer();
gateway.start().catch((error) => {
  logger.error("Failed to start gateway server:", error);
  process.exit(1);
});
