import User from '../models/user.model.js';
import { verifyAccessToken } from '../utils/jwt.js';
import { AuthenticationError, AuthorizationError } from '../utils/errors.js';

function getAuthorizationHeader(request) {
  const header = typeof request.get === 'function'
    ? request.get('authorization')
    : request.headers?.authorization;

  return Array.isArray(header) ? null : header;
}

function getBearerToken(request) {
  const header = getAuthorizationHeader(request);

  if (typeof header !== 'string') {
    throw new AuthenticationError();
  }

  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  if (!match) {
    throw new AuthenticationError(
      'A valid Bearer access token is required.',
      undefined,
      'UNAUTHENTICATED',
    );
  }

  return match[1];
}

function getUserId(user) {
  const userId = user?._id ?? user?.id;
  return userId === undefined || userId === null ? null : String(userId);
}

function toAuthenticatedUser(user) {
  return {
    id: getUserId(user),
    email: user.email,
    username: user.username,
    role: user.role,
    emailVerified: user.emailVerified,
    emailVerifiedAt: user.emailVerifiedAt ?? null,
    avatar: user.avatar ?? null,
    bio: user.bio ?? '',
    timezone: user.timezone ?? 'UTC',
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

async function findActiveUser(UserModel, userId) {
  const query = UserModel.findOne({ _id: userId, isDeleted: false });
  return typeof query?.exec === 'function' ? query.exec() : query;
}

export function createRequireAuth({ UserModel = User, verifyToken = verifyAccessToken } = {}) {
  return async function requireAuth(request, _response, _next) {
    const token = getBearerToken(request);
    const payload = verifyToken(token);
    let user;

    try {
      user = await findActiveUser(UserModel, payload.sub);
    } catch (error) {
      if (error?.name === 'CastError') {
        throw new AuthenticationError();
      }
      throw error;
    }

    if (!user) {
      throw new AuthenticationError();
    }

    if (user.isDisabled === true) {
      throw new AuthorizationError(
        'This account is disabled.',
        undefined,
        'ACCOUNT_DISABLED',
      );
    }

    request.user = toAuthenticatedUser(user);
  };
}

export const requireAuth = createRequireAuth();