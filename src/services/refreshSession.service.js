import { createHash } from 'node:crypto';
import RefreshSession from '../models/RefreshSession.js';
import {
  AuthenticationError,
  ConflictError,
} from '../utils/errors.js';
import { verifyRefreshToken } from '../utils/jwt.js';

function hashRefreshToken(token) {
  if (typeof token !== 'string' || token.length === 0) {
    throw new TypeError('Refresh token must be a non-empty string.');
  }

  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function getUserId(user) {
  const userId = user?._id ?? user?.id ?? user?.userId;

  if (userId === undefined || userId === null || String(userId).length === 0) {
    throw new TypeError('A user with an id is required to create a refresh session.');
  }

  return userId;
}

function getExpirationDate(payload) {
  if (!Number.isInteger(payload.exp)) {
    throw new AuthenticationError('Refresh token is invalid.', undefined, 'INVALID_REFRESH_TOKEN');
  }

  return new Date(payload.exp * 1000);
}

function getContextValue(value) {
  return value === undefined || value === null ? null : String(value);
}

async function revokeAllSessions(userId, timestamp, markReuse = false) {
  const update = {
    $set: {
      revokedAt: timestamp,
      ...(markReuse ? { reuseDetectedAt: timestamp } : {}),
    },
  };

  return RefreshSession.updateMany(
    { userId, revokedAt: null },
    update,
  );
}

export async function createSession(user, refreshToken, context = {}) {
  const userId = getUserId(user);
  const payload = verifyRefreshToken(refreshToken);

  if (payload.sub !== String(userId)) {
    throw new AuthenticationError('Refresh token does not belong to this user.', undefined, 'INVALID_REFRESH_TOKEN');
  }

  return RefreshSession.create({
    userId,
    tokenHash: hashRefreshToken(refreshToken),
    userAgent: getContextValue(context.userAgent),
    ip: getContextValue(context.ip),
    expiresAt: getExpirationDate(payload),
  });
}

export async function rotateSession(oldToken, newToken, context = {}) {
  const oldPayload = verifyRefreshToken(oldToken);
  const newPayload = verifyRefreshToken(newToken);
  const oldTokenHash = hashRefreshToken(oldToken);

  if (oldPayload.sub !== newPayload.sub) {
    throw new AuthenticationError('Refresh token is invalid.', undefined, 'INVALID_REFRESH_TOKEN');
  }

  const currentSession = await RefreshSession.findOne({ tokenHash: oldTokenHash });

  if (!currentSession) {
    throw new AuthenticationError('Refresh token is invalid.', undefined, 'INVALID_REFRESH_TOKEN');
  }

  const now = new Date();

  if (currentSession.revokedAt || currentSession.reuseDetectedAt) {
    await revokeAllSessions(currentSession.userId, now, true);
    throw new ConflictError(
      'Refresh token reuse detected.',
      undefined,
      'REFRESH_TOKEN_REUSE_DETECTED',
    );
  }

  if (currentSession.expiresAt <= now) {
    await RefreshSession.updateOne(
      { _id: currentSession._id, revokedAt: null },
      { $set: { revokedAt: now } },
    );
    throw new AuthenticationError(
      'Refresh session is revoked or expired.',
      undefined,
      'REFRESH_SESSION_REVOKED',
    );
  }

  const replacement = await RefreshSession.create({
    userId: currentSession.userId,
    tokenHash: hashRefreshToken(newToken),
    userAgent: getContextValue(context.userAgent),
    ip: getContextValue(context.ip),
    expiresAt: getExpirationDate(newPayload),
  });

  const rotation = await RefreshSession.findOneAndUpdate(
    { _id: currentSession._id, revokedAt: null },
    { $set: { revokedAt: now, replacedBy: replacement._id } },
    { new: true },
  );

  if (!rotation) {
    await RefreshSession.deleteOne({ _id: replacement._id });
    await revokeAllSessions(currentSession.userId, now, true);
    throw new ConflictError(
      'Refresh token reuse detected.',
      undefined,
      'REFRESH_TOKEN_REUSE_DETECTED',
    );
  }

  return replacement;
}

export async function revokeSession(refreshToken) {
  const payload = verifyRefreshToken(refreshToken);
  const session = await RefreshSession.findOneAndUpdate(
    { tokenHash: hashRefreshToken(refreshToken), revokedAt: null },
    { $set: { revokedAt: new Date() } },
    { new: true },
  );

  if (!session) {
    return null;
  }

  if (session.userId.toString() !== payload.sub) {
    throw new AuthenticationError('Refresh token is invalid.', undefined, 'INVALID_REFRESH_TOKEN');
  }

  return session;
}

export async function revokeAllSessionsForUser(userId) {
  return revokeAllSessions(userId, new Date());
}

export { hashRefreshToken };