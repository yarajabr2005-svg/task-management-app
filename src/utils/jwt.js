import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { AuthenticationError } from './errors.js';

const ALGORITHM = 'HS256';
const DEFAULT_ISSUER = 'task-management-api';
const DEFAULT_AUDIENCE = 'task-management-client';

function getJwtConfig(kind) {
  const prefix = kind === 'access' ? 'JWT_ACCESS' : 'JWT_REFRESH';
  const secret = process.env[`${prefix}_SECRET`]?.trim();
  const expiresIn = process.env[`${prefix}_EXPIRES_IN`]?.trim();

  if (!secret) {
    throw new Error(`${prefix}_SECRET must be configured.`);
  }

  if (!expiresIn) {
    throw new Error(`${prefix}_EXPIRES_IN must be configured.`);
  }

  return {
    secret,
    expiresIn,
    issuer: process.env.JWT_ISSUER?.trim() || DEFAULT_ISSUER,
    audience: process.env.JWT_AUDIENCE?.trim() || DEFAULT_AUDIENCE,
  };
}

function getAllowedClaims(payload, allowedClaims, tokenName) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError(`${tokenName} payload must be an object.`);
  }

  const unsupportedClaims = Object.keys(payload).filter(
    (claim) => !allowedClaims.includes(claim),
  );

  if (unsupportedClaims.length > 0) {
    throw new TypeError(
      `${tokenName} payload contains unsupported claim(s): ${unsupportedClaims.join(', ')}.`,
    );
  }

  const claims = Object.fromEntries(
    allowedClaims
      .filter((claim) => payload[claim] !== undefined)
      .map((claim) => [claim, payload[claim]]),
  );

  if (typeof claims.sub !== 'string' || claims.sub.length === 0) {
    throw new TypeError(`${tokenName} payload requires a non-empty "sub" claim.`);
  }

  return claims;
}

function signToken(payload, kind) {
  const config = getJwtConfig(kind);
  const allowedClaims = kind === 'access' ? ['sub', 'role'] : ['sub', 'jti'];
  const claims = getAllowedClaims(payload, allowedClaims, `${kind} token`);

  if (kind === 'access' && !['user', 'admin'].includes(claims.role)) {
    throw new TypeError('Access token payload requires role "user" or "admin".');
  }

  if (kind === 'refresh' && claims.jti === undefined) {
    claims.jti = randomUUID();
  }

  return jwt.sign(claims, config.secret, {
    algorithm: ALGORITHM,
    audience: config.audience,
    expiresIn: config.expiresIn,
    issuer: config.issuer,
  });
}

function verifyToken(token, kind) {
  const config = getJwtConfig(kind);
  const errorCode = kind === 'refresh' ? 'INVALID_REFRESH_TOKEN' : 'UNAUTHENTICATED';
  const tokenName = kind === 'refresh' ? 'refresh token' : 'access token';

  try {
    const payload = jwt.verify(token, config.secret, {
      algorithms: [ALGORITHM],
      audience: config.audience,
      issuer: config.issuer,
    });

    if (!payload || typeof payload !== 'object') {
      throw new Error('JWT payload is not an object.');
    }

    const allowedClaims = kind === 'access'
      ? ['sub', 'role', 'iss', 'aud', 'iat', 'exp']
      : ['sub', 'jti', 'iss', 'aud', 'iat', 'exp'];
    const unexpectedClaim = Object.keys(payload).find(
      (claim) => !allowedClaims.includes(claim),
    );

    if (unexpectedClaim) {
      throw new Error('JWT contains an unsupported claim.');
    }

    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      throw new Error('JWT subject is invalid.');
    }

    if (kind === 'access' && !['user', 'admin'].includes(payload.role)) {
      throw new Error('JWT role is invalid.');
    }

    if (kind === 'refresh' && typeof payload.jti !== 'string') {
      throw new Error('Refresh JWT identifier is invalid.');
    }

    return payload;
  } catch (_error) {
    throw new AuthenticationError(
      kind === 'refresh' ? 'Refresh token is invalid or expired.' : 'Access token is invalid or expired.',
      undefined,
      errorCode,
    );
  }
}

export function createAccessToken(payload) {
  return signToken(payload, 'access');
}

export function verifyAccessToken(token) {
  return verifyToken(token, 'access');
}

export function createRefreshToken(payload) {
  return signToken(payload, 'refresh');
}

export function verifyRefreshToken(token) {
  return verifyToken(token, 'refresh');
}