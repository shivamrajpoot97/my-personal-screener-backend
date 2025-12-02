import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import path from "path";
import { config, logger } from "../../../shared";

const PROTO_PATH = path.join(__dirname, "../../../services/auth/src/proto/auth.proto");

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const authProto = grpc.loadPackageDefinition(packageDefinition).auth as any;

class AuthClient {
  private client: any;
  private static instance: AuthClient;

  private constructor() {
    this.client = new authProto.AuthService(
      config.services.auth.url,
      grpc.credentials.createInsecure()
    );
  }

  public static getInstance(): AuthClient {
    if (!AuthClient.instance) {
      AuthClient.instance = new AuthClient();
    }
    return AuthClient.instance;
  }

  async register(email: string, password: string, name: string, role?: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client.Register(
        { email, password, name, role: role || "user" },
        (error: any, response: any) => {
          if (error) {
            logger.error("Auth gRPC Register error:", error);
            reject(error);
            return;
          }
          resolve(response);
        }
      );
    });
  }

  async login(email: string, password: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client.Login({ email, password }, (error: any, response: any) => {
        if (error) {
          logger.error("Auth gRPC Login error:", error);
          reject(error);
          return;
        }
        resolve(response);
      });
    });
  }

  async validateToken(token: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client.ValidateToken({ token }, (error: any, response: any) => {
        if (error) {
          logger.error("Auth gRPC ValidateToken error:", error);
          reject(error);
          return;
        }
        resolve(response);
      });
    });
  }

  async refreshToken(refreshToken: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client.RefreshToken(
        { refreshToken },
        (error: any, response: any) => {
          if (error) {
            logger.error("Auth gRPC RefreshToken error:", error);
            reject(error);
            return;
          }
          resolve(response);
        }
      );
    });
  }

  async getUserById(userId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client.GetUserById({ userId }, (error: any, response: any) => {
        if (error) {
          logger.error("Auth gRPC GetUserById error:", error);
          reject(error);
          return;
        }
        resolve(response);
      });
    });
  }

  async updateUser(
    userId: string,
    updates: {
      name?: string;
      role?: string;
      isActive?: boolean;
      accessAllowed?: boolean;
      upstoxAccessToken?: string;
      upstoxRefreshToken?: string;
    }
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client.UpdateUser(
        { userId, ...updates },
        (error: any, response: any) => {
          if (error) {
            logger.error("Auth gRPC UpdateUser error:", error);
            reject(error);
            return;
          }
          resolve(response);
        }
      );
    });
  }

  async getAllUsers(
    page: number = 1,
    limit: number = 10,
    role?: string,
    isActive?: boolean
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client.GetAllUsers(
        { page, limit, role, isActive },
        (error: any, response: any) => {
          if (error) {
            logger.error("Auth gRPC GetAllUsers error:", error);
            reject(error);
            return;
          }
          resolve(response);
        }
      );
    });
  }

  async deleteUser(userId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client.DeleteUser({ userId }, (error: any, response: any) => {
        if (error) {
          logger.error("Auth gRPC DeleteUser error:", error);
          reject(error);
          return;
        }
        resolve(response);
      });
    });
  }

  // Health check method
  async healthCheck(): Promise<boolean> {
    try {
      // Use a simple validation call to check if service is alive
      await this.validateToken("dummy-token");
      return true;
    } catch (error) {
      return false;
    }
  }
}

export default AuthClient;
