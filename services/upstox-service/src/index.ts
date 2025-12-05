import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { logger } from '@shared/utils/logger';
import { SharedDatabase } from '@shared/database';
import { config } from '@shared/config';
import upstoxRoutes, { historicalSyncService } from './routes/upstoxRoutes';

const app = express();
// Default port changed from 3002 to 3004
const PORT = process.env.UPSTOX_SERVICE_PORT || 3004;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: config.services.gateway.corsOrigin,
  credentials: true
}));

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.security.rateLimitWindowMs,
  max: config.security.rateLimitMaxRequests,
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString()
  });
  next();
});

// Routes
app.use('/api/upstox', upstoxRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Upstox Service is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: config.nodeEnv
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl
  });
});

// Global error handler
app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error:', error);
  
  res.status(error.status || 500).json({
    success: false,
    message: error.message || 'Internal server error',
    ...(config.isDevelopment() && { stack: error.stack })
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  // Stop scheduled sync
  historicalSyncService.forceStopSync();
  
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  
  // Stop scheduled sync
  historicalSyncService.forceStopSync();
  
  process.exit(0);
});

// Start server
async function startServer() {
  try {
    // Connect to database
    let db = SharedDatabase.getInstance();
    await db.getConnection();
    logger.info('Connected to MongoDB');
    
    // Start scheduled sync
    historicalSyncService.startScheduledSync();
    logger.info('Historical sync scheduler started');
    
    // Start HTTP server
    app.listen(PORT, () => {
      logger.info(`Upstox Service running on port ${PORT}`);
      logger.info(`Health check available at http://localhost:${PORT}/health`);
      logger.info(`API endpoints available at http://localhost:${PORT}/api/upstox`);
    });
    
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

startServer();