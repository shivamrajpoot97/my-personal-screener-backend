import { Router, Response } from "express";
import AuthClient from "../clients/AuthClient";
import authMiddleware, { AuthenticatedRequest } from "../middleware/auth";
import { logger } from "../../../shared";

const router = Router();
const authClient = AuthClient.getInstance();

// Apply authentication to all user routes
router.use(authMiddleware.authenticate);

// GET /api/users/pending - Get users pending approval (Admin only)
router.get("/pending", authMiddleware.adminOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);

    // Get users who are active but not approved
    const result = await authClient.getAllUsers(page, limit, undefined, true);

    if (!result.success) {
      return res.status(400).json({
        error: result.message
      });
    }

    // Filter for pending users (isActive: true, accessAllowed: false)
    const pendingUsers = result.users.filter(user => user.isActive && !user.accessAllowed);

    res.json({
      message: "Pending users retrieved successfully",
      users: pendingUsers,
      count: pendingUsers.length,
      pagination: {
        total: pendingUsers.length,
        page: result.page,
        totalPages: Math.ceil(pendingUsers.length / limit),
        limit
      }
    });
  } catch (error) {
    logger.error("Get pending users route error:", error);
    res.status(500).json({
      error: "Internal server error"
    });
  }
});

// PATCH /api/users/:id/approve - Approve a user (Admin only)
router.patch("/:id/approve", authMiddleware.adminOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    // Update user to set accessAllowed: true
    const result = await authClient.updateUser(id, {
      accessAllowed: true
    });

    if (!result.success) {
      return res.status(400).json({
        error: result.message
      });
    }

    logger.info(`User approved by admin: ${req.user?.email} approved user ID: ${id}`);

    res.json({
      message: "User approved successfully",
      user: result.user
    });
  } catch (error) {
    logger.error("Approve user route error:", error);
    res.status(500).json({
      error: "Internal server error"
    });
  }
});

// PATCH /api/users/:id/reject - Reject/Revoke user access (Admin only)
router.patch("/:id/reject", authMiddleware.adminOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    // Update user to set accessAllowed: false
    const result = await authClient.updateUser(id, {
      accessAllowed: false
    });

    if (!result.success) {
      return res.status(400).json({
        error: result.message
      });
    }

    logger.info(`User access revoked by admin: ${req.user?.email} revoked access for user ID: ${id}. Reason: ${reason || 'No reason provided'}`);

    res.json({
      message: "User access revoked successfully",
      user: result.user
    });
  } catch (error) {
    logger.error("Reject user route error:", error);
    res.status(500).json({
      error: "Internal server error"
    });
  }
});

// GET /api/users - Get all users (Admin only)
router.get("/", authMiddleware.adminOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100); // Max 100 per page
    const role = req.query.role as string;
    const isActive = req.query.isActive ? req.query.isActive === "true" : undefined;

    const result = await authClient.getAllUsers(page, limit, role, isActive);

    if (!result.success) {
      return res.status(400).json({
        error: result.message
      });
    }

    res.json({
      message: result.message,
      users: result.users,
      pagination: {
        total: result.total,
        page: result.page,
        totalPages: result.totalPages,
        limit
      }
    });
  } catch (error) {
    logger.error("Get all users route error:", error);
    res.status(500).json({
      error: "Internal server error"
    });
  }
});

// GET /api/users/:id - Get user by ID (Admin or own profile)
router.get("/:id", authMiddleware.ownerOrAdmin("id"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const result = await authClient.getUserById(id);

    if (!result.success) {
      return res.status(404).json({
        error: result.message
      });
    }

    res.json({
      message: result.message,
      user: result.user
    });
  } catch (error) {
    logger.error("Get user by ID route error:", error);
    res.status(500).json({
      error: "Internal server error"
    });
  }
});

// PUT /api/users/:id - Update user (Admin or own profile with restrictions)
router.put("/:id", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { name, role, isActive, accessAllowed, upstoxAccessToken, upstoxRefreshToken } = req.body;

    if (!req.user) {
      return res.status(401).json({
        error: "User not authenticated"
      });
    }

    const isOwner = req.user.userId === id;
    const isAdmin = req.user.role === "admin";

    // Check permissions
    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        error: "Access denied. You can only update your own profile."
      });
    }

    const updates: any = {};

    // Users can update their own name and upstox tokens
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

    // Only admins can update role, isActive, and accessAllowed
    if (isAdmin) {
      if (role !== undefined) {
        if (!["user", "admin", "moderator"].includes(role)) {
          return res.status(400).json({
            error: "Invalid role. Must be user, admin, or moderator"
          });
        }
        updates.role = role;
      }

      if (isActive !== undefined) {
        updates.isActive = Boolean(isActive);
      }

      if (accessAllowed !== undefined) {
        updates.accessAllowed = Boolean(accessAllowed);
      }
    }

    // Prevent self-demotion (admin cannot remove their own admin role)
    if (isOwner && isAdmin && role && role !== "admin") {
      return res.status(400).json({
        error: "You cannot remove your own admin privileges"
      });
    }

    // Call auth service
    const result = await authClient.updateUser(id, updates);

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
    logger.error("Update user route error:", error);
    res.status(500).json({
      error: "Internal server error"
    });
  }
});

// DELETE /api/users/:id - Delete user (Admin only, cannot delete self)
router.delete("/:id", authMiddleware.adminOnly, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    if (!req.user) {
      return res.status(401).json({
        error: "User not authenticated"
      });
    }

    // Prevent self-deletion
    if (req.user.userId === id) {
      return res.status(400).json({
        error: "You cannot delete your own account"
      });
    }

    const result = await authClient.deleteUser(id);

    if (!result.success) {
      return res.status(400).json({
        error: result.message
      });
    }

    res.json({
      message: result.message
    });
  } catch (error) {
    logger.error("Delete user route error:", error);
    res.status(500).json({
      error: "Internal server error"
    });
  }
});

export default router;
