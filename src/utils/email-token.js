import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { AuthenticationError, GoneError } from './errors.js';

const EMAIL_TOKEN_BYTES = 32;
const TOKEN_TYPES = new Set(['verification', 'reset']);

export const EMAIL_TOKEN_TTL_MS = Object.freeze({
  verification: 30 * 60 * 1000,
  reset: 15 * 60 * 1000,
});

function getTokenErrorCode(type, suffix) {
  if (!TOKEN_TYPES.has(type)) {
    return suffix === 'EXPIRED' ? 'EMAIL_TOKEN_EXPIRED' : 'EMAIL_TOKEN_USED';
  }

  return `${type.toUpperCase()}_TOKEN_${suffix}`;
}

function validateRawToken(token) {
  if (typeof token !== 'string' || token.length === 0) {
    throw new AuthenticationError('Email token is invalid.', undefined, 'EMAIL_TOKEN_INVALID');
  }
}

export function generateEmailToken() {
  return randomBytes(EMAIL_TOKEN_BYTES).toString('base64url');
}

export function getEmailTokenExpiration(type, now = Date.now()) {
  if (!TOKEN_TYPES.has(type)) {
    throw new TypeError('Email token type must be "verification" or "reset".');
  }

  return new Date(now + EMAIL_TOKEN_TTL_MS[type]);
}

export function hashEmailToken(token) {
  validateRawToken(token);
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function verifyEmailToken(
  hashedTokenFromDb,
  rawTokenFromRequest,
  { expiresAt, usedAt, type, now = Date.now() } = {},
) {
  validateRawToken(rawTokenFromRequest);

  if (typeof hashedTokenFromDb !== 'string' || !/^[a-f0-9]{64}$/i.test(hashedTokenFromDb)) {
    throw new AuthenticationError('Email token is invalid.', undefined, 'EMAIL_TOKEN_INVALID');
  }

  if (usedAt !== undefined && usedAt !== null) {
    throw new GoneError(
      'Email token has already been used.',
      undefined,
      getTokenErrorCode(type, 'USED'),
    );
  }

  if (expiresAt !== undefined && new Date(expiresAt).getTime() <= new Date(now).getTime()) {
    throw new GoneError(
      'Email token has expired.',
      undefined,
      getTokenErrorCode(type, 'EXPIRED'),
    );
  }

  const expectedHash = Buffer.from(hashedTokenFromDb, 'hex');
  const actualHash = Buffer.from(hashEmailToken(rawTokenFromRequest), 'hex');

  if (expectedHash.length !== actualHash.length || !timingSafeEqual(expectedHash, actualHash)) {
    throw new AuthenticationError('Email token is invalid.', undefined, 'EMAIL_TOKEN_INVALID');
  }

  return true;
}