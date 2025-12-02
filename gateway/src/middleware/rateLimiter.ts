import rateLimit from "express-rate-limit";
import { Request, Response } from "express";
import { logger, config } from "../../../shared";

// General rate limiting
export const generalLimiter = rateLimit({
  windowMs: config.security.rateLimitWindowMs,
  max: config.security.rateLimitMaxRequests,
  message: {
    error: "Too many requests from this IP, please try again later."
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: "Too many requests from this IP, please try again later."
    });
  }
});

// Strict rate limiting for auth endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per windowMs
  message: {
    error: "Too many authentication attempts, please try again later."
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Do not count successful requests
  handler: (req: Request, res: Response) => {
    logger.warn(`Auth rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: "Too many authentication attempts, please try again later."
    });
  }
});

// Create account rate limiting
export const createAccountLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 account creation attempts per hour
  message: {
    error: "Too many accounts created from this IP, please try again later."
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    logger.warn(`Create account rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: "Too many accounts created from this IP, please try again later."
    });
  }
});
