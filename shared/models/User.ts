import mongoose, { Document, Schema } from "mongoose";

export interface IUser extends Document {
  email: string;
  password: string;
  name: string;
  role: "user" | "admin" | "moderator";
  upstoxAccessToken?: string;
  upstoxRefreshToken?: string;
  isActive: boolean;
  accessAllowed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: String,
      enum: ["user", "admin", "moderator"],
      default: "user",
      index: true,
    },
    upstoxAccessToken: {
      type: String,
      default: null,
    },
    upstoxRefreshToken: {
      type: String,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    accessAllowed: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient queries
UserSchema.index({ email: 1, isActive: 1 });
UserSchema.index({ role: 1, accessAllowed: 1 });

export default mongoose.models.User || mongoose.model<IUser>("User", UserSchema);