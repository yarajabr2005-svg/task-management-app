import mongoose from 'mongoose';

const refreshSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    tokenHash: {
      type: String,
      required: true,
      unique: true,
      select: false,
    },

    userAgent: {
      type: String,
      default: null,
      maxlength: 1000,
    },

    ip: {
      type: String,
      default: null,
      maxlength: 255,
    },

    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },

    revokedAt: {
      type: Date,
      default: null,
      index: true,
    },

    replacedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'RefreshSession',
      default: null,
    },

    reuseDetectedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

refreshSessionSchema.index({ userId: 1, revokedAt: 1 });

refreshSessionSchema.methods.toJSON = function toJSON() {
  const value = this.toObject();
  delete value.tokenHash;
  delete value.__v;
  return value;
};

export default mongoose.model('RefreshSession', refreshSessionSchema);