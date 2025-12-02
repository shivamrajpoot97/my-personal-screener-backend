import { Router, Request, Response } from "express";
import AuthClient from "../clients/AuthClient";
import authMiddleware, { AuthenticatedRequest } from "../middleware/auth";
import { logger, config } from "../../../shared";

const router = Router();
const authClient = AuthClient.getInstance();

// Input validation helper
const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const validatePassword = (password: string): string | null => {
  if (!password || password.length < 6) {
    return "Password must be at least 6 characters long";
  }
  return null;
};

// POST /api/auth/register
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { email, password, name, role } = req.body;

    // Validate required fields
    if (!email || !password || !name) {
      return res.status(400).json({
        error: "Email, password, and name are required"
      });
    }

    // Validate email format
    if (!validateEmail(email)) {
      return res.status(400).json({
        error: "Invalid email format"
      });
    }

    // Validate password
    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({
        error: passwordError
      });
    }

    // Validate name
    if (name.trim().length < 2) {
      return res.status(400).json({
        error: "Name must be at least 2 characters long"
      });
    }

    // Call auth service
    const result = await authClient.register(email.trim(), password, name.trim(), role);

    if (!result.success) {
      return res.status(400).json({
        error: result.message
      });
    }

    // Set HTTP-only cookie for refresh token
    res.cookie("refreshToken", result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    res.status(201).json({
      message: result.message,
      accessToken: result.accessToken,
      user: result.user
    });
  } catch (error) {
    logger.error("Register route error:", error);
    res.status(500).json({
      error: "Internal server error"
    });
  }
});

// POST /api/auth/login
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required"
      });
    }

    // Validate email format
    if (!validateEmail(email)) {
      return res.status(400).json({
        error: "Invalid email format"
      });
    }

    // Call auth service
    const result = await authClient.login(email.trim(), password);

    if (!result.success) {
      // Check if it's an access denied message (account not approved)
      const isAccountPending = result.message.includes("pending approval") || result.message.includes("contact the administrator");
      const statusCode = isAccountPending ? 403 : 401; // 403 for forbidden (pending approval), 401 for unauthorized
      
      return res.status(statusCode).json({
        error: result.message,
        code: isAccountPending ? "ACCOUNT_PENDING_APPROVAL" : "INVALID_CREDENTIALS"
      });
    }

    // Set HTTP-only cookie for refresh token
    res.cookie("refreshToken", result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    res.json({
      message: result.message,
      accessToken: result.accessToken,
      user: result.user
    });
  } catch (error) {
    logger.error("Login route error:", error);
    res.status(500).json({
      error: "Internal server error"
    });
  }
});

// POST /api/auth/refresh
router.post("/refresh", async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        error: "Refresh token is required"
      });
    }

    // Call auth service
    const result = await authClient.refreshToken(refreshToken);

    if (!result.success) {
      return res.status(401).json({
        error: result.message
      });
    }

    // Update HTTP-only cookie for new refresh token
    res.cookie("refreshToken", result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    res.json({
      message: result.message,
      accessToken: result.accessToken,
      user: result.user
    });
  } catch (error) {
    logger.error("Refresh token route error:", error);
    res.status(500).json({
      error: "Internal server error"
    });
  }
});

// GET /api/auth/profile
router.get("/profile", authMiddleware.authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: "User not authenticated"
      });
    }

    // Get user details from auth service
    const result = await authClient.getUserById(req.user.userId);

    if (!result.success) {
      return res.status(404).json({
        error: result.message
      });
    }

    res.json({
      message: "Profile retrieved successfully",
      user: result.user
    });
  } catch (error) {
    logger.error("Get profile route error:", error);
    res.status(500).json({
      error: "Internal server error"
    });
  }
});

// PUT /api/auth/profile
router.put("/profile", authMiddleware.authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        error: "User not authenticated"
      });
    }

    const { name, upstoxAccessToken, upstoxRefreshToken } = req.body;
    const updates: any = {};

    // Only allow users to update their own profile fields
    if (name !== undefined) {
      if (name.trim().length < 2) {
        return res.status(400).json({
          error: "Name must be at least 2 characters long"
        });
      }
      updates.name = name.trim();
    }

    if (upstoxAccessToken !== undefined) {
      updates.upstoxAccessToken = upstoxAccessToken;
    }

    if (upstoxRefreshToken !== undefined) {
      updates.upstoxRefreshToken = upstoxRefreshToken;
    }

    // Call auth service
    const result = await authClient.updateUser(req.user.userId, updates);

    if (!result.success) {
      return res.status(400).json({
        error: result.message
      });
    }

    res.json({
      message: result.message,
      user: result.user
    });
  } catch (error) {
    logger.error("Update profile route error:", error);
    res.status(500).json({
      error: "Internal server error"
    });
  }
});

// POST /api/auth/logout
router.post("/logout", (req: Request, res: Response) => {
  try {
    // Clear the refresh token cookie
    res.clearCookie("refreshToken");
    
    res.json({
      message: "Logged out successfully"
    });
  } catch (error) {
    logger.error("Logout route error:", error);
    res.status(500).json({
      error: "Internal server error"
    });
  }
});

export default router;
