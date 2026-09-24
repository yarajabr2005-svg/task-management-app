import User from '../models/user.model.js';
import { consumeEmailToken, issueEmailToken } from './email-token.service.js';
import {
  createSession,
  revokeAllSessionsForUser,
  revokeSession,
  rotateSession,
} from './refresh-session.service.js';
import { comparePassword, hashPassword } from '../utils/password.js';
import {
  createAccessToken,
  createRefreshToken,
  verifyRefreshToken,
} from '../utils/jwt.js';
import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  ResourceNotFoundError,
  UnprocessableEntityError,
} from '../utils/errors.js';

const DEFAULT_TIMEZONE = 'UTC';
const MIN_PASSWORD_LENGTH = 8;

const MESSAGES = Object.freeze({
  verificationRequested: 'If the account can receive verification mail, a verification email has been sent.',
  passwordResetRequested: 'If the account exists, a password reset email has been sent.',
});

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : email;
}

function normalizeUsername(username) {
  return typeof username === 'string' ? username.trim().toLowerCase() : username;
}

function getUserId(user) {
  const userId = user?._id ?? user?.id ?? user?.userId;
  return userId === undefined || userId === null ? null : String(userId);
}

function toPublicUser(user) {
  return {
    id: getUserId(user),
    email: user.email,
    username: user.username,
    role: user.role,
    emailVerified: user.emailVerified,
    emailVerifiedAt: user.emailVerifiedAt ?? null,
    avatar: user.avatar ?? null,
    bio: user.bio ?? '',
    timezone: user.timezone ?? DEFAULT_TIMEZONE,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function passwordPolicyError() {
  return new UnprocessableEntityError(
    'Password does not meet the password policy.',
    undefined,
    'PASSWORD_POLICY_VIOLATION',
  );
}

function assertPasswordPolicy(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw passwordPolicyError();
  }
}

function invalidCurrentPasswordError() {
  return new AuthorizationError(
    'Current password is invalid.',
    undefined,
    'INVALID_CURRENT_PASSWORD',
  );
}

function getAccessTokenExpiresAt(accessToken) {
  const payload = accessToken.split('.')[1];
  const decodedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  return new Date(decodedPayload.exp * 1000).toISOString();
}

function getContext(options) {
  return { userAgent: options?.userAgent, ip: options?.ip };
}

function getModelQuery(model, method, filter) {
  const query = model[method](filter);
  return typeof query?.select === 'function' ? query.select('+passwordHash') : query;
}

async function findUserById(userId, UserModel) {
  return getModelQuery(UserModel, 'findOne', { _id: userId, isDeleted: false }).exec();
}

async function findUserByEmail(email, UserModel) {
  return getModelQuery(UserModel, 'findOne', { email, isDeleted: false }).exec();
}

async function sendTokenEmail(emailProvider, type, email, rawToken) {
  if (!emailProvider) return;

  const method = type === 'verification'
    ? 'sendVerificationEmail'
    : 'sendPasswordResetEmail';
  await emailProvider[method]({ to: email, token: rawToken });
}

function translateDuplicateKey(error) {
  if (error?.code !== 11000) return error;

  const duplicateField = Object.keys(error.keyPattern ?? error.keyValue ?? {})[0];
  if (duplicateField === 'email') {
    return new ConflictError('Email is already registered.', undefined, 'EMAIL_ALREADY_EXISTS');
  }
  if (duplicateField === 'username') {
    return new ConflictError('Username is already taken.', undefined, 'USERNAME_ALREADY_EXISTS');
  }
  return error;
}

export async function register(data, options = {}) {
  const UserModel = options.UserModel ?? User;
  const email = normalizeEmail(data?.email);
  const username = normalizeUsername(data?.username);
  assertPasswordPolicy(data?.password);

  const passwordHash = await hashPassword(data.password);
  let user;

  try {
    user = await UserModel.create({
      email,
      username,
      passwordHash,
      role: 'user',
      timezone: data.timezone?.trim() || DEFAULT_TIMEZONE,
      emailVerified: false,
      emailVerifiedAt: null,
    });
  } catch (error) {
    throw translateDuplicateKey(error);
  }

  if (options.createVerificationToken !== false) {
    const issued = await issueEmailToken({
      userId: getUserId(user),
      type: 'verification',
      EmailTokenModel: options.EmailTokenModel,
    });
    await sendTokenEmail(options.emailProvider, 'verification', email, issued.rawToken);
  }

  return {
    user: toPublicUser(user),
    message: 'Account created. Check your email to verify your account.',
  };
}

export async function login(credentials, options = {}) {
  const UserModel = options.UserModel ?? User;
  const user = await findUserByEmail(normalizeEmail(credentials?.email), UserModel);

  if (!user || !(await comparePassword(credentials?.password, user.passwordHash))) {
    throw new AuthenticationError('Invalid credentials.', undefined, 'INVALID_CREDENTIALS');
  }
  if (!user.emailVerified) {
    throw new AuthorizationError('Email must be verified before login.', undefined, 'EMAIL_NOT_VERIFIED');
  }

  const userId = getUserId(user);
  const accessToken = createAccessToken({ sub: userId, role: user.role });
  const refreshToken = createRefreshToken({ sub: userId });
  await createSession(user, refreshToken, getContext(options));

  return {
    user: toPublicUser(user),
    accessToken,
    refreshToken,
    accessTokenExpiresAt: getAccessTokenExpiresAt(accessToken),
  };
}

export async function refresh(refreshToken, options = {}) {
  const payload = verifyRefreshToken(refreshToken);
  const UserModel = options.UserModel ?? User;
  const user = await findUserById(payload.sub, UserModel);

  if (!user || !user.emailVerified) {
    throw new AuthenticationError('Refresh token is invalid.', undefined, 'INVALID_REFRESH_TOKEN');
  }

  const replacementToken = createRefreshToken({ sub: payload.sub });
  await rotateSession(refreshToken, replacementToken, getContext(options));
  const accessToken = createAccessToken({ sub: payload.sub, role: user.role });

  return {
    accessToken,
    refreshToken: replacementToken,
    accessTokenExpiresAt: getAccessTokenExpiresAt(accessToken),
  };
}

export async function logout(refreshToken) {
  if (typeof refreshToken !== 'string' || refreshToken.length === 0) return null;
  return revokeSession(refreshToken);
}

export async function logoutAll(userId) {
  return revokeAllSessionsForUser(userId);
}

export async function requestEmailVerification(user, options = {}) {
  if (!user || user.isDeleted || user.emailVerified) return MESSAGES.verificationRequested;

  const issued = await issueEmailToken({
    userId: getUserId(user),
    type: 'verification',
    EmailTokenModel: options.EmailTokenModel,
  });
  await sendTokenEmail(options.emailProvider, 'verification', user.email, issued.rawToken);
  return MESSAGES.verificationRequested;
}

export async function confirmEmailVerification(token, options = {}) {
  const tokenRecord = await consumeEmailToken({
    rawToken: token,
    type: 'verification',
    EmailTokenModel: options.EmailTokenModel,
  });
  const UserModel = options.UserModel ?? User;
  const updatedUser = await UserModel.findOneAndUpdate(
    { _id: tokenRecord.userId, isDeleted: false },
    { $set: { emailVerified: true, emailVerifiedAt: new Date() } },
    { new: true },
  ).exec();

  if (!updatedUser) throw new ResourceNotFoundError('User was not found.', undefined, 'USER_NOT_FOUND');
  return 'Email verified successfully.';
}

export async function requestPasswordReset(email, options = {}) {
  const UserModel = options.UserModel ?? User;
  const user = await findUserByEmail(normalizeEmail(email), UserModel);

  if (user) {
    const issued = await issueEmailToken({
      userId: getUserId(user),
      type: 'reset',
      EmailTokenModel: options.EmailTokenModel,
    });
    await sendTokenEmail(options.emailProvider, 'reset', user.email, issued.rawToken);
  }

  return MESSAGES.passwordResetRequested;
}

export async function resetPassword(token, newPassword, options = {}) {
  assertPasswordPolicy(newPassword);
  const tokenRecord = await consumeEmailToken({
    rawToken: token,
    type: 'reset',
    EmailTokenModel: options.EmailTokenModel,
  });
  const UserModel = options.UserModel ?? User;
  const passwordHash = await hashPassword(newPassword);
  const updatedUser = await UserModel.findOneAndUpdate(
    { _id: tokenRecord.userId, isDeleted: false },
    { $set: { passwordHash, passwordChangedAt: new Date() } },
    { new: true },
  ).exec();

  if (!updatedUser) throw new ResourceNotFoundError('User was not found.', undefined, 'USER_NOT_FOUND');
  await revokeAllSessionsForUser(tokenRecord.userId);
  return 'Password reset successfully. Please log in again.';
}

export async function changePassword(userId, currentPassword, newPassword, options = {}) {
  assertPasswordPolicy(newPassword);
  const UserModel = options.UserModel ?? User;
  const user = await findUserById(userId, UserModel);

  if (!user) throw new ResourceNotFoundError('User was not found.', undefined, 'USER_NOT_FOUND');
  let currentPasswordMatches = false;
  try {
    currentPasswordMatches = await comparePassword(currentPassword, user.passwordHash);
  } catch (_error) {
    throw invalidCurrentPasswordError();
  }
  if (!currentPasswordMatches) {
    throw invalidCurrentPasswordError();
  }

  const passwordHash = await hashPassword(newPassword);
  await UserModel.updateOne(
    { _id: userId, isDeleted: false },
    { $set: { passwordHash, passwordChangedAt: new Date() } },
  ).exec();
  await revokeAllSessionsForUser(userId);
  return 'Password changed successfully. Please log in again on your devices.';
}