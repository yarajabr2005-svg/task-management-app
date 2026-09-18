import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
    },

    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },

    // Soft delete (industry standard)
    isDeleted: {
      type: Boolean,
      default: false,
    },

    // Profile fields
    avatar: {
      type: String, // URL to image
      default: null,
    },

    bio: {
      type: String,
      trim: true,
      maxlength: 300, // prevents abuse + keeps UI clean
      default: "",
    },
  },
  { timestamps: true }
);

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.__v;
  return obj;
};


export default mongoose.model("User", userSchema);
