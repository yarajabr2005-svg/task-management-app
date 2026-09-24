import mongoose from 'mongoose';

const emailTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    hashedToken: {
      type: String,
      required: true,
      unique: true,
      select: false,
    },

    type: {
      type: String,
      enum: ['verification', 'reset'],
      required: true,
      index: true,
    },

    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },

    usedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  { timestamps: true },
);

emailTokenSchema.index({ userId: 1, type: 1, usedAt: 1 });

emailTokenSchema.methods.toJSON = function toJSON() {
  const value = this.toObject();
  delete value.hashedToken;
  delete value.__v;
  return value;
};

export default mongoose.model('EmailToken', emailTokenSchema);