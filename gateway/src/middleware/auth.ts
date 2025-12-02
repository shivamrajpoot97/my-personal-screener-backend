import { Request, Response, NextFunction } from "express";
import AuthClient from "../clients/AuthClient";
import { logger } from "../../../shared";

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
    role: string;
  };
}

class AuthMiddleware {
  private authClient: AuthClient;

  constructor() {
    this.authClient = AuthClient.getInstance();
  }

  authenticate = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({
          error: "Access denied. No token provided or invalid format."
        });
      }

      const token = authHeader.substring(7);
      const result = await this.authClient.validateToken(token);

      if (!result.valid) {
        return res.status(401).json({
          error: "Invalid or expired token"
        });
      }

      req.user = {
        userId: result.userId,
        email: result.email,
        role: result.role,
      };

      next();
    } catch (error) {
      logger.error("Authentication middleware error:", error);
      return res.status(500).json({
        error: "Internal server error during authentication"
      });
    }
  };

  authorize = (allowedRoles: string[]) => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({
          error: "Access denied. User not authenticated."
        });
      }

      if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({
          error: "Access denied. Insufficient permissions."
        });
      }

      next();
    };
  };

  adminOnly = this.authorize(["admin"]);
  adminOrModerator = this.authorize(["admin", "moderator"]);

  ownerOrAdmin = (userIdParam: string = "id") => {
    return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      if (!req.user) {
        return res.status(401).json({
          error: "Access denied. User not authenticated."
        });
      }

      const resourceUserId = req.params[userIdParam];
      const isOwner = req.user.userId === resourceUserId;
      const isAdmin = req.user.role === "admin";

      if (!isOwner && !isAdmin) {
        return res.status(403).json({
          error: "Access denied. You can only access your own resources."
        });
      }

      next();
    };
  };
}

export default new AuthMiddleware();
