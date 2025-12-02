import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";
import { AuthController } from "./controllers/AuthController";
import { logger, config } from "../../../shared";

const PROTO_PATH = path.join(__dirname, "proto/auth.proto");

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const authProto = grpc.loadPackageDefinition(packageDefinition).auth as any;

class AuthGrpcServer {
  private server: grpc.Server;
  private authController: AuthController;
  private port: string;

  constructor() {
    this.server = new grpc.Server();
    this.authController = new AuthController();
    this.port = config.services.auth.port.toString();
    this.initializeServices();
  }

  private initializeServices() {
    this.server.addService(authProto.AuthService.service, {
      Register: this.register.bind(this),
      Login: this.login.bind(this),
      ValidateToken: this.validateToken.bind(this),
      RefreshToken: this.refreshToken.bind(this),
      GetUserById: this.getUserById.bind(this),
      UpdateUser: this.updateUser.bind(this),
      GetAllUsers: this.getAllUsers.bind(this),
      DeleteUser: this.deleteUser.bind(this),
    });
  }

  private async register(call: any, callback: any) {
    try {
      const { email, password, name, role } = call.request;
      const result = await this.authController.register(email, password, name, role);
      callback(null, result);
    } catch (error) {
      logger.error("gRPC Register error:", error);
      callback({
        code: grpc.status.INTERNAL,
        details: "Internal server error",
      });
    }
  }

  private async login(call: any, callback: any) {
    try {
      console.log("Login gRPC called");
      const { email, password } = call.request;
      const result = await this.authController.login(email, password);
      callback(null, result);
    } catch (error) {
      logger.error("gRPC Login error:", error);
      callback({
        code: grpc.status.INTERNAL,
        details: "Internal server error",
      });
    }
  }

  private async validateToken(call: any, callback: any) {
    try {
      const { token } = call.request;
      const result = await this.authController.validateToken(token);
      callback(null, result);
    } catch (error) {
      logger.error("gRPC ValidateToken error:", error);
      callback({
        code: grpc.status.INTERNAL,
        details: "Internal server error",
      });
    }
  }

  private async refreshToken(call: any, callback: any) {
    try {
      const { refreshToken } = call.request;
      const result = await this.authController.refreshToken(refreshToken);
      callback(null, result);
    } catch (error) {
      logger.error("gRPC RefreshToken error:", error);
      callback({
        code: grpc.status.INTERNAL,
        details: "Internal server error",
      });
    }
  }

  private async getUserById(call: any, callback: any) {
    try {
      const { userId } = call.request;
      const result = await this.authController.getUserById(userId);
      callback(null, result);
    } catch (error) {
      logger.error("gRPC GetUserById error:", error);
      callback({
        code: grpc.status.INTERNAL,
        details: "Internal server error",
      });
    }
  }

  private async updateUser(call: any, callback: any) {
    try {
      const { userId, ...updates } = call.request;
      const result = await this.authController.updateUser(userId, updates);
      callback(null, result);
    } catch (error) {
      logger.error("gRPC UpdateUser error:", error);
      callback({
        code: grpc.status.INTERNAL,
        details: "Internal server error",
      });
    }
  }

  private async getAllUsers(call: any, callback: any) {
    try {
      const { page, limit, role, isActive } = call.request;
      const result = await this.authController.getAllUsers(page, limit, role, isActive);
      callback(null, result);
    } catch (error) {
      logger.error("gRPC GetAllUsers error:", error);
      callback({
        code: grpc.status.INTERNAL,
        details: "Internal server error",
      });
    }
  }

  private async deleteUser(call: any, callback: any) {
    try {
      const { userId } = call.request;
      const result = await this.authController.deleteUser(userId);
      callback(null, result);
    } catch (error) {
      logger.error("gRPC DeleteUser error:", error);
      callback({
        code: grpc.status.INTERNAL,
        details: "Internal server error",
      });
    }
  }

  public start() {
    return new Promise<void>((resolve, reject) => {
      this.server.bindAsync(
        `0.0.0.0:${this.port}`,
        grpc.ServerCredentials.createInsecure(),
        (error, port) => {
          if (error) {
            logger.error("Failed to bind gRPC server:", error);
            reject(error);
            return;
          }

          this.server.start();
          logger.info(`Auth gRPC server started on port ${port}`);
          resolve();
        }
      );
    });
  }

  public stop() {
    return new Promise<void>((resolve) => {
      this.server.tryShutdown((error) => {
        if (error) {
          logger.error("Error stopping gRPC server:", error);
        } else {
          logger.info("Auth gRPC server stopped");
        }
        resolve();
      });
    });
  }
}

export default AuthGrpcServer;
