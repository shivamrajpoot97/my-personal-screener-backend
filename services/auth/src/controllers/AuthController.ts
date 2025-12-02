import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { User, IUser, config, logger } from "../../../../shared";

export class AuthController {
  private jwtSecret: string;
  private jwtExpiresIn: string;
  private jwtRefreshExpiresIn: string;
  private bcryptRounds: number;

  constructor() {
    this.jwtSecret = config.jwt.secret;
    this.jwtExpiresIn = config.jwt.accessTokenExpiry;
    this.jwtRefreshExpiresIn = config.jwt.refreshTokenExpiry;
    this.bcryptRounds = config.security.bcryptRounds;
  }

  async register(email: string, password: string, name: string, role: string = "user") {
    try {
      // Check if user already exists
      const existingUser = await User.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return {
          success: false,
          message: "User with this email already exists",
        };
      }

      // Validate role
      if (!["user", "admin", "moderator"].includes(role)) {
        role = "user";
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, this.bcryptRounds);

      // Create user
      const user = new User({
        email: email.toLowerCase(),
        password: hashedPassword,
        name,
        role,
      });

      await user.save();

      // Generate tokens
      const tokens = this.generateTokens(user._id.toString(), user.email, user.role);

      logger.info(`User registered successfully: ${user.email}`);

      return {
        success: true,
        message: "User registered successfully",
        ...tokens,
        user: this.sanitizeUser(user),
      };
    } catch (error) {
      logger.error("Registration error:", error);
      return {
        success: false,
        message: "Internal server error during registration",
      };
    }
  }

  async login(email: string, password: string) {
    try {
      // Find user
      const user = await User.findOne({ 
        email: email.toLowerCase(),
        isActive: true 
      });

      if (!user) {
        return {
          success: false,
          message: "Invalid email or password",
        };
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return {
          success: false,
          message: "Invalid email or password",
        };
      }

      // Check if access is allowed
      if (!user.accessAllowed) {
        return {
          success: false,
          message: "Your account is pending approval. Please contact the administrator for account activation.",
        };
      }

      // Generate tokens
      const tokens = this.generateTokens(user._id.toString(), user.email, user.role);

      logger.info(`User logged in successfully: ${user.email}`);

      return {
        success: true,
        message: "Login successful",
        ...tokens,
        user: this.sanitizeUser(user),
      };
    } catch (error) {
      logger.error("Login error:", error);
      return {
        success: false,
        message: "Internal server error during login",
      };
    }
  }

  async validateToken(token: string) {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as any;
      
      // Check if user still exists and is active
      const user = await User.findById(decoded.userId).select("-password");
      if (!user || !user.isActive) {
        return {
          valid: false,
          message: "User not found or inactive",
        };
      }

      return {
        valid: true,
        userId: decoded.userId,
        email: decoded.email,
        role: decoded.role,
        message: "Token is valid",
      };
    } catch (error) {
      return {
        valid: false,
        message: "Invalid token",
      };
    }
  }

  async refreshToken(refreshToken: string) {
    try {
      const decoded = jwt.verify(refreshToken, this.jwtSecret) as any;
      
      // Check if user still exists and is active
      const user = await User.findById(decoded.userId);
      if (!user || !user.isActive) {
        return {
          success: false,
          message: "User not found or inactive",
        };
      }

      // Generate new tokens
      const tokens = this.generateTokens(user._id.toString(), user.email, user.role);

      return {
        success: true,
        message: "Token refreshed successfully",
        ...tokens,
        user: this.sanitizeUser(user),
      };
    } catch (error) {
      return {
        success: false,
        message: "Invalid refresh token",
      };
    }
  }

  async getUserById(userId: string) {
    try {
      const user = await User.findById(userId).select("-password");
      if (!user) {
        return {
          success: false,
          message: "User not found",
        };
      }

      return {
        success: true,
        message: "User retrieved successfully",
        user: this.sanitizeUser(user),
      };
    } catch (error) {
      logger.error("Get user by ID error:", error);
      return {
        success: false,
        message: "Internal server error",
      };
    }
  }

  async updateUser(userId: string, updates: Partial<IUser>) {
    try {
      const allowedUpdates = ["name", "role", "isActive", "accessAllowed", "upstoxAccessToken", "upstoxRefreshToken"];
      const filteredUpdates: any = {};

      // Filter allowed updates
      Object.keys(updates).forEach(key => {
        if (allowedUpdates.includes(key)) {
          filteredUpdates[key] = updates[key as keyof IUser];
        }
      });

      const user = await User.findByIdAndUpdate(
        userId,
        filteredUpdates,
        { new: true, runValidators: true }
      ).select("-password");

      if (!user) {
        return {
          success: false,
          message: "User not found",
        };
      }

      logger.info(`User updated successfully: ${user.email}`);

      return {
        success: true,
        message: "User updated successfully",
        user: this.sanitizeUser(user),
      };
    } catch (error) {
      logger.error("Update user error:", error);
      return {
        success: false,
        message: "Internal server error",
      };
    }
  }

  async getAllUsers(page: number = 1, limit: number = 10, role?: string, isActive?: boolean) {
    try {
      const query: any = {};
      if (role) query.role = role;
      if (typeof isActive === "boolean") query.isActive = isActive;

      const skip = (page - 1) * limit;
      const total = await User.countDocuments(query);
      const users = await User.find(query)
        .select("-password")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const totalPages = Math.ceil(total / limit);

      return {
        success: true,
        message: "Users retrieved successfully",
        users: users.map(user => this.sanitizeUser(user)),
        total,
        page,
        totalPages,
      };
    } catch (error) {
      logger.error("Get all users error:", error);
      return {
        success: false,
        message: "Internal server error",
        users: [],
        total: 0,
        page: 1,
        totalPages: 0,
      };
    }
  }

  async deleteUser(userId: string) {
    try {
      const user = await User.findByIdAndDelete(userId);
      if (!user) {
        return {
          success: false,
          message: "User not found",
        };
      }

      logger.info(`User deleted successfully: ${user.email}`);

      return {
        success: true,
        message: "User deleted successfully",
      };
    } catch (error) {
      logger.error("Delete user error:", error);
      return {
        success: false,
        message: "Internal server error",
      };
    }
  }

  private generateTokens(userId: string, email: string, role: string) {
    const accessToken = jwt.sign(
      { userId, email, role },
      this.jwtSecret,
      { expiresIn: this.jwtExpiresIn }
    );

    const refreshToken = jwt.sign(
      { userId, email, role },
      this.jwtSecret,
      { expiresIn: this.jwtRefreshExpiresIn }
    );

    return { accessToken, refreshToken };
  }

  private sanitizeUser(user: any) {
    const userObj = user.toObject ? user.toObject() : user;
    delete userObj.password;
    return {
      id: userObj._id.toString(),
      email: userObj.email,
      name: userObj.name,
      role: userObj.role,
      isActive: userObj.isActive,
      accessAllowed: userObj.accessAllowed,
      upstoxAccessToken: userObj.upstoxAccessToken || "",
      upstoxRefreshToken: userObj.upstoxRefreshToken || "",
      createdAt: userObj.createdAt?.toISOString() || "",
      updatedAt: userObj.updatedAt?.toISOString() || "",
    };
  }
}
