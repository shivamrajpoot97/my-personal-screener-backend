import mongoose from "mongoose";
import { logger } from "../utils/logger";

// Import all shared models to register them
import "../models";

class SharedDatabase {
  private static instance: SharedDatabase;
  private isConnected: boolean = false;

  private constructor() {}

  public static getInstance(): SharedDatabase {
    if (!SharedDatabase.instance) {
      SharedDatabase.instance = new SharedDatabase();
    }
    return SharedDatabase.instance;
  }

  public async connect(connectionName?: string): Promise<void> {
    if (this.isConnected) {
      logger.info(`Already connected to MongoDB (${connectionName || "default"})`);
      return;
    }

    try {
      const mongoUri = process.env.MONGODB_URI;
      if (!mongoUri) {
        throw new Error("MONGODB_URI is not defined in environment variables");
      }

      await mongoose.connect(mongoUri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });

      this.isConnected = true;
      logger.info(`Connected to MongoDB successfully (${connectionName || "default"})`);

      mongoose.connection.on("error", (error) => {
        logger.error(`MongoDB connection error (${connectionName || "default"}):`, error);
        this.isConnected = false;
      });

      mongoose.connection.on("disconnected", () => {
        logger.warn(`MongoDB disconnected (${connectionName || "default"})`);
        this.isConnected = false;
      });

    } catch (error) {
      logger.error(`Failed to connect to MongoDB (${connectionName || "default"}):`, error);
      this.isConnected = false;
      throw error;
    }
  }

  public async disconnect(connectionName?: string): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      await mongoose.disconnect();
      this.isConnected = false;
      logger.info(`Disconnected from MongoDB (${connectionName || "default"})`);
    } catch (error) {
      logger.error(`Error disconnecting from MongoDB (${connectionName || "default"}):`, error);
    }
  }

  public getConnectionStatus(): boolean {
    return this.isConnected;
  }

  public getConnection() {
    return mongoose.connection;
  }
}

export default SharedDatabase;
