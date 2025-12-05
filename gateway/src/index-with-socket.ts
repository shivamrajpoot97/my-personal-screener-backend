import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
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

// Import Socket.IO handlers
import { ScreenerSocketHandler } from "./socket/screenerSocket";

class GatewayServer {
  private app: express.Application;
  private httpServer: any;
  private io: SocketIOServer;
  private port: number;
  private screenerSocketHandler: ScreenerSocketHandler;

  constructor() {
    this.app = express();
    this.httpServer = createServer(this.app);
    this.port = config.services.gateway.port;
    
    // Initialize Socket.IO
    this.io = new SocketIOServer(this.httpServer, {
      cors: {
        origin: config.services.gateway.corsOrigin.split(",").map(origin => origin.trim()),
        methods: ["GET", "POST"],
        credentials: true
      },
      pingTimeout: 60000,
      pingInterval: 25000,
      transports: ['websocket', 'polling']
    });

    this.screenerSocketHandler = new ScreenerSocketHandler(this.io);
    
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "ws:", "wss:"] // Allow WebSocket connections
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

    // Health check endpoint
    this.app.get("/health", (req, res) => {
      res.status(200).json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.nodeEnv,
        service: "API Gateway with Socket.IO",
        version: "2.0.0",
        socketIO: {
          connected: this.io.engine.clientsCount,
          transports: ['websocket', 'polling']
        }
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
        message: "Personal Screener API Gateway with Socket.IO",
        version: "2.0.0",
        timestamp: new Date().toISOString(),
        endpoints: {
          health: "/health",
          auth: "/api/auth",
          users: "/api/users",
          screener: "/api/screener",
          socketIO: "ws://localhost:" + this.port
        },
        socketIO: {
          enabled: true,
          events: {
            screener: [
              "screener:wyckoff",
              "screener:scan",
              "screener:cancel"
            ],
            responses: [
              "screener:started",
              "screener:progress",
              "screener:chunk",
              "screener:results",
              "screener:completed",
              "screener:error"
            ]
          }
        }
      });
    });

    // API info endpoint
    this.app.get("/api", (req, res) => {
      res.json({
        message: "Personal Screener API",
        version: "2.0.0",
        socketIO: {
          enabled: true,
          url: `ws://localhost:${this.port}`,
          documentation: "/socket-docs"
        },
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

    // Socket.IO documentation endpoint
    this.app.get("/socket-docs", (req, res) => {
      res.json({
        title: "Socket.IO Documentation",
        connectionUrl: `ws://localhost:${this.port}`,
        events: {
          client_to_server: {
            "screener:wyckoff": {
              description: "Perform Wyckoff phase analysis",
              payload: {
                timeframe: "string (15min|1hour|1day)",
                confidence: "string (0-100)",
                limit: "string (max results)"
              },
              example: {
                timeframe: "1day",
                confidence: "70",
                limit: "100"
              }
            },
            "screener:scan": {
              description: "Perform custom stock scan",
              payload: {
                filters: "object (scan criteria)",
                timeframe: "string",
                limit: "number"
              },
              example: {
                filters: {
                  wyckoffPhase: "Phase D (Markup)"
                },
                timeframe: "1day",
                limit: 50
              }
            },
            "screener:cancel": {
              description: "Cancel ongoing scan",
              payload: "none"
            }
          },
          server_to_client: {
            "screener:started": {
              description: "Scan has started",
              payload: {
                message: "string",
                timeframe: "string",
                filters: "object"
              }
            },
            "screener:progress": {
              description: "Progress update during scan",
              payload: {
                loaded: "number (bytes)",
                total: "number (bytes)",
                percentage: "number (0-100)"
              }
            },
            "screener:chunk": {
              description: "Partial results (streaming)",
              payload: {
                data: "array (stock results)",
                index: "number",
                total: "number"
              }
            },
            "screener:results": {
              description: "Final results",
              payload: {
                success: "boolean",
                results: "array",
                count: "number",
                executionTime: "string"
              }
            },
            "screener:completed": {
              description: "Scan completed successfully",
              payload: {
                message: "string",
                resultCount: "number",
                executionTime: "string"
              }
            },
            "screener:error": {
              description: "Error occurred during scan",
              payload: {
                error: "string",
                message: "string",
                code: "string"
              }
            },
            "screener:cancelled": {
              description: "Scan was cancelled",
              payload: {
                message: "string"
              }
            }
          }
        },
        example_client_code: {
          javascript: `
const socket = io('http://localhost:${this.port}');

// Listen for events
socket.on('screener:started', (data) => {
  console.log('Scan started:', data);
});

socket.on('screener:progress', (data) => {
  console.log('Progress:', data);
});

socket.on('screener:results', (data) => {
  console.log('Results:', data);
});

socket.on('screener:error', (data) => {
  console.error('Error:', data);
});

// Emit scan request
socket.emit('screener:wyckoff', {
  timeframe: '1day',
  confidence: '70',
  limit: '100'
});
          `
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
      this.httpServer.listen(this.port, () => {
        logger.info(`🚀 Gateway server with Socket.IO started on port ${this.port}`);
        logger.info(`📡 WebSocket endpoint: ws://localhost:${this.port}`);
        logger.info(`🌍 HTTP endpoint: http://localhost:${this.port}`);
        logger.info(`📚 Socket.IO docs: http://localhost:${this.port}/socket-docs`);
        logger.info(`Environment: ${config.nodeEnv}`);
        logger.info(`CORS Origin: ${config.services.gateway.corsOrigin}`);
        resolve();
      });
    });
  }

  public getApp() {
    return this.app;
  }

  public getIO() {
    return this.io;
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
