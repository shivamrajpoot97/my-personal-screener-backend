import { SharedDatabase, logger } from "../../../shared";
import AuthGrpcServer from "./server";

class AuthService {
  private grpcServer: AuthGrpcServer;
  private database: SharedDatabase;

  constructor() {
    this.grpcServer = new AuthGrpcServer();
    this.database = SharedDatabase.getInstance();
  }

  async start() {
    try {
      // Connect to database
      await this.database.connect("AuthService");
      
      // Start gRPC server
      await this.grpcServer.start();
      
      logger.info("Auth Service started successfully");
    } catch (error) {
      logger.error("Failed to start Auth Service:", error);
      process.exit(1);
    }
  }

  async stop() {
    try {
      await this.grpcServer.stop();
      await this.database.disconnect("AuthService");
      logger.info("Auth Service stopped successfully");
    } catch (error) {
      logger.error("Error stopping Auth Service:", error);
    }
  }
}

// Handle process termination
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down gracefully");
  await authService.stop();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("SIGINT received, shutting down gracefully");
  await authService.stop();
  process.exit(0);
});

// Start the service
const authService = new AuthService();
authService.start().catch((error) => {
  logger.error("Unhandled error in Auth Service:", error);
  process.exit(1);
});
